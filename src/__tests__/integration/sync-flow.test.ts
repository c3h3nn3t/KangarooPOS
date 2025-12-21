import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryDb } from '../helpers/mock-db';
import {
  createTestOrder,
  createTestSyncJournalEntry,
  TEST_ACCOUNT_ID,
  TEST_STORE_ID,
  TEST_EMPLOYEE_ID
} from '../fixtures';

describe('Offline Sync Flow', () => {
  let edgeDb: ReturnType<typeof createInMemoryDb>;
  let cloudDb: ReturnType<typeof createInMemoryDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    edgeDb = createInMemoryDb();
    cloudDb = createInMemoryDb();
  });

  describe('Offline Operation Queueing', () => {
    it('should queue insert operations when offline', async () => {
      // Create order offline
      const order = createTestOrder({
        id: 'offline-order-1',
        is_offline: true
      });

      // Write to edge database
      await edgeDb.insert('orders', order);

      // Queue for sync
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-1',
        operation: 'insert',
        table: 'orders',
        recordId: order.id,
        data: order,
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Verify queued
      const pendingEntries = await edgeDb.select('sync_journal', {
        where: [{ column: 'status', operator: '=', value: 'pending' }]
      });
      expect(pendingEntries.data).toHaveLength(1);
    });

    it('should queue update operations when offline', async () => {
      // Existing order
      const order = createTestOrder({ id: 'order-1', status: 'draft' });
      await edgeDb.insert('orders', order);

      // Update offline
      await edgeDb.update('orders', 'order-1', { status: 'pending' });

      // Queue for sync
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-2',
        operation: 'update',
        table: 'orders',
        recordId: 'order-1',
        data: { id: 'order-1', status: 'pending' },
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      const pendingEntries = await edgeDb.select('sync_journal', {
        where: [{ column: 'operation', operator: '=', value: 'update' }]
      });
      expect(pendingEntries.data).toHaveLength(1);
    });

    it('should queue delete operations when offline', async () => {
      const order = createTestOrder({ id: 'order-2', status: 'cancelled' });
      await edgeDb.insert('orders', order);

      // Delete offline
      await edgeDb.delete('orders', 'order-2');

      // Queue for sync
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-3',
        operation: 'delete',
        table: 'orders',
        recordId: 'order-2',
        data: { id: 'order-2' },
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      const pendingEntries = await edgeDb.select('sync_journal', {
        where: [{ column: 'operation', operator: '=', value: 'delete' }]
      });
      expect(pendingEntries.data).toHaveLength(1);
    });

    it('should preserve operation order via timestamps', async () => {
      const entries = [
        createTestSyncJournalEntry({
          id: 'sync-1',
          timestamp: '2025-01-01T10:00:00Z'
        }),
        createTestSyncJournalEntry({
          id: 'sync-2',
          timestamp: '2025-01-01T10:01:00Z'
        }),
        createTestSyncJournalEntry({
          id: 'sync-3',
          timestamp: '2025-01-01T10:02:00Z'
        })
      ];

      for (const entry of entries) {
        await edgeDb.insert('sync_journal', entry);
      }

      const ordered = await edgeDb.select<{ id: string; timestamp: string }>('sync_journal', {
        orderBy: [{ column: 'timestamp', direction: 'asc' }]
      });

      expect(ordered.data?.[0].id).toBe('sync-1');
      expect(ordered.data?.[2].id).toBe('sync-3');
    });
  });

  describe('Sync to Cloud', () => {
    it('should sync pending entries to cloud', async () => {
      // Queue entries
      const order = createTestOrder({ id: 'offline-order-1' });
      await edgeDb.insert('orders', order);

      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-1',
        operation: 'insert',
        table: 'orders',
        recordId: order.id,
        data: order,
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Simulate sync process
      const pendingEntries = await edgeDb.select<{
        id: string;
        operation: string;
        table: string;
        recordId: string;
        data: Record<string, unknown>;
      }>('sync_journal', {
        where: [{ column: 'status', operator: '=', value: 'pending' }]
      });

      for (const entry of pendingEntries.data ?? []) {
        // Process based on operation type
        if (entry.operation === 'insert') {
          await cloudDb.insert(entry.table, entry.data);
        }

        // Mark as synced
        await edgeDb.update('sync_journal', entry.id, {
          status: 'synced',
          synced_at: '2025-01-01T12:00:00Z'
        });
      }

      // Verify cloud has the data
      const cloudOrders = await cloudDb.select('orders');
      expect(cloudOrders.data).toHaveLength(1);

      // Verify entry marked as synced
      const syncedEntry = (await edgeDb.selectOne('sync_journal', 'sync-1')).data as {
        status: string;
      };
      expect(syncedEntry.status).toBe('synced');
    });

    it('should handle sync failure with retry tracking', async () => {
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-fail-1',
        status: 'pending',
        attempts: 0
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Simulate failed sync attempt
      await edgeDb.update('sync_journal', 'sync-fail-1', {
        status: 'failed',
        attempts: 1,
        last_attempt: '2025-01-01T12:00:00Z',
        error: 'Network timeout'
      });

      const entry = (await edgeDb.selectOne('sync_journal', 'sync-fail-1')).data as {
        status: string;
        attempts: number;
        error: string;
      };

      expect(entry.status).toBe('failed');
      expect(entry.attempts).toBe(1);
      expect(entry.error).toBe('Network timeout');
    });

    it('should track multiple retry attempts', async () => {
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-retry-1',
        status: 'pending',
        attempts: 0
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Simulate 3 failed attempts
      for (let i = 1; i <= 3; i++) {
        await edgeDb.update('sync_journal', 'sync-retry-1', {
          status: i < 3 ? 'pending' : 'failed',
          attempts: i,
          last_attempt: `2025-01-01T12:0${i}:00Z`
        });
      }

      const entry = (await edgeDb.selectOne('sync_journal', 'sync-retry-1')).data as {
        attempts: number;
      };
      expect(entry.attempts).toBe(3);
    });
  });

  describe('Conflict Detection', () => {
    it('should detect version conflict when cloud record was modified', async () => {
      // Order exists in both databases with different states
      const edgeOrder = createTestOrder({
        id: 'order-conflict-1',
        status: 'pending',
        total_cents: 1000
      });
      await edgeDb.insert('orders', edgeOrder);

      const cloudOrder = createTestOrder({
        id: 'order-conflict-1',
        status: 'pending',
        total_cents: 1500 // Different value
      });
      await cloudDb.insert('orders', cloudOrder);

      // Sync entry for edge order
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-conflict-1',
        operation: 'update',
        table: 'orders',
        recordId: 'order-conflict-1',
        data: { id: 'order-conflict-1', total_cents: 1000 }
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Check cloud for existing record
      const cloudRecord = (await cloudDb.selectOne('orders', 'order-conflict-1')).data as {
        total_cents: number;
      };

      // Detect conflict (checksums would differ)
      const hasConflict = cloudRecord.total_cents !== edgeOrder.total_cents;
      expect(hasConflict).toBe(true);

      // Mark as conflict
      await edgeDb.update('sync_journal', 'sync-conflict-1', {
        status: 'conflict'
      });

      // Record conflict details
      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-1',
        sync_journal_id: 'sync-conflict-1',
        conflict_type: 'version',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(cloudRecord),
        created_at: '2025-01-01T12:00:00Z'
      });

      const conflicts = await edgeDb.select('sync_conflicts');
      expect(conflicts.data).toHaveLength(1);
    });

    it('should detect delete conflict when record was modified', async () => {
      // Cloud has the record
      const cloudOrder = createTestOrder({
        id: 'order-delete-conflict',
        status: 'completed'
      });
      await cloudDb.insert('orders', cloudOrder);

      // Edge wants to delete
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-delete-conflict',
        operation: 'delete',
        table: 'orders',
        recordId: 'order-delete-conflict'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Check cloud - record exists and is completed
      const cloudRecord = (await cloudDb.selectOne('orders', 'order-delete-conflict')).data as {
        status: string;
      } | null;

      // Can't delete completed orders
      const hasConflict = cloudRecord?.status === 'completed';
      expect(hasConflict).toBe(true);

      await edgeDb.update('sync_journal', 'sync-delete-conflict', {
        status: 'conflict'
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-2',
        sync_journal_id: 'sync-delete-conflict',
        conflict_type: 'delete',
        local_data: JSON.stringify({ id: 'order-delete-conflict', deleted: true }),
        remote_data: JSON.stringify(cloudRecord),
        created_at: '2025-01-01T12:00:00Z'
      });
    });
  });

  describe('Conflict Resolution', () => {
    beforeEach(async () => {
      // Setup conflict
      await edgeDb.insert(
        'sync_journal',
        createTestSyncJournalEntry({
          id: 'sync-resolve-1',
          status: 'conflict'
        })
      );

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-resolve-1',
        sync_journal_id: 'sync-resolve-1',
        conflict_type: 'version',
        local_data: JSON.stringify({ id: 'order-1', total_cents: 1000 }),
        remote_data: JSON.stringify({ id: 'order-1', total_cents: 1500 }),
        created_at: '2025-01-01T12:00:00Z'
      });
    });

    it('should resolve conflict with local wins strategy', async () => {
      const conflict = (await edgeDb.selectOne('sync_conflicts', 'conflict-resolve-1')).data as {
        local_data: string;
      };
      const localData = JSON.parse(conflict.local_data);

      // Apply local data to cloud
      await cloudDb.update('orders', 'order-1', localData);

      // Mark conflict as resolved
      await edgeDb.update('sync_conflicts', 'conflict-resolve-1', {
        resolution: 'local_wins',
        resolved_data: conflict.local_data,
        resolved_at: '2025-01-01T13:00:00Z'
      });

      await edgeDb.update('sync_journal', 'sync-resolve-1', {
        status: 'synced'
      });

      const resolved = (await edgeDb.selectOne('sync_conflicts', 'conflict-resolve-1')).data as {
        resolution: string;
      };
      expect(resolved.resolution).toBe('local_wins');
    });

    it('should resolve conflict with remote wins strategy', async () => {
      const conflict = (await edgeDb.selectOne('sync_conflicts', 'conflict-resolve-1')).data as {
        remote_data: string;
      };
      const remoteData = JSON.parse(conflict.remote_data);

      // Apply remote data to edge
      await edgeDb.update('orders', 'order-1', remoteData);

      // Mark conflict as resolved
      await edgeDb.update('sync_conflicts', 'conflict-resolve-1', {
        resolution: 'remote_wins',
        resolved_data: conflict.remote_data,
        resolved_at: '2025-01-01T13:00:00Z'
      });

      await edgeDb.update('sync_journal', 'sync-resolve-1', {
        status: 'synced'
      });

      const resolved = (await edgeDb.selectOne('sync_conflicts', 'conflict-resolve-1')).data as {
        resolution: string;
      };
      expect(resolved.resolution).toBe('remote_wins');
    });

    it('should resolve conflict with merged data', async () => {
      const conflict = (await edgeDb.selectOne('sync_conflicts', 'conflict-resolve-1')).data as {
        local_data: string;
        remote_data: string;
      };

      const localData = JSON.parse(conflict.local_data);
      const remoteData = JSON.parse(conflict.remote_data);

      // Merge: use higher total_cents
      const mergedData = {
        id: localData.id,
        total_cents: Math.max(localData.total_cents, remoteData.total_cents)
      };

      // Apply merged data to both
      await cloudDb.update('orders', 'order-1', mergedData);
      await edgeDb.update('orders', 'order-1', mergedData);

      await edgeDb.update('sync_conflicts', 'conflict-resolve-1', {
        resolution: 'merged',
        resolved_data: JSON.stringify(mergedData),
        resolved_at: '2025-01-01T13:00:00Z'
      });

      const resolved = (await edgeDb.selectOne('sync_conflicts', 'conflict-resolve-1')).data as {
        resolved_data: string;
      };
      expect(JSON.parse(resolved.resolved_data).total_cents).toBe(1500);
    });
  });

  describe('Sync Queue Recovery', () => {
    it('should recover pending entries on startup', async () => {
      // Simulate entries left from previous session
      const entries = [
        createTestSyncJournalEntry({ id: 'recovery-1', status: 'pending' }),
        createTestSyncJournalEntry({ id: 'recovery-2', status: 'pending' }),
        createTestSyncJournalEntry({ id: 'recovery-3', status: 'syncing' }) // Interrupted
      ];

      for (const entry of entries) {
        await edgeDb.insert('sync_journal', entry);
      }

      // Load pending entries (simulating HybridAdapter.initialize())
      const pendingEntries = await edgeDb.select('sync_journal', {
        where: [{ column: 'status', operator: 'in', value: ['pending', 'syncing', 'failed'] }]
      });

      expect(pendingEntries.data).toHaveLength(3);

      // Reset 'syncing' to 'pending'
      for (const entry of pendingEntries.data ?? []) {
        if ((entry as { status: string }).status === 'syncing') {
          await edgeDb.update('sync_journal', (entry as { id: string }).id, {
            status: 'pending'
          });
        }
      }

      const resetEntry = (await edgeDb.selectOne('sync_journal', 'recovery-3')).data as {
        status: string;
      };
      expect(resetEntry.status).toBe('pending');
    });

    it('should not reload synced entries', async () => {
      await edgeDb.insert(
        'sync_journal',
        createTestSyncJournalEntry({ id: 'synced-1', status: 'synced' })
      );
      await edgeDb.insert(
        'sync_journal',
        createTestSyncJournalEntry({ id: 'pending-1', status: 'pending' })
      );

      const toProcess = await edgeDb.select('sync_journal', {
        where: [{ column: 'status', operator: 'in', value: ['pending', 'failed'] }]
      });

      expect(toProcess.data).toHaveLength(1);
      expect((toProcess.data?.[0] as { id: string }).id).toBe('pending-1');
    });
  });
});
