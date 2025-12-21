import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { OrderService } from '../../services/orders/order.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const orderService = new OrderService();

// =============================================================================
// SCHEMAS
// =============================================================================

const createOrderSchema = z.object({
  store_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().uuid().nullable().optional(),
  device_id: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  order_type: z.enum(['dine_in', 'takeout', 'delivery', 'online']).default('dine_in'),
  table_number: z.string().nullable().optional(),
  guest_count: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
  is_offline: z.boolean().default(false)
});

const updateOrderSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  table_number: z.string().nullable().optional(),
  guest_count: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  order_type: z.enum(['dine_in', 'takeout', 'delivery', 'online']).optional()
});

const addItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive().default(1),
  unit_price_cents: z.number().int().min(0).optional(),
  modifiers: z
    .array(
      z.object({
        modifier_id: z.string().uuid(),
        name: z.string(),
        price_cents: z.number().int().min(0)
      })
    )
    .optional(),
  notes: z.string().nullable().optional()
});

const updateItemSchema = z.object({
  quantity: z.number().positive().optional(),
  notes: z.string().nullable().optional()
});

const applyDiscountSchema = z.object({
  type: z.enum(['percent', 'fixed']),
  name: z.string().min(1),
  value: z.number().min(0),
  applied_to: z.enum(['order', 'item']).default('order'),
  item_id: z.string().uuid().optional()
});

const addTipSchema = z.object({
  tip_cents: z.number().int().min(0)
});

