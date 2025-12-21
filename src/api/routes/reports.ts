import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { ReportService } from '../../services/reports/report.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import { validateQuery } from '../middleware/validation';
import { successResponse } from '../response';
import type { Router } from '../router';

const reportService = new ReportService();

const dateRangeSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format (YYYY-MM-DD)'),
  store_id: z.string().uuid().optional()
});

const periodSchema = dateRangeSchema.extend({
  group_by: z.enum(['day', 'week', 'month']).default('day')
});

const topProductsSchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().positive().max(100).default(10)
});

/**
 * Register report routes
 */
export function registerReportRoutes(router: Router): void {
  /**
   * GET /api/v1/reports/sales/summary
   * Get sales summary for a date range
   */
  router.get(
    '/api/v1/reports/sales/summary',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const summary = await reportService.getSalesSummary({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, summary, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/sales/by-period
   * Get sales grouped by period (day/week/month)
   */
  router.get(
    '/api/v1/reports/sales/by-period',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = periodSchema.parse(req.query || {});

      const salesByPeriod = await reportService.getSalesByPeriod(
        {
          account_id: accountId,
          store_id: query.store_id,
          start_date: query.start_date,
          end_date: query.end_date
        },
        query.group_by
      );

      successResponse(res, salesByPeriod, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(periodSchema)]
  );

  /**
   * GET /api/v1/reports/sales/hourly
   * Get hourly sales breakdown
   */
  router.get(
    '/api/v1/reports/sales/hourly',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const hourlySales = await reportService.getHourlySales({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, hourlySales, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/payments
   * Get payment summary by type
   */
  router.get(
    '/api/v1/reports/payments',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const paymentSummary = await reportService.getPaymentSummary({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, paymentSummary, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/products/top
   * Get top selling products
   */
  router.get(
    '/api/v1/reports/products/top',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = topProductsSchema.parse(req.query || {});

      const topProducts = await reportService.getTopProducts(
        {
          account_id: accountId,
          store_id: query.store_id,
          start_date: query.start_date,
          end_date: query.end_date
        },
        query.limit
      );

      successResponse(res, topProducts, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(topProductsSchema)]
  );

  /**
   * GET /api/v1/reports/employees
   * Get sales by employee
   */
  router.get(
    '/api/v1/reports/employees',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const employeeSales = await reportService.getEmployeeSales({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, employeeSales, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/shifts
   * Get shift summaries
   */
  router.get(
    '/api/v1/reports/shifts',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const shiftSummaries = await reportService.getShiftSummaries({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, shiftSummaries, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/dashboard
   * Get daily snapshots for dashboard
   */
  router.get(
    '/api/v1/reports/dashboard',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const snapshots = await reportService.getDailySnapshots({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, snapshots, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/inventory
   * Get inventory report
   */
  router.get(
    '/api/v1/reports/inventory',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const { store_id } = z
        .object({ store_id: z.string().uuid().optional() })
        .parse(req.query || {});

      const inventoryReport = await reportService.getInventoryReport(accountId, store_id);

      successResponse(res, inventoryReport, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateQuery(z.object({ store_id: z.string().uuid().optional() }))
    ]
  );

  /**
   * GET /api/v1/reports/taxes
   * Get tax report
   */
  router.get(
    '/api/v1/reports/taxes',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const taxReport = await reportService.getTaxReport({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, taxReport, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );

  /**
   * GET /api/v1/reports/discounts
   * Get discount usage report
   */
  router.get(
    '/api/v1/reports/discounts',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = dateRangeSchema.parse(req.query || {});

      const discountReport = await reportService.getDiscountReport({
        account_id: accountId,
        store_id: query.store_id,
        start_date: query.start_date,
        end_date: query.end_date
      });

      successResponse(res, discountReport, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(dateRangeSchema)]
  );
}
