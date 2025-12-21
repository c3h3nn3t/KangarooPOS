import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerPaymentRoutes } from '../payments';

// Mock PaymentService
const mockPaymentService = {
  searchPayments: vi.fn(),
  getPaymentById: vi.fn(),
  getPaymentsForOrder: vi.fn(),
  processPayment: vi.fn(),
  voidPayment: vi.fn(),
  getTotalPaid: vi.fn(),
  getRemainingBalance: vi.fn(),
  isOrderFullyPaid: vi.fn(),
  searchRefunds: vi.fn(),
  getRefundById: vi.fn(),
  getRefundsForOrder: vi.fn(),
  createRefund: vi.fn(),
  approveRefund: vi.fn(),
  processRefund: vi.fn(),
  cancelRefund: vi.fn()
};

vi.mock('../../../services/payments/payment.service', () => ({
  PaymentService: vi.fn(() => mockPaymentService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Payment Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerPaymentRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all payment routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/payments');
      expect(paths).toContain('GET /api/v1/payments/:id');
      expect(paths).toContain('GET /api/v1/orders/:orderId/payments');
      expect(paths).toContain('POST /api/v1/payments');
      expect(paths).toContain('POST /api/v1/payments/:id/void');
      expect(paths).toContain('GET /api/v1/orders/:orderId/balance');
      expect(paths).toContain('GET /api/v1/refunds');
      expect(paths).toContain('GET /api/v1/refunds/:id');
      expect(paths).toContain('GET /api/v1/orders/:orderId/refunds');
      expect(paths).toContain('POST /api/v1/refunds');
      expect(paths).toContain('POST /api/v1/refunds/:id/approve');
      expect(paths).toContain('POST /api/v1/refunds/:id/process');
      expect(paths).toContain('POST /api/v1/refunds/:id/cancel');
    });
  });

  describe('GET /api/v1/payments', () => {
    it('should list payments with pagination', async () => {
      const mockPayments = [
        { id: TEST_IDS.PAYMENT_ID, amount_cents: 1000, status: 'captured' }
      ];
      mockPaymentService.searchPayments.mockResolvedValue(mockPayments);

      const route = findRoute(router.routes, 'GET', '/api/v1/payments')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockPaymentService.searchPayments).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        order_id: undefined,
        status: undefined,
        from_date: undefined,
        to_date: undefined
      });
    });
  });

  describe('POST /api/v1/payments', () => {
    it('should process a payment', async () => {
      const newPayment = {
        id: TEST_IDS.PAYMENT_ID,
        amount_cents: 1500,
        status: 'captured'
      };
      mockPaymentService.processPayment.mockResolvedValue(newPayment);

      const route = findRoute(router.routes, 'POST', '/api/v1/payments')!;
      const req = createJsonRequest('POST', {
        order_id: TEST_IDS.ORDER_ID,
        amount_cents: 1500
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockPaymentService.processPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: TEST_IDS.ORDER_ID,
          amount_cents: 1500,
          account_id: TEST_IDS.ACCOUNT_ID
        })
      );
    });
  });

  describe('POST /api/v1/payments/:id/void', () => {
    it('should void a payment', async () => {
      const voidedPayment = { id: TEST_IDS.PAYMENT_ID, status: 'cancelled' };
      mockPaymentService.voidPayment.mockResolvedValue(voidedPayment);

      const route = findRoute(router.routes, 'POST', '/api/v1/payments/:id/void')!;
      const req = createJsonRequest(
        'POST',
        { reason: 'Customer request' },
        { params: { id: TEST_IDS.PAYMENT_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockPaymentService.voidPayment).toHaveBeenCalledWith(
        TEST_IDS.PAYMENT_ID,
        TEST_IDS.ACCOUNT_ID,
        'Customer request'
      );
    });
  });

  describe('GET /api/v1/orders/:orderId/balance', () => {
    it('should return order payment balance', async () => {
      mockPaymentService.getTotalPaid.mockResolvedValue(1000);
      mockPaymentService.getRemainingBalance.mockResolvedValue(500);
      mockPaymentService.isOrderFullyPaid.mockResolvedValue(false);

      const route = findRoute(router.routes, 'GET', '/api/v1/orders/:orderId/balance')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { orderId: TEST_IDS.ORDER_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({
        success: true,
        data: {
          total_paid_cents: 1000,
          remaining_cents: 500,
          is_fully_paid: false
        },
        meta: expect.any(Object)
      });
    });
  });

  describe('Refund Routes', () => {
    describe('POST /api/v1/refunds', () => {
      it('should create a refund', async () => {
        const newRefund = {
          id: 'refund-1',
          amount_cents: 500,
          status: 'pending'
        };
        mockPaymentService.createRefund.mockResolvedValue(newRefund);

        const route = findRoute(router.routes, 'POST', '/api/v1/refunds')!;
        const req = createJsonRequest('POST', {
          order_id: TEST_IDS.ORDER_ID,
          refund_type: 'partial',
          amount_cents: 500
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockPaymentService.createRefund).toHaveBeenCalledWith(
          expect.objectContaining({
            order_id: TEST_IDS.ORDER_ID,
            refund_type: 'partial',
            amount_cents: 500,
            account_id: TEST_IDS.ACCOUNT_ID
          })
        );
      });
    });

    describe('POST /api/v1/refunds/:id/approve', () => {
      it('should approve a refund', async () => {
        const approvedRefund = { id: 'refund-1', status: 'approved' };
        mockPaymentService.approveRefund.mockResolvedValue(approvedRefund);

        const route = findRoute(router.routes, 'POST', '/api/v1/refunds/:id/approve')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: 'refund-1' }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockPaymentService.approveRefund).toHaveBeenCalledWith(
          'refund-1',
          TEST_IDS.ACCOUNT_ID,
          TEST_IDS.EMPLOYEE_ID
        );
      });
    });

    describe('POST /api/v1/refunds/:id/process', () => {
      it('should process an approved refund', async () => {
        const processedRefund = { id: 'refund-1', status: 'processed' };
        mockPaymentService.processRefund.mockResolvedValue(processedRefund);

        const route = findRoute(router.routes, 'POST', '/api/v1/refunds/:id/process')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: 'refund-1' }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockPaymentService.processRefund).toHaveBeenCalledWith(
          'refund-1',
          TEST_IDS.ACCOUNT_ID
        );
      });
    });
  });
});