const querySchema = z.object({
  store_id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  status: z
    .union([
      z.enum(['draft', 'pending', 'preparing', 'ready', 'completed', 'cancelled', 'refunded']),
      z.array(z.enum(['draft', 'pending', 'preparing', 'ready', 'completed', 'cancelled', 'refunded']))
    ])
    .optional(),
  order_type: z.enum(['dine_in', 'takeout', 'delivery', 'online']).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  receipt_number: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const uuidParamSchema = z.object({ id: z.string().uuid() });
const orderIdParamSchema = z.object({ orderId: z.string().uuid() });
const itemIdParamSchema = z.object({ orderId: z.string().uuid(), itemId: z.string().uuid() });

// =============================================================================
// ROUTES
// =============================================================================

export function registerOrderRoutes(router: Router): void {
  // ===========================================================================
  // ORDERS
  // ===========================================================================

  /**
   * GET /api/v1/orders
   * List orders with filters
   */
  router.get(
    '/api/v1/orders',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      // Get total count for pagination (without limit)
      const allOrders = await orderService.searchOrders({
        account_id: accountId,
        store_id: query.store_id,
        employee_id: query.employee_id,
        customer_id: query.customer_id,
        status: query.status,
        order_type: query.order_type,
        from_date: query.from_date,
        to_date: query.to_date,
        receipt_number: query.receipt_number
      });

      // Get paginated results
      const orders = await orderService.searchOrders({
        account_id: accountId,
        store_id: query.store_id,
        employee_id: query.employee_id,
        customer_id: query.customer_id,
        status: query.status,
        order_type: query.order_type,
        from_date: query.from_date,
        to_date: query.to_date,
        receipt_number: query.receipt_number,
        limit: query.limit,
        offset: (query.page - 1) * query.limit
      });

      paginatedResponse(res, orders, allOrders.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/orders/:id
   * Get single order with items
   */
  router.get(
    '/api/v1/orders/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;

      const result = await orderService.getOrderWithDetails(orderId, accountId);

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/orders
   * Create a new order
   */
  router.post(
    '/api/v1/orders',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createOrderSchema.parse(req.body);

      const order = await orderService.createOrder({
        ...input,
        account_id: accountId,
        employee_id: input.employee_id || req.employeeId || req.userId
      });

      successResponse(res, order, 201, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateBody(createOrderSchema)]
  );

  /**
   * PUT /api/v1/orders/:id
   * Update order metadata
   */
  router.put(
    '/api/v1/orders/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;
      const input = updateOrderSchema.parse(req.body);

      const order = await orderService.updateOrder(orderId, accountId, input);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('cashier'),
      validateParams(uuidParamSchema),
      validateBody(updateOrderSchema)
    ]
  );

  // ===========================================================================
  // ORDER ITEMS
  // ===========================================================================

  /**
   * GET /api/v1/orders/:orderId/items
   * Get items for an order
   */
  router.get(
    '/api/v1/orders/:orderId/items',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.orderId;

      // Verify order access
      await orderService.getOrderById(orderId, accountId);
      const items = await orderService.getOrderItems(orderId);

      successResponse(res, items, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(orderIdParamSchema)]
  );

  /**
   * POST /api/v1/orders/:orderId/items
   * Add item to order
   */
  router.post(
    '/api/v1/orders/:orderId/items',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.orderId;
      const input = addItemSchema.parse(req.body);

      const item = await orderService.addOrderItem(
        { ...input, order_id: orderId },
        accountId
      );

      successResponse(res, item, 201, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('cashier'),
      validateParams(orderIdParamSchema),
      validateBody(addItemSchema)
    ]
  );

  /**
   * PUT /api/v1/orders/:orderId/items/:itemId
   * Update order item
   */
  router.put(
    '/api/v1/orders/:orderId/items/:itemId',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const itemId = req.params.itemId;
      const input = updateItemSchema.parse(req.body);

      const item = await orderService.updateOrderItem(itemId, input, accountId);

      successResponse(res, item, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('cashier'),
      validateParams(itemIdParamSchema),
      validateBody(updateItemSchema)
    ]
  );

  /**
   * DELETE /api/v1/orders/:orderId/items/:itemId
   * Remove item from order
   */
  router.delete(
    '/api/v1/orders/:orderId/items/:itemId',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const itemId = req.params.itemId;

      await orderService.removeOrderItem(itemId, accountId);

      successResponse(res, { id: itemId, deleted: true }, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateParams(itemIdParamSchema)]
  );

  // ===========================================================================
  // ORDER ACTIONS
  // ===========================================================================

  /**
   * POST /api/v1/orders/:id/discount
   * Apply discount to order
   */
  router.post(
    '/api/v1/orders/:id/discount',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;
      const input = applyDiscountSchema.parse(req.body);

      const order = await orderService.applyDiscount(
        { ...input, order_id: orderId },
        accountId
      );

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('manager'),
      validateParams(uuidParamSchema),
      validateBody(applyDiscountSchema)
    ]
  );

  /**
   * POST /api/v1/orders/:id/tip
   * Add tip to order
   */
  router.post(
    '/api/v1/orders/:id/tip',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;
      const input = addTipSchema.parse(req.body);

      const order = await orderService.addTip(orderId, input.tip_cents, accountId);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('cashier'),
      validateParams(uuidParamSchema),
      validateBody(addTipSchema)
    ]
  );

  /**
   * POST /api/v1/orders/:id/submit
   * Submit order (draft -> pending)
   */
  router.post(
    '/api/v1/orders/:id/submit',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;

      const order = await orderService.submitOrder(orderId, accountId);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/orders/:id/kitchen
   * Send order to kitchen (pending -> preparing)
   */
  router.post(
    '/api/v1/orders/:id/kitchen',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;

      const order = await orderService.sendToKitchen(orderId, accountId);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/orders/:id/ready
   * Mark order as ready (preparing -> ready)
   */
  router.post(
    '/api/v1/orders/:id/ready',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;

      const order = await orderService.markReady(orderId, accountId);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('kitchen'), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/orders/:id/complete
   * Complete order (after payment)
   */
  router.post(
    '/api/v1/orders/:id/complete',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;
      const body = z
        .object({ receipt_number: z.string().optional() })
        .parse(req.body || {});

      const order = await orderService.completeOrder(orderId, accountId, body.receipt_number);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('cashier'), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/orders/:id/cancel
   * Cancel order
   */
  router.post(
    '/api/v1/orders/:id/cancel',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.id;
      const body = z
        .object({ reason: z.string().optional() })
        .parse(req.body || {});

      const order = await orderService.cancelOrder(orderId, accountId, body.reason);

      successResponse(res, order, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateParams(uuidParamSchema)]
  );
}
