import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { SyncService } from '../../services/sync/sync.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import type { ConflictResolution, SyncStatus } from '../../types/database';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const syncService = new SyncService();

const syncStatusEnum = z.enum(['pending', 'syncing', 'synced', 'conflict', 'failed']);
const conflictResolutionEnum = z.enum(['local_wins', 'remote_wins', 'merged', 'manual']);

const journalQuerySchema = z.object({
  status: syncStatusEnum.optional(),
  table_name: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const pullDataSchema = z.object({
  store_id: z.string().uuid().optional(),
  tables: z.array(z.string()).optional(),
  since: z.string().optional()
});

const resolveConflictSchema = z.object({
  resolution: conflictResolutionEnum,
  resolved_data: z.record(z.unknown()).optional()
});

const setStatusSchema = z.object({
  online: z.boolean()
});

/**
 * Register sync routes
 */
export function registerSyncRoutes(router: Router): void {
  /**
   * GET /api/v1/sync/status
   * Get current sync status
   */
  router.get(
    '/api/v1/sync/status',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const status = await syncService.getSyncStatus(accountId);

      successResponse(res, status, 200, { requestId: req.requestId });
    },
    [authenticate()]
  );

  /**
   * POST /api/v1/sync/trigger
   * Trigger manual sync
   */
  router.post(
    '/api/v1/sync/trigger',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const result = await syncService.triggerSync(accountId);

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager')]
  );

  /**
   * GET /api/v1/sync/journal
   * Get sync journal entries
   */
  router.get(
    '/api/v1/sync/journal',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = journalQuerySchema.parse(req.query || {});

      // Get all matching entries for accurate total count
      const allEntries = await syncService.getSyncJournal(accountId, {
        status: query.status as SyncStatus | undefined,
        table_name: query.table_name
      });

      const start = (query.page - 1) * query.limit;
      const paginatedEntries = allEntries.slice(start, start + query.limit);

      paginatedResponse(res, paginatedEntries, allEntries.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(journalQuerySchema)]
  );

  /**
   * GET /api/v1/sync/conflicts
   * Get unresolved sync conflicts
   */
  router.get(
    '/api/v1/sync/conflicts',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const conflicts = await syncService.getConflicts(accountId);

      successResponse(res, conflicts, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager')]
  );

  /**
   * POST /api/v1/sync/conflicts/:id/resolve
   * Resolve a sync conflict
   */
  router.post(
    '/api/v1/sync/conflicts/:id/resolve',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const userId = req.userId!;
      const conflictId = req.params.id;
      const input = resolveConflictSchema.parse(req.body);

      const result = await syncService.resolveConflict({
        conflict_id: conflictId,
        account_id: accountId,
        resolution: input.resolution as ConflictResolution,
        resolved_data: input.resolved_data,
        resolved_by: userId
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(resolveConflictSchema)
    ]
  );

  /**
   * POST /api/v1/sync/pull
   * Pull data from cloud to edge
   */
  router.post(
    '/api/v1/sync/pull',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = pullDataSchema.parse(req.body || {});

      const result = await syncService.pullData({
        account_id: accountId,
        store_id: input.store_id,
        tables: input.tables,
        since: input.since
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateBody(pullDataSchema)]
  );

  /**
   * POST /api/v1/sync/retry
   * Retry failed sync entries
   */
  router.post(
    '/api/v1/sync/retry',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const result = await syncService.retryFailed(accountId);

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager')]
  );

  /**
   * DELETE /api/v1/sync/journal
   * Clear synced entries (cleanup)
   */
  router.delete(
    '/api/v1/sync/journal',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const { older_than } = z
        .object({ older_than: z.string().optional() })
        .parse(req.query || {});

      const result = await syncService.clearSyncedEntries(accountId, older_than);

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin'),
      validateQuery(z.object({ older_than: z.string().optional() }))
    ]
  );

  /**
   * GET /api/v1/sync/stats
   * Get sync statistics
   */
  router.get(
    '/api/v1/sync/stats',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const stats = await syncService.getSyncStats(accountId);

      successResponse(res, stats, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager')]
  );

  /**
   * PUT /api/v1/sync/online-status
   * Set online/offline status (for testing/manual override)
   */
  router.put(
    '/api/v1/sync/online-status',
    async (req: ApiRequest, res: ApiResponse) => {
      const input = setStatusSchema.parse(req.body);

      syncService.setOnlineStatus(input.online);

      successResponse(
        res,
        { online: input.online, message: `Status set to ${input.online ? 'online' : 'offline'}` },
        200,
        { requestId: req.requestId }
      );
    },
    [authenticate(), requireRole('owner', 'admin'), validateBody(setStatusSchema)]
  );
}
