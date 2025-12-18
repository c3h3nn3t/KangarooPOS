import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { ShiftService } from '../../services/shifts/shift.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const shiftService = new ShiftService();

// =============================================================================
// SCHEMAS
// =============================================================================

const openShiftSchema = z.object({
  store_id: z.string().uuid(),
  device_id: z.string().uuid().nullable().optional(),
  opening_cash_cents: z.number().int().min(0),
  notes: z.string().nullable().optional()
});

const closeShiftSchema = z.object({
  closing_cash_cents: z.number().int().min(0),
  notes: z.string().nullable().optional()
});

const cashMovementSchema = z.object({
  type: z.enum(['cash_in', 'cash_out']),
  amount_cents: z.number().int().positive(),
  reason: z.string().optional()
});

const querySchema = z.object({
  store_id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  status: z.enum(['open', 'closed']).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const uuidParamSchema = z.object({ id: z.string().uuid() });

// =============================================================================
// ROUTES
// =============================================================================

export function registerShiftRoutes(router: Router): void {
  /**
   * GET /api/v1/shifts
   * List shifts with filters
   */
  router.get(
    '/api/v1/shifts',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      const shifts = await shiftService.searchShifts({
        account_id: accountId,
        store_id: query.store_id,
        employee_id: query.employee_id,
        status: query.status,
        from_date: query.from_date,
        to_date: query.to_date
      });

      // Apply pagination
      const start = (query.page - 1) * query.limit;
      const paginatedShifts = shifts.slice(start, start + query.limit);

      paginatedResponse(res, paginatedShifts, shifts.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/shifts/current
   * Get current employee's open shift
   */
  router.get(
    '/api/v1/shifts/current',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.employeeId || req.userId!;

      const shift = await shiftService.getCurrentShift(employeeId, accountId);

      successResponse(res, shift, 200, { requestId: req.requestId });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/shifts/:id
   * Get single shift
   */
  router.get(
    '/api/v1/shifts/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const shiftId = req.params.id;

      const shift = await shiftService.getShiftById(shiftId, accountId);

      successResponse(res, shift, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * GET /api/v1/shifts/:id/summary
   * Get shift summary with calculated totals
   */
  router.get(
    '/api/v1/shifts/:id/summary',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const shiftId = req.params.id;

      const summary = await shiftService.getShiftSummary(shiftId, accountId);

      successResponse(res, summary, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/shifts
   * Open a new shift
   */
  router.post(
    '/api/v1/shifts',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.employeeId || req.userId!;
      const input = openShiftSchema.parse(req.body);

      const shift = await shiftService.openShift({
        ...input,
        account_id: accountId,
        employee_id: employeeId
      });

      successResponse(res, shift, 201, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateBody(openShiftSchema)]
  );

  /**
   * POST /api/v1/shifts/:id/close
   * Close a shift
   */
  router.post(
    '/api/v1/shifts/:id/close',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const shiftId = req.params.id;
      const input = closeShiftSchema.parse(req.body);

      const shift = await shiftService.closeShift(shiftId, input, accountId);

      successResponse(res, shift, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('cashier'),
      validateParams(uuidParamSchema),
      validateBody(closeShiftSchema)
    ]
  );

  /**
   * POST /api/v1/shifts/:id/cash-movement
   * Add cash in/out to shift
   */
  router.post(
    '/api/v1/shifts/:id/cash-movement',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const shiftId = req.params.id;
      const input = cashMovementSchema.parse(req.body);

      const shift = await shiftService.addCashMovement(shiftId, input, accountId);

      successResponse(res, shift, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('cashier'),
      validateParams(uuidParamSchema),
      validateBody(cashMovementSchema)
    ]
  );

  /**
   * GET /api/v1/reports/daily
   * Get daily summary for a store
   */
  router.get(
    '/api/v1/reports/daily',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = z
        .object({
          store_id: z.string().uuid(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // YYYY-MM-DD
        })
        .parse(req.query);

      const summary = await shiftService.getDailySummary(
        query.store_id,
        query.date,
        accountId
      );

      successResponse(res, summary, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('manager'),
      validateQuery(
        z.object({
          store_id: z.string().uuid(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
        })
      )
    ]
  );
}
