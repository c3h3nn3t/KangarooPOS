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
  private _initialized = false;

  get isOnline(): boolean {
    return this._isOnline;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the hybrid adapter by loading pending sync entries from the database.
   * This should be called on application startup before processing any requests.
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      logger.debug('HybridAdapter already initialized');
      return;
    }

    logger.info('Initializing HybridAdapter - loading pending sync entries...');

    try {
      // Load pending and failed entries from edge database sync_journal table
      const result = await edgeDb.select<SyncJournalEntry>('sync_journal', {
        where: [
          { column: 'status', operator: 'in', value: ['pending', 'failed', 'syncing'] }
        ],
        orderBy: [{ column: 'timestamp', direction: 'asc' }]
      });

      if (!result.error && result.data) {
        // Map database column names to interface names (snake_case to camelCase)
        this.syncQueue = result.data.map((entry) => {
          const dbEntry = entry as unknown as Record<string, unknown>;
          
          // Parse data from JSON string to object
          let parsedData: Record<string, unknown>;
          try {
            const dataStr = typeof dbEntry.data === 'string' ? dbEntry.data : JSON.stringify(dbEntry.data);
            parsedData = JSON.parse(dataStr) as Record<string, unknown>;
          } catch (error) {
            logger.warn({ entryId: entry.id, error }, 'Failed to parse sync entry data, using empty object');
            parsedData = {};
          }

          return {
            id: entry.id,
            operation: entry.operation,
            table: (dbEntry.table_name as string) ?? entry.table ?? '',
            recordId: (dbEntry.record_id as string) ?? entry.recordId ?? '',
            data: parsedData,
            timestamp: entry.timestamp,
            edgeNodeId: (dbEntry.edge_node_id as string) ?? entry.edgeNodeId ?? '',
            status: entry.status === 'syncing' ? 'pending' : entry.status, // Reset syncing to pending
            checksum: entry.checksum,
            attempts: entry.attempts,
            lastAttempt: (dbEntry.last_attempt as string) ?? entry.lastAttempt ?? null,
            error: entry.error
          };
        });

        logger.info(
          { pendingCount: this.syncQueue.length },
          'Loaded pending sync entries from database'
        );

        // Reset any 'syncing' entries back to 'pending' (they were interrupted)
        const syncingEntries = result.data.filter((e) => e.status === 'syncing');
        for (const entry of syncingEntries) {
          await edgeDb.update('sync_journal', entry.id, { status: 'pending' });
        }
      } else if (result.error) {
        // Table might not exist yet, create it
        logger.warn({ error: result.error }, 'Failed to load sync entries, table may not exist');
      }

      this._initialized = true;
      logger.info('HybridAdapter initialization complete');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize HybridAdapter');
      // Still mark as initialized to prevent blocking, but log the error
      this._initialized = true;
    }
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

    // Add to in-memory queue
    this.syncQueue.push(entry);

    // Persist to edge database sync_journal table with snake_case column names
    const dbEntry = {
      id: entry.id,
      operation: entry.operation,
      table_name: entry.table, // 'table' is a reserved word in SQL
      record_id: entry.recordId,
      data: JSON.stringify(entry.data),
      timestamp: entry.timestamp,
      edge_node_id: entry.edgeNodeId,
      status: entry.status,
      checksum: entry.checksum,
      attempts: entry.attempts
    };

    await edgeDb.insert('sync_journal', dbEntry);

    logger.debug({ entryId: entry.id, operation, table }, 'Operation queued for sync');
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
    await edgeDb.update('sync_journal', entryId, {
      status: 'synced',
      synced_at: nowISO()
    });

    logger.debug({ entryId }, 'Sync entry marked as synced');
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
      last_attempt: nowISO()
    });

    logger.warn({ entryId, error, attempts: entry?.attempts }, 'Sync entry marked as failed');
  }

  // Mark entry as conflict
  async markConflict(entryId: string, message: string): Promise<void> {
    const entry = this.syncQueue.find((e) => e.id === entryId);
    if (entry) {
      entry.status = 'conflict';
      entry.error = message;
      entry.lastAttempt = nowISO();
    }
    await edgeDb.update('sync_journal', entryId, {
      status: 'conflict',
      error: message,
      last_attempt: nowISO()
    });

    logger.warn({ entryId, message }, 'Sync entry marked as conflict');
  }

  // Get sync queue statistics
  getSyncStats(): { pending: number; failed: number; conflict: number; total: number } {
    const pending = this.syncQueue.filter((e) => e.status === 'pending').length;
    const failed = this.syncQueue.filter((e) => e.status === 'failed').length;
    const conflict = this.syncQueue.filter((e) => e.status === 'conflict').length;
    return { pending, failed, conflict, total: this.syncQueue.length };
  }

  // Remove synced entries from in-memory queue (cleanup)
  cleanupSyncedEntries(): void {
    this.syncQueue = this.syncQueue.filter((e) => e.status !== 'synced');
  }
}

export const db = new HybridAdapter();
