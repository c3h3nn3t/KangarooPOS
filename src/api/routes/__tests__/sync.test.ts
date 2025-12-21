import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerSyncRoutes } from '../sync';

// Mock SyncService
const mockSyncService = {
  getSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
  getSyncJournal: vi.fn(),
  getConflicts: vi.fn(),
  resolveConflict: vi.fn(),
  pullData: vi.fn(),
  retryFailed: vi.fn(),
  clearSyncedEntries: vi.fn(),
  getSyncStats: vi.fn(),
  setOnlineStatus: vi.fn()
};

vi.mock('../../../services/sync/sync.service', () => ({
  SyncService: vi.fn(() => mockSyncService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Sync Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerSyncRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all sync routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/sync/status');
      expect(paths).toContain('POST /api/v1/sync/trigger');
      expect(paths).toContain('GET /api/v1/sync/journal');
      expect(paths).toContain('GET /api/v1/sync/conflicts');
      expect(paths).toContain('POST /api/v1/sync/conflicts/:id/resolve');
      expect(paths).toContain('POST /api/v1/sync/pull');
      expect(paths).toContain('POST /api/v1/sync/retry');
      expect(paths).toContain('DELETE /api/v1/sync/journal');
      expect(paths).toContain('GET /api/v1/sync/stats');
      expect(paths).toContain('PUT /api/v1/sync/online-status');
    });
  });

  describe('GET /api/v1/sync/status', () => {
    it('should return sync status', async () => {
      const status = {
        online: true,
        last_sync: '2025-01-15T10:00:00Z',
        pending_entries: 5,
        conflicts: 0
      };
      mockSyncService.getSyncStatus.mockResolvedValue(status);

      const route = findRoute(router.routes, 'GET', '/api/v1/sync/status')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.getSyncStatus).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
      expect(res.body).toEqual({
        success: true,
        data: status,
        meta: expect.any(Object)
      });
    });
  });

  describe('POST /api/v1/sync/trigger', () => {
    it('should trigger manual sync', async () => {
      const result = { synced: 10, failed: 0, conflicts: 0 };
      mockSyncService.triggerSync.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/sync/trigger')!;
      const req = createAuthenticatedRequest({ method: 'POST' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.triggerSync).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
    });
  });

  describe('GET /api/v1/sync/journal', () => {
    it('should return sync journal entries', async () => {
      const entries = [
        { id: 'sync-1', operation: 'insert', table_name: 'orders', status: 'synced' }
      ];
      mockSyncService.getSyncJournal.mockResolvedValue(entries);

      const route = findRoute(router.routes, 'GET', '/api/v1/sync/journal')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { status: 'pending' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.getSyncJournal).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID, {
        status: 'pending',
        table_name: undefined
      });
    });
  });

  describe('GET /api/v1/sync/conflicts', () => {
    it('should return unresolved conflicts', async () => {
      const conflicts = [
        { id: 'conflict-1', sync_journal_id: 'sync-1', conflict_type: 'version' }
      ];
      mockSyncService.getConflicts.mockResolvedValue(conflicts);

      const route = findRoute(router.routes, 'GET', '/api/v1/sync/conflicts')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.getConflicts).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
    });
  });

  describe('POST /api/v1/sync/conflicts/:id/resolve', () => {
    it('should resolve a conflict with local_wins', async () => {
      const result = { success: true, conflict_id: 'conflict-1' };
      mockSyncService.resolveConflict.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/sync/conflicts/:id/resolve')!;
      const req = createJsonRequest(
        'POST',
        { resolution: 'local_wins' },
        { params: { id: 'conflict-1' } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.resolveConflict).toHaveBeenCalledWith({
        conflict_id: 'conflict-1',
        account_id: TEST_IDS.ACCOUNT_ID,
        resolution: 'local_wins',
        resolved_data: undefined,
        resolved_by: TEST_IDS.USER_ID
      });
    });

    it('should resolve a conflict with manual data', async () => {
      const result = { success: true, conflict_id: 'conflict-1' };
      mockSyncService.resolveConflict.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/sync/conflicts/:id/resolve')!;
      const req = createJsonRequest(
        'POST',
        {
          resolution: 'manual',
          resolved_data: { total_cents: 1500 }
        },
        { params: { id: 'conflict-1' } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.resolveConflict).toHaveBeenCalledWith({
        conflict_id: 'conflict-1',
        account_id: TEST_IDS.ACCOUNT_ID,
        resolution: 'manual',
        resolved_data: { total_cents: 1500 },
        resolved_by: TEST_IDS.USER_ID
      });
    });
  });

  describe('POST /api/v1/sync/pull', () => {
    it('should pull data from cloud', async () => {
      const result = { tables_synced: ['products', 'categories'], records_pulled: 100 };
      mockSyncService.pullData.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/sync/pull')!;
      const req = createJsonRequest('POST', {
        store_id: TEST_IDS.STORE_ID,
        tables: ['products', 'categories']
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.pullData).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: TEST_IDS.STORE_ID,
        tables: ['products', 'categories'],
        since: undefined
      });
    });
  });

  describe('POST /api/v1/sync/retry', () => {
    it('should retry failed entries', async () => {
      const result = { retried: 5, succeeded: 4, failed: 1 };
      mockSyncService.retryFailed.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/sync/retry')!;
      const req = createAuthenticatedRequest({ method: 'POST' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.retryFailed).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
    });
  });

  describe('DELETE /api/v1/sync/journal', () => {
    it('should clear synced entries', async () => {
      const result = { deleted: 100 };
      mockSyncService.clearSyncedEntries.mockResolvedValue(result);

      const route = findRoute(router.routes, 'DELETE', '/api/v1/sync/journal')!;
      const req = createAuthenticatedRequest({
        method: 'DELETE',
        query: { older_than: '2025-01-01' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.clearSyncedEntries).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        '2025-01-01'
      );
    });
  });

  describe('GET /api/v1/sync/stats', () => {
    it('should return sync statistics', async () => {
      const stats = {
        total_entries: 1000,
        by_status: { pending: 10, synced: 980, failed: 5, conflict: 5 },
        by_table: { orders: 500, order_items: 300, payments: 200 }
      };
      mockSyncService.getSyncStats.mockResolvedValue(stats);

      const route = findRoute(router.routes, 'GET', '/api/v1/sync/stats')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.getSyncStats).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
    });
  });

  describe('PUT /api/v1/sync/online-status', () => {
    it('should set online status', async () => {
      const route = findRoute(router.routes, 'PUT', '/api/v1/sync/online-status')!;
      const req = createJsonRequest('PUT', { online: false });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockSyncService.setOnlineStatus).toHaveBeenCalledWith(false);
      expect(res.body).toEqual({
        success: true,
        data: { online: false, message: 'Status set to offline' },
        meta: expect.any(Object)
      });
    });
  });
});
