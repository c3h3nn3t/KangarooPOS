import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { PaymentService } from '../../services/payments/payment.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const paymentService = new PaymentService();

// =============================================================================
// SCHEMAS
// =============================================================================

const processPaymentSchema = z.object({
  order_id: z.string().uuid(),
  payment_type_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().positive(),
  tip_cents: z.number().int().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Card payment fields
  gateway_transaction_id: z.string().nullable().optional(),
  gateway_response: z.record(z.unknown()).nullable().optional(),
  card_brand: z.string().nullable().optional(),
  card_last_four: z.string().length(4).nullable().optional()
});

const createRefundSchema = z.object({
  order_id: z.string().uuid(),
  payment_id: z.string().uuid().nullable().optional(),
  refund_type: z.enum(['full', 'partial', 'item']),
  amount_cents: z.number().int().positive(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        amount_cents: z.number().int().min(0),
        reason: z.string().nullable().default(null)
      })
    )
    .optional(),
  is_offline: z.boolean().default(false)
});

const querySchema = z.object({
  order_id: z.string().uuid().optional(),
  status: z
    .union([
      z.enum(['pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded']),
      z.array(z.enum(['pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded']))
    ])
    .optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const refundQuerySchema = z.object({
  order_id: z.string().uuid().optional(),
  status: z
    .union([
      z.enum(['pending', 'approved', 'processed', 'failed', 'cancelled']),
      z.array(z.enum(['pending', 'approved', 'processed', 'failed', 'cancelled']))
    ])
    .optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const uuidParamSchema = z.object({ id: z.string().uuid() });
const orderIdParamSchema = z.object({ orderId: z.string().uuid() });

// =============================================================================
// ROUTES
// =============================================================================

export function registerPaymentRoutes(router: Router): void {
  // ===========================================================================
  // PAYMENTS
  // ===========================================================================

  /**
   * GET /api/v1/payments
   * List payments with filters
   */
  router.get(
    '/api/v1/payments',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      const payments = await paymentService.searchPayments({
        account_id: accountId,
        order_id: query.order_id,
        status: query.status,
        from_date: query.from_date,
        to_date: query.to_date
      });

      // Apply pagination
      const start = (query.page - 1) * query.limit;
      const paginatedPayments = payments.slice(start, start + query.limit);

      paginatedResponse(res, paginatedPayments, payments.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/payments/:id
   * Get single payment
   */
  router.get(
    '/api/v1/payments/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const paymentId = req.params.id;

      const payment = await paymentService.getPaymentById(paymentId, accountId);

      successResponse(res, payment, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * GET /api/v1/orders/:orderId/payments
   * Get payments for an order
   */
  router.get(
    '/api/v1/orders/:orderId/payments',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.orderId;

      const payments = await paymentService.getPaymentsForOrder(orderId, accountId);

      successResponse(res, payments, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(orderIdParamSchema)]
  );

  /**
   * POST /api/v1/payments
   * Process a payment
   */
  router.post(
    '/api/v1/payments',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = processPaymentSchema.parse(req.body);

      const payment = await paymentService.processPayment({
        ...input,
        account_id: accountId
      });

      successResponse(res, payment, 201, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateBody(processPaymentSchema)]
  );

  /**
   * POST /api/v1/payments/:id/void
   * Void a payment
   */
  router.post(
    '/api/v1/payments/:id/void',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const paymentId = req.params.id;
      const body = z.object({ reason: z.string().optional() }).parse(req.body || {});

      const payment = await paymentService.voidPayment(paymentId, accountId, body.reason);

      successResponse(res, payment, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateParams(uuidParamSchema)]
  );

  /**
   * GET /api/v1/orders/:orderId/balance
   * Get payment balance for an order
   */
  router.get(
    '/api/v1/orders/:orderId/balance',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.orderId;

      const totalPaid = await paymentService.getTotalPaid(orderId, accountId);
      const remaining = await paymentService.getRemainingBalance(orderId, accountId);
      const isFullyPaid = await paymentService.isOrderFullyPaid(orderId, accountId);

      successResponse(
        res,
        {
          total_paid_cents: totalPaid,
          remaining_cents: remaining,
          is_fully_paid: isFullyPaid
        },
        200,
        { requestId: req.requestId }
      );
    },
    [authenticate(), validateParams(orderIdParamSchema)]
  );

  // ===========================================================================
  // REFUNDS
  // ===========================================================================

  /**
   * GET /api/v1/refunds
   * List refunds with filters
   */
  router.get(
    '/api/v1/refunds',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = refundQuerySchema.parse(req.query || {});

      const refunds = await paymentService.searchRefunds({
        account_id: accountId,
        order_id: query.order_id,
        status: query.status,
        from_date: query.from_date,
        to_date: query.to_date
      });

      // Apply pagination
      const start = (query.page - 1) * query.limit;
      const paginatedRefunds = refunds.slice(start, start + query.limit);

      paginatedResponse(res, paginatedRefunds, refunds.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/refunds/:id
   * Get single refund
   */
  router.get(
    '/api/v1/refunds/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const refundId = req.params.id;

      const refund = await paymentService.getRefundById(refundId, accountId);

      successResponse(res, refund, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * GET /api/v1/orders/:orderId/refunds
   * Get refunds for an order
   */
  router.get(
    '/api/v1/orders/:orderId/refunds',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.orderId;

      const refunds = await paymentService.getRefundsForOrder(orderId, accountId);

      successResponse(res, refunds, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(orderIdParamSchema)]
  );

  /**
   * POST /api/v1/refunds
   * Create a refund request
   */
  router.post(
    '/api/v1/refunds',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createRefundSchema.parse(req.body);

      const refund = await paymentService.createRefund({
        ...input,
        account_id: accountId,
        employee_id: req.employeeId || req.userId
      });

      successResponse(res, refund, 201, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateBody(createRefundSchema)]
  );

  /**
   * POST /api/v1/refunds/:id/approve
   * Approve a refund
   */
  router.post(
    '/api/v1/refunds/:id/approve',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const refundId = req.params.id;
      const approvedBy = req.employeeId || req.userId!;

      const refund = await paymentService.approveRefund(refundId, accountId, approvedBy);

      successResponse(res, refund, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/refunds/:id/process
   * Process an approved refund
   */
  router.post(
    '/api/v1/refunds/:id/process',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const refundId = req.params.id;

      const refund = await paymentService.processRefund(refundId, accountId);

      successResponse(res, refund, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/refunds/:id/cancel
   * Cancel a pending refund
   */
  router.post(
    '/api/v1/refunds/:id/cancel',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const refundId = req.params.id;
      const body = z.object({ reason: z.string().optional() }).parse(req.body || {});

      const refund = await paymentService.cancelRefund(refundId, accountId, body.reason);

      successResponse(res, refund, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateParams(uuidParamSchema)]
  );
}
