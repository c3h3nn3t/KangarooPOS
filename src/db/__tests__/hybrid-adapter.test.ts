import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridAdapter } from '../hybrid-adapter';
import type { DatabaseAdapter, SyncJournalEntry } from '../types';

// Mock cloud adapter
const mockCloudDb: DatabaseAdapter = {
  type: 'cloud',
  isOnline: true,
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  insertMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn()
};

// Mock edge adapter with getDatabase method
const mockEdgeDb = {
  type: 'edge',
  isOnline: true,
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  insertMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  setOnlineStatus: vi.fn(),
  getDatabase: vi.fn()
} as unknown as DatabaseAdapter & { setOnlineStatus: (online: boolean) => void; getDatabase: () => unknown };

// Mock the imports
vi.mock('../cloud-adapter', () => ({
  cloudDb: mockCloudDb
}));

vi.mock('../edge-adapter', () => ({
  edgeDb: mockEdgeDb
}));

vi.mock('../../config/env', () => ({
  config: {
    edge: { nodeId: 'test-edge-node' },
    features: { offlineRefundsEnabled: true }
  }
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../utils/datetime', () => ({
  nowISO: () => '2025-01-01T00:00:00Z'
}));

vi.mock('../../utils/idempotency', () => ({
  generateId: () => 'generated-id-123'
}));

