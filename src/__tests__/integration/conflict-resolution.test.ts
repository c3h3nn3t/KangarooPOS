import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryDb } from '../helpers/mock-db';
import {
  createTestOrder,
  createTestSyncJournalEntry,
  TEST_ACCOUNT_ID,
  TEST_STORE_ID
} from '../fixtures';

describe('Conflict Resolution', () => {
  let edgeDb: ReturnType<typeof createInMemoryDb>;
  let cloudDb: ReturnType<typeof createInMemoryDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    edgeDb = createInMemoryDb();
    cloudDb = createInMemoryDb();
  });

  describe('Version Conflicts', () => {
    it('should detect version conflict on concurrent updates', async () => {
      const orderId = 'order-version-1';

      // Both databases have the same order initially
      const baseOrder = createTestOrder({
        id: orderId,
        status: 'pending',
        total_cents: 1000,
        updated_at: '2025-01-01T10:00:00Z'
      });

      await edgeDb.insert('orders', baseOrder);
      await cloudDb.insert('orders', baseOrder);

      // Edge makes offline update
      await edgeDb.update('orders', orderId, {
        total_cents: 1200,
        updated_at: '2025-01-01T10:05:00Z'
      });

      // Cloud has different update (simulating another device)
      await cloudDb.update('orders', orderId, {
        total_cents: 1500,
        updated_at: '2025-01-01T10:03:00Z'
      });

      // Queue sync entry
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-version-1',
        operation: 'update',
        table: 'orders',
        recordId: orderId,
        data: { id: orderId, total_cents: 1200 },
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Detect conflict during sync
      const edgeOrder = (await edgeDb.selectOne('orders', orderId)).data as {
        total_cents: number;
        updated_at: string;
      };
      const cloudOrder = (await cloudDb.selectOne('orders', orderId)).data as {
        total_cents: number;
        updated_at: string;
      };

      const hasConflict = edgeOrder.total_cents !== cloudOrder.total_cents;
      expect(hasConflict).toBe(true);

      // Record conflict
      await edgeDb.update('sync_journal', 'sync-version-1', {
        status: 'conflict'
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-version-1',
        sync_journal_id: 'sync-version-1',
        conflict_type: 'version',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(cloudOrder),
        created_at: new Date().toISOString()
      });

      const conflicts = await edgeDb.select('sync_conflicts');
      expect(conflicts.data).toHaveLength(1);
    });

    it('should resolve version conflict with last-write-wins', async () => {
      const orderId = 'order-lww-1';

      // Edge update (later timestamp)
      const edgeOrder = createTestOrder({
        id: orderId,
        total_cents: 1200,
        updated_at: '2025-01-01T10:05:00Z'
      });
      await edgeDb.insert('orders', edgeOrder);

      // Cloud update (earlier timestamp)
      const cloudOrder = createTestOrder({
        id: orderId,
        total_cents: 1500,
        updated_at: '2025-01-01T10:03:00Z'
      });
      await cloudDb.insert('orders', cloudOrder);

      // Create conflict record
      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-lww-1',
        sync_journal_id: 'sync-lww-1',
        conflict_type: 'version',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(cloudOrder),
        created_at: new Date().toISOString()
      });

      // Resolve using last-write-wins (edge has later timestamp)
      const edgeTimestamp = new Date(edgeOrder.updated_at).getTime();
      const cloudTimestamp = new Date(cloudOrder.updated_at).getTime();

      const winner = edgeTimestamp > cloudTimestamp ? 'local_wins' : 'remote_wins';
      const winningData = winner === 'local_wins' ? edgeOrder : cloudOrder;

      expect(winner).toBe('local_wins');

      // Apply resolution
      await cloudDb.update('orders', orderId, {
        total_cents: winningData.total_cents
      });

      await edgeDb.update('sync_conflicts', 'conflict-lww-1', {
        resolution: winner,
        resolved_data: JSON.stringify(winningData),
        resolved_at: new Date().toISOString()
      });

      const resolved = (await edgeDb.selectOne('sync_conflicts', 'conflict-lww-1')).data as {
        resolution: string;
      };
      expect(resolved.resolution).toBe('local_wins');

      const finalCloudOrder = (await cloudDb.selectOne('orders', orderId)).data as {
        total_cents: number;
      };
      expect(finalCloudOrder.total_cents).toBe(1200);
    });
  });

  describe('Delete Conflicts', () => {
    it('should detect conflict when deleting modified record', async () => {
      const orderId = 'order-delete-1';

      // Edge deleted the order
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-delete-1',
        operation: 'delete',
        table: 'orders',
        recordId: orderId,
        data: { id: orderId },
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Cloud has modified the order (status changed to completed)
      const cloudOrder = createTestOrder({
        id: orderId,
        status: 'completed',
        total_cents: 2000
      });
      await cloudDb.insert('orders', cloudOrder);

      // Check if cloud record was modified (completed orders can't be deleted)
      const existingCloud = (await cloudDb.selectOne('orders', orderId)).data as {
        status: string;
      } | null;

      const hasConflict = existingCloud?.status === 'completed';
      expect(hasConflict).toBe(true);

      // Record delete conflict
      await edgeDb.update('sync_journal', 'sync-delete-1', {
        status: 'conflict'
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-delete-1',
        sync_journal_id: 'sync-delete-1',
        conflict_type: 'delete',
        local_data: JSON.stringify({ id: orderId, deleted: true }),
        remote_data: JSON.stringify(existingCloud),
        created_at: new Date().toISOString()
      });

      const conflict = (await edgeDb.selectOne('sync_conflicts', 'conflict-delete-1')).data as {
        conflict_type: string;
      };
      expect(conflict.conflict_type).toBe('delete');
    });

    it('should resolve delete conflict by keeping cloud record', async () => {
      const orderId = 'order-delete-resolve-1';

      // Setup conflict
      const cloudOrder = createTestOrder({
        id: orderId,
        status: 'completed',
        total_cents: 2500
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-delete-resolve-1',
        sync_journal_id: 'sync-delete-resolve-1',
        conflict_type: 'delete',
        local_data: JSON.stringify({ id: orderId, deleted: true }),
        remote_data: JSON.stringify(cloudOrder),
        created_at: new Date().toISOString()
      });

      // Resolve by keeping cloud record (remote wins)
      await edgeDb.insert('orders', cloudOrder); // Restore locally

      await edgeDb.update('sync_conflicts', 'conflict-delete-resolve-1', {
        resolution: 'remote_wins',
        resolved_data: JSON.stringify(cloudOrder),
        resolved_at: new Date().toISOString()
      });

      // Verify order restored locally
      const restoredOrder = (await edgeDb.selectOne('orders', orderId)).data;
      expect(restoredOrder).toBeDefined();
    });
  });

  describe('Insert Conflicts', () => {
    it('should detect duplicate ID conflict on insert', async () => {
      const orderId = 'order-dup-1';

      // Edge creates order offline
      const edgeOrder = createTestOrder({
        id: orderId,
        total_cents: 1000
      });
      await edgeDb.insert('orders', edgeOrder);

      // Cloud already has order with same ID (created by another device)
      const cloudOrder = createTestOrder({
        id: orderId,
        total_cents: 1500
      });
      await cloudDb.insert('orders', cloudOrder);

      // Queue sync
      const syncEntry = createTestSyncJournalEntry({
        id: 'sync-dup-1',
        operation: 'insert',
        table: 'orders',
        recordId: orderId,
        data: edgeOrder,
        status: 'pending'
      });
      await edgeDb.insert('sync_journal', syncEntry);

      // Detect conflict during sync
      const existingCloud = (await cloudDb.selectOne('orders', orderId)).data;
      const hasConflict = existingCloud !== null;
      expect(hasConflict).toBe(true);

      // Record constraint conflict
      await edgeDb.update('sync_journal', 'sync-dup-1', {
        status: 'conflict'
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-dup-1',
        sync_journal_id: 'sync-dup-1',
        conflict_type: 'constraint',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(existingCloud),
        created_at: new Date().toISOString()
      });

      const conflict = (await edgeDb.selectOne('sync_conflicts', 'conflict-dup-1')).data as {
        conflict_type: string;
      };
      expect(conflict.conflict_type).toBe('constraint');
    });

    it('should resolve insert conflict by regenerating ID', async () => {
      const originalId = 'order-regen-1';
      const newId = 'order-regen-1-local';

      // Setup conflict
      const edgeOrder = createTestOrder({
        id: originalId,
        total_cents: 1000
      });
      await edgeDb.insert('orders', edgeOrder);

      const cloudOrder = createTestOrder({
        id: originalId,
        total_cents: 1500
      });
      await cloudDb.insert('orders', cloudOrder);

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-regen-1',
        sync_journal_id: 'sync-regen-1',
        conflict_type: 'constraint',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(cloudOrder),
        created_at: new Date().toISOString()
      });

      // Resolution: Keep both, regenerate local ID
      const newLocalOrder = { ...edgeOrder, id: newId };
      await cloudDb.insert('orders', newLocalOrder);
      await edgeDb.update('orders', originalId, { id: newId });

      await edgeDb.update('sync_conflicts', 'conflict-regen-1', {
        resolution: 'merged',
        resolved_data: JSON.stringify({ originalId, newId, action: 'regenerate_id' }),
        resolved_at: new Date().toISOString()
      });

      // Both orders should exist in cloud
      const order1 = (await cloudDb.selectOne('orders', originalId)).data;
      const order2 = (await cloudDb.selectOne('orders', newId)).data;
      expect(order1).toBeDefined();
      expect(order2).toBeDefined();
    });
  });

  describe('Merge Strategies', () => {
    it('should merge numeric fields using max value', async () => {
      const orderId = 'order-merge-max-1';

      const edgeOrder = createTestOrder({
        id: orderId,
        total_cents: 1000,
        discount_cents: 100
      });

      const cloudOrder = createTestOrder({
        id: orderId,
        total_cents: 1500,
        discount_cents: 50
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-merge-max-1',
        sync_journal_id: 'sync-merge-max-1',
        conflict_type: 'version',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(cloudOrder),
        created_at: new Date().toISOString()
      });

      // Merge strategy: use max of numeric fields
      const mergedData = {
        id: orderId,
        total_cents: Math.max(edgeOrder.total_cents, cloudOrder.total_cents),
        discount_cents: Math.max(edgeOrder.discount_cents, cloudOrder.discount_cents)
      };

      expect(mergedData.total_cents).toBe(1500);
      expect(mergedData.discount_cents).toBe(100);

      await edgeDb.update('sync_conflicts', 'conflict-merge-max-1', {
        resolution: 'merged',
        resolved_data: JSON.stringify(mergedData),
        resolved_at: new Date().toISOString()
      });
    });

    it('should merge arrays by union', async () => {
      // Example: merging order item modifiers
      const localModifiers = ['extra-cheese', 'no-onions'];
      const remoteModifiers = ['extra-cheese', 'extra-sauce'];

      // Union merge
      const mergedModifiers = [...new Set([...localModifiers, ...remoteModifiers])];

      expect(mergedModifiers).toContain('extra-cheese');
      expect(mergedModifiers).toContain('no-onions');
      expect(mergedModifiers).toContain('extra-sauce');
      expect(mergedModifiers).toHaveLength(3);
    });

    it('should merge with field-level priority', async () => {
      const orderId = 'order-field-priority-1';

      const edgeOrder = {
        id: orderId,
        status: 'pending', // Edge status
        notes: 'Updated locally',
        total_cents: 1000
      };

      const cloudOrder = {
        id: orderId,
        status: 'preparing', // Cloud status (more advanced)
        notes: 'Original notes',
        total_cents: 1500
      };

      // Field-level merge rules:
      // - status: use most advanced (cloud wins if further in workflow)
      // - notes: concatenate
      // - total_cents: use max

      const statusPriority: Record<string, number> = {
        draft: 0,
        pending: 1,
        preparing: 2,
        ready: 3,
        completed: 4
      };

      const mergedData = {
        id: orderId,
        status: statusPriority[cloudOrder.status] > statusPriority[edgeOrder.status]
          ? cloudOrder.status
          : edgeOrder.status,
        notes: `${cloudOrder.notes} | ${edgeOrder.notes}`,
        total_cents: Math.max(edgeOrder.total_cents, cloudOrder.total_cents)
      };

      expect(mergedData.status).toBe('preparing');
      expect(mergedData.notes).toBe('Original notes | Updated locally');
      expect(mergedData.total_cents).toBe(1500);
    });
  });

  describe('Conflict Queue Management', () => {
    it('should list all unresolved conflicts', async () => {
      // Create multiple conflicts
      const conflicts = [
        { id: 'conflict-1', sync_journal_id: 'sync-1', conflict_type: 'version', resolution: null },
        { id: 'conflict-2', sync_journal_id: 'sync-2', conflict_type: 'delete', resolution: null },
        { id: 'conflict-3', sync_journal_id: 'sync-3', conflict_type: 'version', resolution: 'local_wins' }
      ];

      for (const conflict of conflicts) {
        await edgeDb.insert('sync_conflicts', {
          ...conflict,
          local_data: JSON.stringify({}),
          remote_data: JSON.stringify({}),
          created_at: new Date().toISOString()
        });
      }

      // Query unresolved
      const allConflicts = await edgeDb.select<{ id: string; resolution: string | null }>('sync_conflicts');
      const unresolved = (allConflicts.data ?? []).filter(c => c.resolution === null);

      expect(unresolved).toHaveLength(2);
    });

    it('should cleanup resolved conflicts after retention period', async () => {
      // Create old resolved conflict
      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-old-1',
        sync_journal_id: 'sync-old-1',
        conflict_type: 'version',
        local_data: JSON.stringify({}),
        remote_data: JSON.stringify({}),
        resolution: 'local_wins',
        resolved_at: '2024-01-01T00:00:00Z', // Old
        created_at: '2024-01-01T00:00:00Z'
      });

      // Create recent resolved conflict
      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-recent-1',
        sync_journal_id: 'sync-recent-1',
        conflict_type: 'version',
        local_data: JSON.stringify({}),
        remote_data: JSON.stringify({}),
        resolution: 'remote_wins',
        resolved_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      });

      // Cleanup old conflicts (simulating retention of 30 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const allConflicts = await edgeDb.select<{
        id: string;
        resolution: string | null;
        resolved_at: string | null;
      }>('sync_conflicts');

      const toDelete = (allConflicts.data ?? []).filter(c => {
        if (!c.resolution || !c.resolved_at) return false;
        return new Date(c.resolved_at) < cutoffDate;
      });

      for (const conflict of toDelete) {
        await edgeDb.delete('sync_conflicts', conflict.id);
      }

      const remaining = await edgeDb.select('sync_conflicts');
      expect(remaining.data).toHaveLength(1);
      expect((remaining.data?.[0] as { id: string }).id).toBe('conflict-recent-1');
    });
  });

  describe('Manual Resolution', () => {
    it('should allow manual resolution with custom data', async () => {
      const orderId = 'order-manual-1';

      const edgeOrder = createTestOrder({
        id: orderId,
        total_cents: 1000,
        notes: 'Edge notes'
      });

      const cloudOrder = createTestOrder({
        id: orderId,
        total_cents: 1500,
        notes: 'Cloud notes'
      });

      await edgeDb.insert('sync_conflicts', {
        id: 'conflict-manual-1',
        sync_journal_id: 'sync-manual-1',
        conflict_type: 'version',
        local_data: JSON.stringify(edgeOrder),
        remote_data: JSON.stringify(cloudOrder),
        created_at: new Date().toISOString()
      });

      // Manual resolution: user picks custom values
      const manualResolution = {
        id: orderId,
        total_cents: 1250, // Custom value
        notes: 'Manually resolved - combined both'
      };

      await edgeDb.update('sync_conflicts', 'conflict-manual-1', {
        resolution: 'manual',
        resolved_data: JSON.stringify(manualResolution),
        resolved_by: 'employee-1',
        resolved_at: new Date().toISOString()
      });

      // Apply to both databases
      await edgeDb.update('orders', orderId, manualResolution);
      await cloudDb.update('orders', orderId, manualResolution);

      const resolved = (await edgeDb.selectOne('sync_conflicts', 'conflict-manual-1')).data as {
        resolution: string;
        resolved_by: string;
      };
      expect(resolved.resolution).toBe('manual');
      expect(resolved.resolved_by).toBe('employee-1');
    });
  });
});
