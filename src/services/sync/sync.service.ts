import { config } from '../../config/env';
import { db } from '../../db';
import { cloudDb } from '../../db/cloud-adapter';
import { edgeDb } from '../../db/edge-adapter';
import type { HybridAdapter } from '../../db/hybrid-adapter';
import type { SyncJournalEntry } from '../../db/types';
import type {
  ConflictResolution,
  ConflictType,
  SyncConflict,
  SyncJournal,
  SyncOperation,
  SyncStatus
} from '../../types/database';
import { nowISO } from '../../utils/datetime';
import { ValidationError } from '../../utils/errors';
import { generateId } from '../../utils/idempotency';
import { logger } from '../../utils/logger';
import { BaseService } from '../base.service';

export interface SyncStatusInfo {
  is_online: boolean;
  pending_count: number;
  last_sync_at: string | null;
  sync_in_progress: boolean;
  failed_count: number;
  conflict_count: number;
}

export interface SyncResult {
  synced_count: number;
  failed_count: number;
  conflict_count: number;
  errors: Array<{ entry_id: string; error: string }>;
  conflicts: Array<{ entry_id: string; conflict_type: ConflictType }>;
}

export interface ConflictResolutionInput {
  conflict_id: string;
  account_id: string;
  resolution: ConflictResolution;
  resolved_data?: Record<string, unknown>;
  resolved_by: string;
}

export interface PullDataInput {
  account_id: string;
  store_id?: string;
  tables?: string[];
  since?: string;
}

export class SyncService extends BaseService {
  private syncInProgress = false;
  private lastSyncAt: string | null = null;
  private hybridDb: HybridAdapter;