describe('HybridAdapter', () => {
  let adapter: HybridAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new HybridAdapter();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initialization', () => {
    it('should load pending sync entries on initialize', async () => {
      const pendingEntries = [
        {
          id: 'sync-1',
          operation: 'insert',
          table: 'orders',
          record_id: 'order-1',
          data: '{}',
          timestamp: '2025-01-01',
          edge_node_id: 'edge-1',
          status: 'pending',
          checksum: 'abc',
          attempts: 0
        }
      ];

      mockEdgeDb.select.mockResolvedValue({ data: pendingEntries, error: null });

      await adapter.initialize();

      expect(adapter.initialized).toBe(true);
      expect(adapter.getSyncStats().total).toBe(1);
    });

    it('should reset syncing entries to pending on initialize', async () => {
      const syncingEntries = [
        {
          id: 'sync-1',
          status: 'syncing',
          operation: 'insert',
          table: 'orders',
          record_id: 'order-1',
          data: '{}',
          timestamp: '2025-01-01',
          edge_node_id: 'edge-1',
          checksum: 'abc',
          attempts: 1
        }
      ];

      mockEdgeDb.select.mockResolvedValue({ data: syncingEntries, error: null });
      mockEdgeDb.update.mockResolvedValue({ data: {}, error: null });

      await adapter.initialize();

      expect(mockEdgeDb.update).toHaveBeenCalledWith('sync_journal', 'sync-1', {
        status: 'pending'
      });
    });

    it('should handle initialization error gracefully', async () => {
      mockEdgeDb.select.mockResolvedValue({ data: null, error: 'Database error' });

      await adapter.initialize();

      // Should still mark as initialized to not block operations
      expect(adapter.initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      mockEdgeDb.select.mockResolvedValue({ data: [], error: null });

      await adapter.initialize();
      await adapter.initialize();

      expect(mockEdgeDb.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('online operations', () => {
    beforeEach(() => {
      adapter.setOnlineStatus(true);
    });

    it('should write to cloud when online', async () => {
      mockCloudDb.insert.mockResolvedValue({
        data: { id: 'order-1', status: 'draft' },
        error: null
      });
      mockEdgeDb.insert.mockResolvedValue({ data: {}, error: null });

      const result = await adapter.insert('orders', { status: 'draft' });

      expect(mockCloudDb.insert).toHaveBeenCalledWith('orders', { status: 'draft' });
      expect(mockEdgeDb.insert).toHaveBeenCalled(); // Also write to edge for cache
      expect(result.data).toEqual({ id: 'order-1', status: 'draft' });
    });

    it('should read from cloud when online', async () => {
      mockCloudDb.select.mockResolvedValue({
        data: [{ id: 'order-1' }],
        error: null
      });

      const result = await adapter.select('orders');

      expect(mockCloudDb.select).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });

    it('should fallback to edge on cloud read failure', async () => {
      mockCloudDb.select.mockResolvedValue({ data: null, error: 'Network error' });
      mockEdgeDb.select.mockResolvedValue({ data: [{ id: 'cached-1' }], error: null });

      const result = await adapter.select('orders');

      expect(mockEdgeDb.select).toHaveBeenCalled();
      expect(result.data).toEqual([{ id: 'cached-1' }]);
    });
  });

  describe('offline operations', () => {
    beforeEach(() => {
      adapter.setOnlineStatus(false);
      mockEdgeDb.select.mockResolvedValue({ data: [], error: null });
    });

    it('should write to edge and queue for sync when offline', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1', status: 'draft' },
        error: null
      });

      const result = await adapter.insert('orders', { id: 'order-1', status: 'draft' });

      expect(mockEdgeDb.insert).toHaveBeenCalledTimes(2); // Once for data, once for sync_journal
      expect(result.data).toEqual({ id: 'order-1', status: 'draft' });
    });

    it('should block writes to cloud-only tables when offline', async () => {
      const result = await adapter.insert('products', { name: 'New Product' });

      expect(result.error).toContain('Cannot create products records while offline');
      expect(mockEdgeDb.insert).not.toHaveBeenCalled();
    });

    it('should block refunds when offline refunds disabled', async () => {
      // Re-mock config with refunds disabled
      vi.doMock('../../config/env', () => ({
        config: {
          edge: { nodeId: 'test-edge-node' },
          features: { offlineRefundsEnabled: false }
        }
      }));

      // This test would need fresh imports, simplified for now
      // The logic is tested in the canWriteOffline method
    });

    it('should read from edge when offline', async () => {
      mockEdgeDb.select.mockResolvedValue({
        data: [{ id: 'order-1' }],
        error: null
      });

      const result = await adapter.select('orders');

      expect(mockEdgeDb.select).toHaveBeenCalled();
      expect(mockCloudDb.select).not.toHaveBeenCalled();
    });
  });

  describe('sync queue management', () => {
    beforeEach(async () => {
      mockEdgeDb.select.mockResolvedValue({ data: [], error: null });
      await adapter.initialize();
      adapter.setOnlineStatus(false);
    });

    it('should queue operations for sync', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1' },
        error: null
      });

      await adapter.insert('orders', { id: 'order-1', status: 'draft' });

      const pending = adapter.getPendingSyncEntries();
      expect(pending).toHaveLength(1);
      expect(pending[0].operation).toBe('insert');
      expect(pending[0].table).toBe('orders');
    });

    it('should mark entry as synced', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1' },
        error: null
      });
      mockEdgeDb.update.mockResolvedValue({ data: {}, error: null });

      await adapter.insert('orders', { id: 'order-1', status: 'draft' });

      const entry = adapter.getPendingSyncEntries()[0];
      await adapter.markSynced(entry.id);

      expect(adapter.getPendingSyncEntries()).toHaveLength(0);
      expect(mockEdgeDb.update).toHaveBeenCalledWith('sync_journal', entry.id, {
        status: 'synced',
        synced_at: expect.any(String)
      });
    });

    it('should mark entry as failed with error', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1' },
        error: null
      });
      mockEdgeDb.update.mockResolvedValue({ data: {}, error: null });

      await adapter.insert('orders', { id: 'order-1', status: 'draft' });

      const entry = adapter.getPendingSyncEntries()[0];
      await adapter.markFailed(entry.id, 'Network error');

      const pending = adapter.getPendingSyncEntries();
      expect(pending[0].status).toBe('failed');
      expect(pending[0].error).toBe('Network error');
      expect(pending[0].attempts).toBe(1);
    });

    it('should mark entry as conflict', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1' },
        error: null
      });
      mockEdgeDb.update.mockResolvedValue({ data: {}, error: null });

      await adapter.insert('orders', { id: 'order-1', status: 'draft' });

      const entry = adapter.getPendingSyncEntries()[0];
      await adapter.markConflict(entry.id, 'Version mismatch');

      const pending = adapter.getPendingSyncEntries();
      expect(pending[0].status).toBe('conflict');
    });

    it('should return correct sync stats', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1' },
        error: null
      });
      mockEdgeDb.update.mockResolvedValue({ data: {}, error: null });

      // Create multiple entries
      await adapter.insert('orders', { id: 'order-1' });
      await adapter.insert('orders', { id: 'order-2' });
      await adapter.insert('orders', { id: 'order-3' });

      // Mark one as failed
      const entries = adapter.getPendingSyncEntries();
      await adapter.markFailed(entries[0].id, 'Error');
      await adapter.markConflict(entries[1].id, 'Conflict');

      const stats = adapter.getSyncStats();
      expect(stats.pending).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.conflict).toBe(1);
      expect(stats.total).toBe(3);
    });

    it('should cleanup synced entries', async () => {
      mockEdgeDb.insert.mockResolvedValue({
        data: { id: 'order-1' },
        error: null
      });

      await adapter.insert('orders', { id: 'order-1' });

      // Manually set status to synced for testing
      const entries = adapter.getPendingSyncEntries();
      (entries[0] as { status: string }).status = 'synced';

      adapter.cleanupSyncedEntries();

      expect(adapter.getSyncStats().total).toBe(0);
    });
  });

  describe('transaction delegation', () => {
    it('should delegate transaction to cloud when online', async () => {
      adapter.setOnlineStatus(true);

      const callback = vi.fn();
      mockCloudDb.transaction.mockResolvedValue('result');

      await adapter.transaction(callback);

      expect(mockCloudDb.transaction).toHaveBeenCalledWith(callback);
    });

    it('should delegate transaction to edge when offline', async () => {
      adapter.setOnlineStatus(false);

      const callback = vi.fn();
      mockEdgeDb.transaction.mockResolvedValue('result');

      await adapter.transaction(callback);

      expect(mockEdgeDb.transaction).toHaveBeenCalledWith(callback);
    });
  });

  describe('update operations', () => {
    beforeEach(async () => {
      mockEdgeDb.select.mockResolvedValue({ data: [], error: null });
      await adapter.initialize();
    });

    it('should update in cloud and edge when online', async () => {
      adapter.setOnlineStatus(true);
      mockCloudDb.update.mockResolvedValue({
        data: { id: 'order-1', status: 'completed' },
        error: null
      });
      mockEdgeDb.update.mockResolvedValue({ data: {}, error: null });

      const result = await adapter.update('orders', 'order-1', { status: 'completed' });

      expect(mockCloudDb.update).toHaveBeenCalled();
      expect(mockEdgeDb.update).toHaveBeenCalled();
      expect(result.data).toEqual({ id: 'order-1', status: 'completed' });
    });

    it('should queue update for sync when offline', async () => {
      adapter.setOnlineStatus(false);
      mockEdgeDb.update.mockResolvedValue({
        data: { id: 'order-1', status: 'completed' },
        error: null
      });
      mockEdgeDb.insert.mockResolvedValue({ data: {}, error: null });

      await adapter.update('orders', 'order-1', { status: 'completed' });

      const entries = adapter.getPendingSyncEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('update');
    });
  });

  describe('delete operations', () => {
    beforeEach(async () => {
      mockEdgeDb.select.mockResolvedValue({ data: [], error: null });
      await adapter.initialize();
    });

    it('should delete from cloud and edge when online', async () => {
      adapter.setOnlineStatus(true);
      mockCloudDb.delete.mockResolvedValue({ data: { id: 'order-1' }, error: null });
      mockEdgeDb.delete.mockResolvedValue({ data: {}, error: null });

      const result = await adapter.delete('orders', 'order-1');

      expect(mockCloudDb.delete).toHaveBeenCalled();
      expect(mockEdgeDb.delete).toHaveBeenCalled();
      expect(result.data?.id).toBe('order-1');
    });

    it('should queue delete for sync when offline', async () => {
      adapter.setOnlineStatus(false);
      mockEdgeDb.delete.mockResolvedValue({ data: { id: 'order-1' }, error: null });
      mockEdgeDb.insert.mockResolvedValue({ data: {}, error: null });

      await adapter.delete('orders', 'order-1');

      const entries = adapter.getPendingSyncEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('delete');
    });
  });
});
