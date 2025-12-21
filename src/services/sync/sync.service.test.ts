import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from './sync.service';
import { ValidationError } from '../../utils/errors';
import type {
  SyncJournal,
  SyncConflict,
  ConflictType,
  ConflictResolution
} from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';
import { db } from '../../db';
import { edgeDb } from '../../db/edge-adapter';
import { cloudDb } from '../../db/cloud-adapter';

// Mock the database adapters
vi.mock('../../db', () => ({
  db: {
    isOnline: true,
    setOnlineStatus: vi.fn()
  }
}));

vi.mock('../../db/edge-adapter', () => ({
  edgeDb: {
    select: vi.fn(),
    selectOne: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../db/cloud-adapter', () => ({
  cloudDb: {
    select: vi.fn(),
    selectOne: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

describe('SyncService', () => {
  let service: SyncService;
  const accountId = 'account-123';
  const entryId = 'entry-123';
  const conflictId = 'conflict-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SyncService();
    // Reset online status
    (db as { isOnline: boolean }).isOnline = true;
  });

  describe('getSyncStatus', () => {
    const mockEntries: SyncJournal[] = [
      {
        id: entryId,
        account_id: accountId,
        operation: 'insert',
        table_name: 'orders',
        record_id: 'order-123',
        data: { id: 'order-123' },
        timestamp: '2025-01-01T00:00:00Z',
        edge_node_id: 'node-1',
        status: 'pending',
        checksum: 'abc123',
        attempts: 0,
        last_attempt_at: null,
        error: null,
        synced_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ];

    it('should return sync status information', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: mockEntries, error: null }) // Pending entries
        .mockResolvedValueOnce({ data: [], error: null }); // Conflicts

      const result = await service.getSyncStatus(accountId);

      expect(result).toHaveProperty('is_online');
      expect(result).toHaveProperty('pending_count');
      expect(result).toHaveProperty('last_sync_at');
      expect(result).toHaveProperty('sync_in_progress');
      expect(result).toHaveProperty('failed_count');
      expect(result).toHaveProperty('conflict_count');
    });
  });

  describe('getPendingEntries', () => {
    const mockEntries: SyncJournal[] = [
      {
        id: entryId,
        account_id: accountId,
        operation: 'insert',
        table_name: 'orders',
        record_id: 'order-123',
        data: { id: 'order-123' },
        timestamp: '2025-01-01T00:00:00Z',
        edge_node_id: 'node-1',
        status: 'pending',
        checksum: 'abc123',
        attempts: 0,
        last_attempt_at: null,
        error: null,
        synced_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ];

    it('should return pending entries', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockEntries,
        error: null
      });

      const result = await service.getPendingEntries(accountId);

      expect(result).toEqual(mockEntries);
      expect(edgeDb.select).toHaveBeenCalledWith(
        'sync_journal',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId },
            { column: 'status', operator: '=', value: 'pending' }
          ])
        })
      );
    });

    it('should return empty array on error', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        error: 'Database error'
      });

      const result = await service.getPendingEntries(accountId);

      expect(result).toEqual([]);
    });
  });

  describe('getSyncJournal', () => {
    const mockEntries: SyncJournal[] = [
      {
        id: entryId,
        account_id: accountId,
        operation: 'insert',
        table_name: 'orders',
        record_id: 'order-123',
        data: { id: 'order-123' },
        timestamp: '2025-01-01T00:00:00Z',
        edge_node_id: 'node-1',
        status: 'pending',
        checksum: 'abc123',
        attempts: 0,
        last_attempt_at: null,
        error: null,
        synced_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ];

    it('should return sync journal entries', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockEntries,
        error: null
      });

      const result = await service.getSyncJournal(accountId);

      expect(result).toEqual(mockEntries);
    });

    it('should filter by status when provided', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockEntries,
        error: null
      });

      await service.getSyncJournal(accountId, { status: 'pending' });

      expect(edgeDb.select).toHaveBeenCalledWith(
        'sync_journal',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'status', operator: '=', value: 'pending' }
          ])
        })
      );
    });

    it('should throw error on database failure', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        error: 'Database error'
      });

      await expect(service.getSyncJournal(accountId)).rejects.toThrow('Failed to fetch sync journal');
    });
  });

  describe('triggerSync', () => {
    const mockEntry: SyncJournal = {
      id: entryId,
      account_id: accountId,
      operation: 'insert',
      table_name: 'orders',
      record_id: 'order-123',
      data: { id: 'order-123', name: 'Test Order' },
      timestamp: '2025-01-01T00:00:00Z',
      edge_node_id: 'node-1',
      status: 'pending',
      checksum: 'abc123',
      attempts: 0,
      last_attempt_at: null,
      error: null,
      synced_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should sync pending entries successfully', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockEntry],
        error: null
      });
      (cloudDb.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'order-123' },
        error: null
      });
      (edgeDb.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockEntry, status: 'synced' },
        error: null
      });

      const result = await service.triggerSync(accountId);

      expect(result.synced_count).toBe(1);
      expect(result.failed_count).toBe(0);
      expect(result.conflict_count).toBe(0);
    });

    it('should throw ValidationError when sync already in progress', async () => {
      // Trigger first sync
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        error: null
      });

      const firstSync = service.triggerSync(accountId);

      // Try to trigger second sync while first is in progress
      await expect(service.triggerSync(accountId)).rejects.toThrow(ValidationError);

      await firstSync; // Wait for first sync to complete
    });

    it('should throw ValidationError when offline', async () => {
      (db as { isOnline: boolean }).isOnline = false;

      await expect(service.triggerSync(accountId)).rejects.toThrow(ValidationError);
    });

    it('should handle sync failures', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockEntry],
        error: null
      });
      (cloudDb.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: 'Insert failed'
      });
      (edgeDb.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockEntry, status: 'failed' },
        error: null
      });

      const result = await service.triggerSync(accountId);

      expect(result.synced_count).toBe(0);
      expect(result.failed_count).toBe(1);
    });
  });

  describe('getConflicts', () => {
    const mockJournalEntry: SyncJournal = {
      id: entryId,
      account_id: accountId,
      operation: 'update',
      table_name: 'orders',
      record_id: 'order-123',
      data: { id: 'order-123', name: 'Local Order' },
      timestamp: '2025-01-01T00:00:00Z',
      edge_node_id: 'node-1',
      status: 'conflict',
      checksum: 'abc123',
      attempts: 0,
      last_attempt_at: null,
      error: null,
      synced_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    const mockConflict: SyncConflict = {
      id: conflictId,
      sync_journal_id: entryId,
      conflict_type: 'version' as ConflictType,
      local_data: { id: 'order-123', name: 'Local Order' },
      remote_data: { id: 'order-123', name: 'Remote Order' },
      resolution: null,
      resolved_data: null,
      resolved_by: null,
      resolved_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should return unresolved conflicts', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: [mockJournalEntry], error: null }) // Journal entries
        .mockResolvedValueOnce({ data: [mockConflict], error: null }); // Conflicts

      const result = await service.getConflicts(accountId);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(conflictId);
    });

    it('should return empty array when no conflicts', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getConflicts(accountId);

      expect(result).toEqual([]);
    });
  });

  describe('resolveConflict', () => {
    const mockConflict: SyncConflict = {
      id: conflictId,
      sync_journal_id: entryId,
      conflict_type: 'version' as ConflictType,
      local_data: { id: 'order-123', name: 'Local Order' },
      remote_data: { id: 'order-123', name: 'Remote Order' },
      resolution: null,
      resolved_data: null,
      resolved_by: null,
      resolved_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    const mockJournalEntry: SyncJournal = {
      id: entryId,
      account_id: accountId,
      operation: 'update',
      table_name: 'orders',
      record_id: 'order-123',
      data: { id: 'order-123', name: 'Local Order' },
      timestamp: '2025-01-01T00:00:00Z',
      edge_node_id: 'node-1',
      status: 'conflict',
      checksum: 'abc123',
      attempts: 0,
      last_attempt_at: null,
      error: null,
      synced_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should resolve conflict with local_wins', async () => {
      (edgeDb.selectOne as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: mockConflict, error: null }) // Conflict
        .mockResolvedValueOnce({ data: mockJournalEntry, error: null }); // Journal entry
      (cloudDb.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'order-123' },
        error: null
      });
      (edgeDb.update as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: { ...mockConflict, resolution: 'local_wins' }, error: null }) // Conflict update
        .mockResolvedValueOnce({ data: { ...mockJournalEntry, status: 'synced' }, error: null }); // Journal update
      (edgeDb.selectOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockConflict, resolution: 'local_wins' },
        error: null
      });

      const result = await service.resolveConflict({
        conflict_id: conflictId,
        account_id: accountId,
        resolution: 'local_wins',
        resolved_by: 'user-123'
      });

      expect(result.resolution).toBe('local_wins');
    });

    it('should resolve conflict with remote_wins', async () => {
      (edgeDb.selectOne as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: mockConflict, error: null })
        .mockResolvedValueOnce({ data: mockJournalEntry, error: null });
      (cloudDb.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'order-123' },
        error: null
      });
      (edgeDb.update as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: { ...mockConflict, resolution: 'remote_wins' }, error: null })
        .mockResolvedValueOnce({ data: { ...mockJournalEntry, status: 'synced' }, error: null });
      (edgeDb.selectOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockConflict, resolution: 'remote_wins' },
        error: null
      });

      const result = await service.resolveConflict({
        conflict_id: conflictId,
        account_id: accountId,
        resolution: 'remote_wins',
        resolved_by: 'user-123'
      });

      expect(result.resolution).toBe('remote_wins');
    });

    it('should throw ValidationError when resolved_data missing for merged resolution', async () => {
      (edgeDb.selectOne as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: mockConflict, error: null })
        .mockResolvedValueOnce({ data: mockJournalEntry, error: null });

      await expect(
        service.resolveConflict({
          conflict_id: conflictId,
          account_id: accountId,
          resolution: 'merged',
          resolved_by: 'user-123'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when conflict not found', async () => {
      (edgeDb.selectOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: 'Not found'
      });

      await expect(
        service.resolveConflict({
          conflict_id: conflictId,
          account_id: accountId,
          resolution: 'local_wins',
          resolved_by: 'user-123'
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('pullData', () => {
    const mockProducts = [
      { id: 'product-1', account_id: accountId, name: 'Product 1' },
      { id: 'product-2', account_id: accountId, name: 'Product 2' }
    ];

    it('should pull data from cloud to edge', async () => {
      (cloudDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockProducts,
        error: null
      });
      (edgeDb.selectOne as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: null, error: null }) // Product 1 not exists
        .mockResolvedValueOnce({ data: null, error: null }); // Product 2 not exists
      (edgeDb.insert as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: mockProducts[0], error: null })
        .mockResolvedValueOnce({ data: mockProducts[1], error: null });

      const result = await service.pullData({
        account_id: accountId
      });

      expect(result.tables_synced.length).toBeGreaterThan(0);
      expect(result.records_count).toBeDefined();
    });

    it('should throw ValidationError when offline', async () => {
      (db as { isOnline: boolean }).isOnline = false;

      await expect(
        service.pullData({
          account_id: accountId
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should update existing records', async () => {
      (cloudDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockProducts,
        error: null
      });
      (edgeDb.selectOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockProducts[0],
        error: null
      });
      (edgeDb.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockProducts[0],
        error: null
      });

      const result = await service.pullData({
        account_id: accountId,
        tables: ['products']
      });

      expect(result.tables_synced).toContain('products');
    });
  });

  describe('getSyncStats', () => {
    const mockEntries: SyncJournal[] = [
      {
        id: entryId,
        account_id: accountId,
        operation: 'insert',
        table_name: 'orders',
        record_id: 'order-123',
        data: { id: 'order-123' },
        timestamp: '2025-01-01T00:00:00Z',
        edge_node_id: 'node-1',
        status: 'pending',
        checksum: 'abc123',
        attempts: 0,
        last_attempt_at: null,
        error: null,
        synced_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      },
      {
        id: 'entry-2',
        account_id: accountId,
        operation: 'update',
        table_name: 'customers',
        record_id: 'customer-123',
        data: { id: 'customer-123' },
        timestamp: '2025-01-01T00:00:00Z',
        edge_node_id: 'node-1',
        status: 'synced',
        checksum: 'def456',
        attempts: 0,
        last_attempt_at: null,
        error: null,
        synced_at: '2025-01-01T01:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T01:00:00Z'
      }
    ];

    it('should return sync statistics', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockEntries,
        error: null
      });

      const result = await service.getSyncStats(accountId);

      expect(result).toHaveProperty('total_entries');
      expect(result).toHaveProperty('by_status');
      expect(result).toHaveProperty('by_table');
      expect(result).toHaveProperty('by_operation');
      expect(result.total_entries).toBe(2);
      expect(result.by_status.pending).toBe(1);
      expect(result.by_status.synced).toBe(1);
    });
  });

  describe('retryFailed', () => {
    const mockFailedEntry: SyncJournal = {
      id: entryId,
      account_id: accountId,
      operation: 'insert',
      table_name: 'orders',
      record_id: 'order-123',
      data: { id: 'order-123' },
      timestamp: '2025-01-01T00:00:00Z',
      edge_node_id: 'node-1',
      status: 'failed',
      checksum: 'abc123',
      attempts: 3,
      last_attempt_at: '2025-01-01T01:00:00Z',
      error: 'Network error',
      synced_at: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T01:00:00Z'
    };

    it('should reset failed entries and trigger sync', async () => {
      // Mock getSyncJournal to return failed entries
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [mockFailedEntry],
        error: null
      });

      // Mock update to reset status
      (edgeDb.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { ...mockFailedEntry, status: 'pending', error: null },
        error: null
      });

      // Mock triggerSync (which will be called after reset)
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [{ ...mockFailedEntry, status: 'pending' }],
        error: null
      });
      (cloudDb.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'order-123' },
        error: null
      });
      (edgeDb.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { ...mockFailedEntry, status: 'synced' },
        error: null
      });

      const result = await service.retryFailed(accountId);

      expect(result.synced_count).toBe(1);
      expect(result.failed_count).toBe(0);
      // Verify failed entry was reset to pending
      expect(edgeDb.update).toHaveBeenCalledWith(
        'sync_journal',
        entryId,
        expect.objectContaining({
          status: 'pending',
          error: null
        })
      );
    });

    it('should handle multiple failed entries', async () => {
      const mockFailedEntries: SyncJournal[] = [
        mockFailedEntry,
        {
          ...mockFailedEntry,
          id: 'entry-2',
          record_id: 'order-456',
          error: 'Timeout error'
        }
      ];

      // Mock getSyncJournal
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockFailedEntries,
        error: null
      });

      // Mock updates for reset
      (edgeDb.update as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: { ...mockFailedEntries[0], status: 'pending' },
          error: null
        })
        .mockResolvedValueOnce({
          data: { ...mockFailedEntries[1], status: 'pending' },
          error: null
        });

      // Mock triggerSync
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockFailedEntries.map((e) => ({ ...e, status: 'pending' })),
        error: null
      });
      (cloudDb.insert as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: { id: 'order-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'order-456' }, error: null });
      (edgeDb.update as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ data: { ...mockFailedEntries[0], status: 'synced' }, error: null })
        .mockResolvedValueOnce({ data: { ...mockFailedEntries[1], status: 'synced' }, error: null });

      const result = await service.retryFailed(accountId);

      expect(result.synced_count).toBe(2);
      // Verify both entries were reset
      expect(edgeDb.update).toHaveBeenCalledTimes(4); // 2 resets + 2 syncs
    });

    it('should handle no failed entries', async () => {
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
        error: null
      });
      // Mock triggerSync with empty entries
      (edgeDb.select as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
        error: null
      });

      const result = await service.retryFailed(accountId);

      expect(result.synced_count).toBe(0);
      expect(result.failed_count).toBe(0);
    });
  });
});