  constructor() {
    super();
    this.hybridDb = db as unknown as HybridAdapter;
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(accountId: string): Promise<SyncStatusInfo> {
    const pendingEntries = await this.getPendingEntries(accountId);
    const failedEntries = pendingEntries.filter((e) => e.status === 'failed');
    const conflicts = await this.getConflicts(accountId);

    return {
      is_online: this.hybridDb.isOnline,
      pending_count: pendingEntries.length,
      last_sync_at: this.lastSyncAt,
      sync_in_progress: this.syncInProgress,
      failed_count: failedEntries.length,
      conflict_count: conflicts.length
    };
  }

  /**
   * Get pending sync journal entries
   */
  async getPendingEntries(accountId: string): Promise<SyncJournal[]> {
    const result = await edgeDb.select<SyncJournal>('sync_journal', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'status', operator: '=' as const, value: 'pending' }
      ],
      orderBy: [{ column: 'created_at', direction: 'asc' as const }]
    });

    if (result.error) {
      logger.error({ error: result.error }, 'Failed to fetch pending entries');
      return [];
    }

    return result.data;
  }

  /**
   * Get all sync journal entries for an account
   */
  async getSyncJournal(
    accountId: string,
    options?: {
      status?: SyncStatus;
      table_name?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<SyncJournal[]> {
    const where: Array<{ column: string; operator: '='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: accountId }
    ];

    if (options?.status) {
      where.push({ column: 'status', operator: '=' as const, value: options.status });
    }

    if (options?.table_name) {
      where.push({ column: 'table_name', operator: '=' as const, value: options.table_name });
    }

    const result = await edgeDb.select<SyncJournal>('sync_journal', {
      where,
      limit: options?.limit || 100,
      offset: options?.offset,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch sync journal: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Trigger manual sync
   */
  async triggerSync(accountId: string): Promise<SyncResult> {
    if (this.syncInProgress) {
      throw new ValidationError('Sync already in progress');
    }

    if (!this.hybridDb.isOnline) {
      throw new ValidationError('Cannot sync while offline');
    }

    this.syncInProgress = true;
    const result: SyncResult = {
      synced_count: 0,
      failed_count: 0,
      conflict_count: 0,
      errors: [],
      conflicts: []
    };

    try {
      const pendingEntries = await this.getPendingEntries(accountId);

      for (const entry of pendingEntries) {
        try {
          await this.syncEntry(entry);
          result.synced_count++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Check if this is a conflict
          if (this.isConflictError(error)) {
            const conflict = await this.createConflict(entry, error);
            result.conflict_count++;
            result.conflicts.push({
              entry_id: entry.id,
              conflict_type: conflict.conflict_type
            });
          } else {
            result.failed_count++;
            result.errors.push({
              entry_id: entry.id,
              error: errorMessage
            });
            await this.markEntryFailed(entry.id, errorMessage);
          }
        }
      }

      this.lastSyncAt = nowISO();
      logger.info({ accountId, result }, 'Sync completed');

      return result;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync a single entry to cloud
   */
  private async syncEntry(entry: SyncJournal): Promise<void> {
    const table = entry.table_name;
    const data = entry.data as Record<string, unknown>;

    switch (entry.operation) {
      case 'insert': {
        const insertResult = await cloudDb.insert(table, data);
        if (insertResult.error) {
          throw new Error(insertResult.error);
        }
        break;
      }
      case 'update': {
        const updateResult = await cloudDb.update(table, entry.record_id, data);
        if (updateResult.error) {
          throw new Error(updateResult.error);
        }
        break;
      }
      case 'delete': {
        const deleteResult = await cloudDb.delete(table, entry.record_id);
        if (deleteResult.error) {
          throw new Error(deleteResult.error);
        }
        break;
      }
    }

    await this.markEntrySynced(entry.id);
  }

  /**
   * Mark entry as synced
   */
  private async markEntrySynced(entryId: string): Promise<void> {
    await edgeDb.update('sync_journal', entryId, {
      status: 'synced',
      synced_at: nowISO()
    });
  }

  /**
   * Mark entry as failed
   */
  private async markEntryFailed(entryId: string, error: string): Promise<void> {
    // Get current entry
    const result = await edgeDb.selectOne<SyncJournal>('sync_journal', entryId);
    const currentAttempts = result.data?.attempts || 0;

    await edgeDb.update('sync_journal', entryId, {
      status: 'failed',
      error,
      attempts: currentAttempts + 1,
      last_attempt_at: nowISO()
    });
  }

  /**
   * Check if error is a conflict
   */
  private isConflictError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('conflict') ||
        message.includes('version mismatch') ||
        message.includes('already exists') ||
        message.includes('constraint violation')
      );
    }
    return false;
  }

  /**
   * Create a sync conflict record
   */
  private async createConflict(
    entry: SyncJournal,
    error: unknown
  ): Promise<SyncConflict> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Determine conflict type
    let conflictType: ConflictType = 'version';
    if (errorMessage.includes('already exists')) {
      conflictType = 'constraint';
    } else if (errorMessage.includes('not found') || errorMessage.includes('deleted')) {
      conflictType = 'delete';
    }

    // Try to fetch remote data for comparison
    let remoteData: Record<string, unknown> = {};
    try {
      const remoteResult = await cloudDb.selectOne(entry.table_name, entry.record_id);
      if (remoteResult.data) {
        remoteData = remoteResult.data as Record<string, unknown>;
      }
    } catch {
      // Remote data not available
    }

    const conflict: Partial<SyncConflict> = {
      id: generateId(),
      sync_journal_id: entry.id,
      conflict_type: conflictType,
      local_data: entry.data,
      remote_data: remoteData,
      resolution: null,
      resolved_data: null,
      resolved_by: null,
      resolved_at: null
    };

    await edgeDb.insert('sync_conflicts', conflict);

    // Update journal entry status
    await edgeDb.update('sync_journal', entry.id, {
      status: 'conflict'
    });

    return conflict as SyncConflict;
  }

  /**
   * Get unresolved conflicts
   */
  async getConflicts(accountId: string): Promise<SyncConflict[]> {
    // Get journal entries with conflict status
    const journalResult = await edgeDb.select<SyncJournal>('sync_journal', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'status', operator: '=' as const, value: 'conflict' }
      ]
    });

    if (journalResult.error || !journalResult.data.length) {
      return [];
    }

    const journalIds = journalResult.data.map((j) => j.id);

    // Get conflicts for these journal entries
    const conflicts: SyncConflict[] = [];
    for (const journalId of journalIds) {
      const conflictResult = await edgeDb.select<SyncConflict>('sync_conflicts', {
        where: [{ column: 'sync_journal_id', operator: '=' as const, value: journalId }]
      });

      if (!conflictResult.error && conflictResult.data.length) {
        conflicts.push(...conflictResult.data.filter((c) => !c.resolved_at));
      }
    }

    return conflicts;
  }

  /**
   * Resolve a sync conflict
   */
  async resolveConflict(input: ConflictResolutionInput): Promise<SyncConflict> {
    const conflictResult = await edgeDb.selectOne<SyncConflict>('sync_conflicts', input.conflict_id);

    if (conflictResult.error || !conflictResult.data) {
      throw new ValidationError('Conflict not found');
    }

    const conflict = conflictResult.data;

    // Get the journal entry
    const journalResult = await edgeDb.selectOne<SyncJournal>(
      'sync_journal',
      conflict.sync_journal_id
    );

    if (journalResult.error || !journalResult.data) {
      throw new ValidationError('Sync journal entry not found');
    }

    const journal = journalResult.data;

    // Determine resolved data based on resolution type
    let resolvedData: Record<string, unknown>;
    switch (input.resolution) {
      case 'local_wins':
        resolvedData = conflict.local_data;
        break;
      case 'remote_wins':
        resolvedData = conflict.remote_data;
        break;
      case 'merged':
      case 'manual':
        if (!input.resolved_data) {
          throw new ValidationError('Resolved data required for merged/manual resolution');
        }
        resolvedData = input.resolved_data;
        break;
      default:
        throw new ValidationError('Invalid resolution type');
    }

    // Apply the resolution
    if (this.hybridDb.isOnline) {
      try {
        if (journal.operation === 'delete') {
          if (input.resolution === 'local_wins') {
            await cloudDb.delete(journal.table_name, journal.record_id);
          }
          // For remote_wins on delete conflict, we keep the remote version (do nothing)
        } else {
          await cloudDb.update(journal.table_name, journal.record_id, resolvedData);
        }
      } catch (error) {
        throw new ValidationError(
          `Failed to apply resolution: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Update conflict record
    await edgeDb.update('sync_conflicts', input.conflict_id, {
      resolution: input.resolution,
      resolved_data: resolvedData,
      resolved_by: input.resolved_by,
      resolved_at: nowISO()
    });

    // Update journal entry
    await edgeDb.update('sync_journal', conflict.sync_journal_id, {
      status: 'synced',
      synced_at: nowISO()
    });

    const updatedResult = await edgeDb.selectOne<SyncConflict>('sync_conflicts', input.conflict_id);
    return updatedResult.data!;
  }

  /**
   * Pull data from cloud to edge (for initial sync or refresh)
   */
  async pullData(input: PullDataInput): Promise<{
    tables_synced: string[];
    records_count: Record<string, number>;
  }> {
    if (!this.hybridDb.isOnline) {
      throw new ValidationError('Cannot pull data while offline');
    }

    const tablesToSync = input.tables || [
      'products',
      'product_variants',
      'product_categories',
      'modifiers',
      'modifier_groups',
      'tax_rules',
      'tax_groups',
      'customers',
      'employees'
    ];

    const recordsCount: Record<string, number> = {};

    for (const table of tablesToSync) {
      const where: Array<{ column: string; operator: '=' | '>='; value: unknown }> = [
        { column: 'account_id', operator: '=' as const, value: input.account_id }
      ];

      if (input.store_id) {
        // Only add store_id filter for tables that have it
        const storeFilterTables = ['employees', 'inventory', 'devices'];
        if (storeFilterTables.includes(table)) {
          where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
        }
      }

      if (input.since) {
        where.push({ column: 'updated_at', operator: '>=' as const, value: input.since });
      }

      try {
        const cloudResult = await cloudDb.select(table, { where, limit: 10000 });

        if (cloudResult.error) {
          logger.warn({ table, error: cloudResult.error }, 'Failed to pull table data');
          continue;
        }

        // Upsert each record to edge
        let count = 0;
        for (const record of cloudResult.data) {
          const recordData = record as Record<string, unknown>;
          const existingResult = await edgeDb.selectOne(table, recordData.id as string);

          if (existingResult.data) {
            await edgeDb.update(table, recordData.id as string, recordData);
          } else {
            await edgeDb.insert(table, recordData);
          }
          count++;
        }

        recordsCount[table] = count;
      } catch (error) {
        logger.error({ table, error }, 'Error syncing table');
      }
    }

    return {
      tables_synced: Object.keys(recordsCount),
      records_count: recordsCount
    };
  }

  /**
   * Set online/offline status
   */
  setOnlineStatus(online: boolean): void {
    this.hybridDb.setOnlineStatus(online);
  }

  /**
   * Retry failed sync entries
   */
  async retryFailed(accountId: string): Promise<SyncResult> {
    // Reset failed entries to pending
    const failedEntries = await this.getSyncJournal(accountId, { status: 'failed' });

    for (const entry of failedEntries) {
      await edgeDb.update('sync_journal', entry.id, {
        status: 'pending',
        error: null
      });
    }

    // Trigger sync
    return this.triggerSync(accountId);
  }

  /**
   * Clear synced entries (cleanup)
   */
  async clearSyncedEntries(accountId: string, olderThan?: string): Promise<{ deleted_count: number }> {
    const entries = await this.getSyncJournal(accountId, { status: 'synced' });

    let deletedCount = 0;
    for (const entry of entries) {
      if (!olderThan || entry.synced_at! < olderThan) {
        await edgeDb.delete('sync_journal', entry.id);
        deletedCount++;
      }
    }

    return { deleted_count: deletedCount };
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(accountId: string): Promise<{
    total_entries: number;
    by_status: Record<SyncStatus, number>;
    by_table: Record<string, number>;
    by_operation: Record<SyncOperation, number>;
  }> {
    const allEntries = await this.getSyncJournal(accountId, { limit: 10000 });

    const byStatus: Record<string, number> = {};
    const byTable: Record<string, number> = {};
    const byOperation: Record<string, number> = {};

    for (const entry of allEntries) {
      byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
      byTable[entry.table_name] = (byTable[entry.table_name] || 0) + 1;
      byOperation[entry.operation] = (byOperation[entry.operation] || 0) + 1;
    }

    return {
      total_entries: allEntries.length,
      by_status: byStatus as Record<SyncStatus, number>,
      by_table: byTable,
      by_operation: byOperation as Record<SyncOperation, number>
    };
  }
}
