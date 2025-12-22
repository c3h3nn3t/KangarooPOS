import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerOrderRoutes } from '../orders';

// Mock OrderService - use vi.hoisted() to define before vi.mock() hoisting
const { mockOrderService } = vi.hoisted(() => {
  const mock = {
    searchOrders: vi.fn(),
    getOrderWithDetails: vi.fn(),
    getOrderById: vi.fn(),
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    getOrderItems: vi.fn(),
    addOrderItem: vi.fn(),
    updateOrderItem: vi.fn(),
    removeOrderItem: vi.fn(),
    applyDiscount: vi.fn(),
    addTip: vi.fn(),
    submitOrder: vi.fn(),
    sendToKitchen: vi.fn(),
    markReady: vi.fn(),
    completeOrder: vi.fn(),
    cancelOrder: vi.fn()
  };
  return { mockOrderService: mock };
});

vi.mock('../../../services/orders/order.service', () => ({
  OrderService: vi.fn(() => mockOrderService)
}));

// Mock auth middleware
vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Order Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerOrderRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all order routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/orders');
      expect(paths).toContain('GET /api/v1/orders/:id');
      expect(paths).toContain('POST /api/v1/orders');
      expect(paths).toContain('PUT /api/v1/orders/:id');
      expect(paths).toContain('GET /api/v1/orders/:orderId/items');
      expect(paths).toContain('POST /api/v1/orders/:orderId/items');
      expect(paths).toContain('PUT /api/v1/orders/:orderId/items/:itemId');
      expect(paths).toContain('DELETE /api/v1/orders/:orderId/items/:itemId');
      expect(paths).toContain('POST /api/v1/orders/:id/discount');
      expect(paths).toContain('POST /api/v1/orders/:id/tip');
      expect(paths).toContain('POST /api/v1/orders/:id/submit');
      expect(paths).toContain('POST /api/v1/orders/:id/kitchen');
      expect(paths).toContain('POST /api/v1/orders/:id/ready');
      expect(paths).toContain('POST /api/v1/orders/:id/complete');
      expect(paths).toContain('POST /api/v1/orders/:id/cancel');
    });

    it('should use authentication middleware on all routes', () => {
      for (const route of router.routes) {
        expect(route.middlewares.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should list orders with pagination', async () => {
      const mockOrders = [
        { id: TEST_IDS.ORDER_ID, status: 'pending', total_cents: 1000 }
      ];
      mockOrderService.searchOrders.mockResolvedValue(mockOrders);

      const route = findRoute(router.routes, 'GET', '/api/v1/orders')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        url: '/api/v1/orders',
        query: { page: '1', limit: '20' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.searchOrders).toHaveBeenCalled();
      expect(res.body).toBeDefined();
    });

    it('should filter orders by status', async () => {
      mockOrderService.searchOrders.mockResolvedValue([]);

      const route = findRoute(router.routes, 'GET', '/api/v1/orders')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        url: '/api/v1/orders?status=pending',
        query: { status: 'pending' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.searchOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' })
      );
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should return order with details', async () => {
      const mockOrder = {
        id: TEST_IDS.ORDER_ID,
        status: 'pending',
        total_cents: 1000,
        items: []
      };
      mockOrderService.getOrderWithDetails.mockResolvedValue(mockOrder);

      const route = findRoute(router.routes, 'GET', '/api/v1/orders/:id')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        url: `/api/v1/orders/${TEST_IDS.ORDER_ID}`,
        params: { id: TEST_IDS.ORDER_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.getOrderWithDetails).toHaveBeenCalledWith(
        TEST_IDS.ORDER_ID,
        TEST_IDS.ACCOUNT_ID
      );
      expect(res.body).toEqual({
        success: true,
        data: mockOrder,
        meta: expect.any(Object)
      });
    });
  });

  describe('POST /api/v1/orders', () => {
    it('should create a new order', async () => {
      const newOrder = {
        id: TEST_IDS.ORDER_ID,
        store_id: TEST_IDS.STORE_ID,
        status: 'draft',
        total_cents: 0
      };
      mockOrderService.createOrder.mockResolvedValue(newOrder);

      const route = findRoute(router.routes, 'POST', '/api/v1/orders')!;
      const req = createJsonRequest('POST', {
        store_id: TEST_IDS.STORE_ID,
        order_type: 'dine_in'
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: TEST_IDS.STORE_ID,
          account_id: TEST_IDS.ACCOUNT_ID
        })
      );
    });

    it('should validate required fields', async () => {
      const route = findRoute(router.routes, 'POST', '/api/v1/orders')!;
      const req = createJsonRequest('POST', {});
      const res = createMockResponse();

      // Without proper validation middleware, this tests the Zod parsing in handler
      await expect(route.handler(req as any, res as any)).rejects.toThrow();
    });
  });

  describe('PUT /api/v1/orders/:id', () => {
    it('should update order metadata', async () => {
      const updatedOrder = {
        id: TEST_IDS.ORDER_ID,
        notes: 'Updated notes'
      };
      mockOrderService.updateOrder.mockResolvedValue(updatedOrder);

      const route = findRoute(router.routes, 'PUT', '/api/v1/orders/:id')!;
      const req = createJsonRequest(
        'PUT',
        { notes: 'Updated notes' },
        { params: { id: TEST_IDS.ORDER_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.updateOrder).toHaveBeenCalledWith(
        TEST_IDS.ORDER_ID,
        TEST_IDS.ACCOUNT_ID,
        expect.objectContaining({ notes: 'Updated notes' })
      );
    });
  });

  describe('POST /api/v1/orders/:orderId/items', () => {
    it('should add item to order', async () => {
      const newItem = {
        id: TEST_IDS.ITEM_ID,
        product_id: TEST_IDS.PRODUCT_ID,
        quantity: 2
      };
      mockOrderService.addOrderItem.mockResolvedValue(newItem);

      const route = findRoute(router.routes, 'POST', '/api/v1/orders/:orderId/items')!;
      const req = createJsonRequest(
        'POST',
        { product_id: TEST_IDS.PRODUCT_ID, quantity: 2 },
        { params: { orderId: TEST_IDS.ORDER_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.addOrderItem).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: TEST_IDS.ORDER_ID,
          product_id: TEST_IDS.PRODUCT_ID,
          quantity: 2
        }),
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('DELETE /api/v1/orders/:orderId/items/:itemId', () => {
    it('should remove item from order', async () => {
      mockOrderService.removeOrderItem.mockResolvedValue(undefined);

      const route = findRoute(router.routes, 'DELETE', '/api/v1/orders/:orderId/items/:itemId')!;
      const req = createAuthenticatedRequest({
        method: 'DELETE',
        params: { orderId: TEST_IDS.ORDER_ID, itemId: TEST_IDS.ITEM_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockOrderService.removeOrderItem).toHaveBeenCalledWith(
        TEST_IDS.ITEM_ID,
        TEST_IDS.ACCOUNT_ID
      );
      expect(res.body).toEqual({
        success: true,
        data: { id: TEST_IDS.ITEM_ID, deleted: true },
        meta: expect.any(Object)
      });
    });
  });

  describe('Order Actions', () => {
    describe('POST /api/v1/orders/:id/discount', () => {
      it('should apply discount to order', async () => {
        const discountedOrder = { id: TEST_IDS.ORDER_ID, discount_cents: 500 };
        mockOrderService.applyDiscount.mockResolvedValue(discountedOrder);

        const route = findRoute(router.routes, 'POST', '/api/v1/orders/:id/discount')!;
        const req = createJsonRequest(
          'POST',
          { type: 'fixed', name: '5 off', value: 500 },
          { params: { id: TEST_IDS.ORDER_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockOrderService.applyDiscount).toHaveBeenCalled();
      });
    });

    describe('POST /api/v1/orders/:id/tip', () => {
      it('should add tip to order', async () => {
        const orderWithTip = { id: TEST_IDS.ORDER_ID, tip_cents: 200 };
        mockOrderService.addTip.mockResolvedValue(orderWithTip);

        const route = findRoute(router.routes, 'POST', '/api/v1/orders/:id/tip')!;
        const req = createJsonRequest(
          'POST',
          { tip_cents: 200 },
          { params: { id: TEST_IDS.ORDER_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockOrderService.addTip).toHaveBeenCalledWith(
          TEST_IDS.ORDER_ID,
          200,
          TEST_IDS.ACCOUNT_ID
        );
      });
    });

    describe('POST /api/v1/orders/:id/submit', () => {
      it('should submit order', async () => {
        const submittedOrder = { id: TEST_IDS.ORDER_ID, status: 'pending' };
        mockOrderService.submitOrder.mockResolvedValue(submittedOrder);

        const route = findRoute(router.routes, 'POST', '/api/v1/orders/:id/submit')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: TEST_IDS.ORDER_ID }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockOrderService.submitOrder).toHaveBeenCalledWith(
          TEST_IDS.ORDER_ID,
          TEST_IDS.ACCOUNT_ID
        );
      });
    });

    describe('POST /api/v1/orders/:id/kitchen', () => {
      it('should send order to kitchen', async () => {
        const preparingOrder = { id: TEST_IDS.ORDER_ID, status: 'preparing' };
        mockOrderService.sendToKitchen.mockResolvedValue(preparingOrder);

        const route = findRoute(router.routes, 'POST', '/api/v1/orders/:id/kitchen')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: TEST_IDS.ORDER_ID }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockOrderService.sendToKitchen).toHaveBeenCalledWith(
          TEST_IDS.ORDER_ID,
          TEST_IDS.ACCOUNT_ID
        );
      });
    });

    describe('POST /api/v1/orders/:id/complete', () => {
      it('should complete order', async () => {
        const completedOrder = { id: TEST_IDS.ORDER_ID, status: 'completed' };
        mockOrderService.completeOrder.mockResolvedValue(completedOrder);

        const route = findRoute(router.routes, 'POST', '/api/v1/orders/:id/complete')!;
        const req = createJsonRequest(
          'POST',
          { receipt_number: 'R-001' },
          { params: { id: TEST_IDS.ORDER_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockOrderService.completeOrder).toHaveBeenCalledWith(
          TEST_IDS.ORDER_ID,
          TEST_IDS.ACCOUNT_ID,
          'R-001'
        );
      });
    });

    describe('POST /api/v1/orders/:id/cancel', () => {
      it('should cancel order', async () => {
        const cancelledOrder = { id: TEST_IDS.ORDER_ID, status: 'cancelled' };
        mockOrderService.cancelOrder.mockResolvedValue(cancelledOrder);

        const route = findRoute(router.routes, 'POST', '/api/v1/orders/:id/cancel')!;
        const req = createJsonRequest(
          'POST',
          { reason: 'Customer request' },
          { params: { id: TEST_IDS.ORDER_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockOrderService.cancelOrder).toHaveBeenCalledWith(
          TEST_IDS.ORDER_ID,
          TEST_IDS.ACCOUNT_ID,
          'Customer request'
        );
      });
    });
  });
});
