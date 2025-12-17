import { config } from '../config/env';
import { nowISO } from '../utils/datetime';
import { generateId } from '../utils/idempotency';
import { logger } from '../utils/logger';
import { cloudDb } from './cloud-adapter';
import { edgeDb } from './edge-adapter';
import type {
  DatabaseAdapter,
  DatabaseType,
  MutationResult,
  QueryResult,
  SelectOptions,
  SingleResult,
  SyncJournalEntry,
  TransactionContext
} from './types';

// Tables that can only be modified when online (read-only on edge)
const CLOUD_ONLY_WRITE_TABLES = [
  'products',
  'product_variants',
  'product_categories',
  'modifiers',
  'tax_rules'
];

// Tables that can be modified offline and synced later
const OFFLINE_WRITE_TABLES = [
  'orders',
  'order_items',
  'payments',
  'refunds',
  'customers',
  'shifts'
];

export class HybridAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = 'cloud';
  private _isOnline = true;
  private syncQueue: SyncJournalEntry[] = [];

  get isOnline(): boolean {
    return this._isOnline;
  }

  setOnlineStatus(online: boolean): void {
    this._isOnline = online;
    edgeDb.setOnlineStatus(online);
    logger.info({ online }, 'Connection status changed');
  }

  private getActiveDb(): DatabaseAdapter {
    return this._isOnline ? cloudDb : edgeDb;
  }

  private canWriteOffline(table: string): boolean {
    // Check if refunds are allowed offline
    if (table === 'refunds' && !config.features.offlineRefundsEnabled) {
      return false;
    }
    return OFFLINE_WRITE_TABLES.includes(table);
  }

  private isReadOnlyOffline(table: string): boolean {
    return !this._isOnline && CLOUD_ONLY_WRITE_TABLES.includes(table);
  }

  async select<T>(table: string, options?: SelectOptions): Promise<QueryResult<T>> {
    // For reads, try cloud first, fallback to edge
    if (this._isOnline) {
      const result = await cloudDb.select<T>(table, options);
      if (!result.error) {
        return result;
      }
      logger.warn({ table, error: result.error }, 'Cloud read failed, falling back to edge');
    }

    return edgeDb.select<T>(table, options);
  }

  async selectOne<T>(table: string, id: string): Promise<SingleResult<T>> {
    if (this._isOnline) {
      const result = await cloudDb.selectOne<T>(table, id);
      if (!result.error) {
        return result;
      }
      logger.warn({ table, id, error: result.error }, 'Cloud read failed, falling back to edge');
    }

    return edgeDb.selectOne<T>(table, id);
  }

  async insert<T>(table: string, data: Partial<T>): Promise<MutationResult<T>> {
    // Check if this table can be written offline
    if (this.isReadOnlyOffline(table)) {
      return {
        data: null,
        error: `Cannot create ${table} records while offline`
      };
    }

    if (this._isOnline) {
      // Online: write to cloud
      const result = await cloudDb.insert<T>(table, data);
      if (!result.error) {
        // Also write to edge for offline cache
        await edgeDb.insert(table, data);
      }
      return result;
    }

    // Offline: write to edge and queue for sync
    if (!this.canWriteOffline(table)) {
      return {
        data: null,
        error: `Cannot create ${table} records while offline`
      };
    }

    const result = await edgeDb.insert<T>(table, data);
    if (!result.error && result.data) {
      await this.queueForSync('insert', table, result.data as Record<string, unknown>);
    }
    return result;
  }

  async insertMany<T>(table: string, data: Partial<T>[]): Promise<MutationResult<T[]>> {
    if (this.isReadOnlyOffline(table)) {
      return {
        data: null,
        error: `Cannot create ${table} records while offline`
      };
    }

    if (this._isOnline) {
      const result = await cloudDb.insertMany<T>(table, data);
      if (!result.error && result.data) {
        await edgeDb.insertMany(table, data);
      }
      return result;
    }

    if (!this.canWriteOffline(table)) {
      return {
        data: null,
        error: `Cannot create ${table} records while offline`
      };
    }

    const result = await edgeDb.insertMany<T>(table, data);
    if (!result.error && result.data) {
      for (const item of result.data) {
        await this.queueForSync('insert', table, item as Record<string, unknown>);
      }
    }
    return result;
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<MutationResult<T>> {
    if (this.isReadOnlyOffline(table)) {
      return {
        data: null,
        error: `Cannot update ${table} records while offline`
      };
    }

    if (this._isOnline) {
      const result = await cloudDb.update<T>(table, id, data);
      if (!result.error) {
        await edgeDb.update(table, id, data);
      }
      return result;
    }

    if (!this.canWriteOffline(table)) {
      return {
        data: null,
        error: `Cannot update ${table} records while offline`
      };
    }

    const result = await edgeDb.update<T>(table, id, data);
    if (!result.error && result.data) {
      await this.queueForSync('update', table, { id, ...data } as Record<string, unknown>);
    }
    return result;
  }

  async delete(table: string, id: string): Promise<MutationResult<{ id: string }>> {
    if (this.isReadOnlyOffline(table)) {
      return {
        data: null,
        error: `Cannot delete ${table} records while offline`
      };
    }

    if (this._isOnline) {
      const result = await cloudDb.delete(table, id);
      if (!result.error) {
        await edgeDb.delete(table, id);
      }
      return result;
    }

    if (!this.canWriteOffline(table)) {
      return {
        data: null,
        error: `Cannot delete ${table} records while offline`
      };
    }

    const result = await edgeDb.delete(table, id);
    if (!result.error) {
      await this.queueForSync('delete', table, { id });
    }
    return result;
  }

  async transaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.getActiveDb().transaction(callback);
  }

  // Queue operation for sync when back online
  private async queueForSync(
    operation: 'insert' | 'update' | 'delete',
    table: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const entry: SyncJournalEntry = {
      id: generateId(),
      operation,
      table,
      recordId: (data.id as string) ?? generateId(),
      data,
      timestamp: nowISO(),
      edgeNodeId: config.edge.nodeId ?? 'unknown',
      status: 'pending',
      checksum: this.computeChecksum(data),
      attempts: 0
    };

    this.syncQueue.push(entry);

    // Also persist to edge database sync journal table
    await edgeDb.insert('sync_journal', entry);

    logger.debug({ entry }, 'Operation queued for sync');
  }

  private computeChecksum(data: Record<string, unknown>): string {
    // Simple checksum using JSON stringify hash
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // Get pending sync entries
  getPendingSyncEntries(): SyncJournalEntry[] {
    return [...this.syncQueue];
  }

  // Mark entry as synced
  async markSynced(entryId: string): Promise<void> {
    const index = this.syncQueue.findIndex((e) => e.id === entryId);
    if (index !== -1) {
      this.syncQueue.splice(index, 1);
    }
    await edgeDb.update('sync_journal', entryId, { status: 'synced' });
  }

  // Mark entry as failed
  async markFailed(entryId: string, error: string): Promise<void> {
    const entry = this.syncQueue.find((e) => e.id === entryId);
    if (entry) {
      entry.status = 'failed';
      entry.error = error;
      entry.attempts++;
      entry.lastAttempt = nowISO();
    }
    await edgeDb.update('sync_journal', entryId, {
      status: 'failed',
      error,
      attempts: entry?.attempts ?? 1,
      lastAttempt: nowISO()
    });
  }
}

export const db = new HybridAdapter();
