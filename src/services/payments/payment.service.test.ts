import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from './payment.service';
import { NotFoundError, ValidationError, ConflictError, OfflineOperationError } from '../../utils/errors';
import type { Payment, Refund, Order } from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';
import { config } from '../../config/env';

// Mock database adapter
const mockDb: DatabaseAdapter = {
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isOnline: true,
  setOnlineStatus: vi.fn()
} as unknown as DatabaseAdapter;

// Mock OrderService
const mockOrderService = {
  getOrderById: vi.fn(),
  completeOrder: vi.fn(),
  setTip: vi.fn()
};

vi.mock('../orders/order.service', () => ({
  OrderService: vi.fn(() => mockOrderService)
}));

describe('PaymentService', () => {
  let service: PaymentService;
  const accountId = 'account-123';
  const orderId = 'order-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaymentService();
    // Inject mock db
    (service as unknown as { db: typeof mockDb }).db = mockDb;
    // Inject mock order service
    (service as unknown as { orderService: typeof mockOrderService }).orderService = mockOrderService;
  });

  describe('getPayments', () => {
    it('should fetch payments for an account', async () => {
      const mockPayments: Payment[] = [
        {
          id: 'payment-1',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 1000,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockPayments, error: null });

      const result = await service.getPayments(accountId);

      expect(result).toEqual(mockPayments);
      expect(mockDb.select).toHaveBeenCalledWith('payments', {
        where: [{ column: 'account_id', operator: '=', value: accountId }],
        orderBy: [{ column: 'created_at', direction: 'desc' }]
      });
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getPayments(accountId)).rejects.toThrow('Failed to fetch payments');
    });
  });

  describe('getPaymentById', () => {
    it('should return payment when found', async () => {
      const mockPayment: Payment = {
        id: 'payment-1',
        account_id: accountId,
        order_id: orderId,
        amount_cents: 1000,
        tip_cents: 0,
        currency: 'USD',
        status: 'captured',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockPayment, error: null });

      const result = await service.getPaymentById('payment-1', accountId);

      expect(result).toEqual(mockPayment);
    });

    it('should throw NotFoundError when payment not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getPaymentById('payment-1', accountId)).rejects.toThrow();
      try {
        await service.getPaymentById('payment-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'NOT_FOUND');
        expect(error).toHaveProperty('statusCode', 404);
      }
    });

    it('should throw NotFoundError when payment belongs to different account', async () => {
      const mockPayment: Payment = {
        id: 'payment-1',
        account_id: 'other-account',
        order_id: orderId,
        amount_cents: 1000,
        tip_cents: 0,
        currency: 'USD',
        status: 'captured',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockPayment, error: null });

      await expect(service.getPaymentById('payment-1', accountId)).rejects.toThrow();
      try {
        await service.getPaymentById('payment-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'NOT_FOUND');
      }
    });
  });

  describe('getPaymentsForOrder', () => {
    it('should fetch payments for an order', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'completed',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockPayments: Payment[] = [
        {
          id: 'payment-1',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 1100,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: mockPayments, error: null });

      const result = await service.getPaymentsForOrder(orderId, accountId);

      expect(result).toEqual(mockPayments);
      expect(mockOrderService.getOrderById).toHaveBeenCalledWith(orderId, accountId);
    });
  });

  describe('processPayment', () => {
    it('should process payment for an order', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockPayment: Payment = {
        id: 'payment-1',
        account_id: accountId,
        order_id: orderId,
        amount_cents: 1100,
        tip_cents: 0,
        currency: 'USD',
        status: 'captured',
        processed_at: '2025-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No existing payments
      mockDb.insert.mockResolvedValue({ data: mockPayment, error: null });
      mockOrderService.getOrderById.mockResolvedValueOnce(order); // For completeOrder check
      mockOrderService.completeOrder.mockResolvedValue({ ...order, status: 'completed' });

      const result = await service.processPayment({
        order_id: orderId,
        account_id: accountId,
        amount_cents: 1100
      });

      expect(result).toEqual(mockPayment);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockOrderService.completeOrder).toHaveBeenCalledWith(orderId, accountId);
    });

    it('should throw ConflictError when order is not in pending/ready status', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'draft',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);

      await expect(
        service.processPayment({
          order_id: orderId,
          account_id: accountId,
          amount_cents: 1100
        })
      ).rejects.toThrow();
      try {
        await service.processPayment({
          order_id: orderId,
          account_id: accountId,
          amount_cents: 1100
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
        expect(error).toHaveProperty('statusCode', 409);
      }
    });

    it('should throw ValidationError when amount is zero or negative', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);

      await expect(
        service.processPayment({
          order_id: orderId,
          account_id: accountId,
          amount_cents: 0
        })
      ).rejects.toThrow();
      try {
        await service.processPayment({
          order_id: orderId,
          account_id: accountId,
          amount_cents: 0
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(error).toHaveProperty('statusCode', 400);
      }
    });

    it('should throw ValidationError when payment exceeds remaining balance', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const existingPayment: Payment = {
        id: 'payment-1',
        account_id: accountId,
        order_id: orderId,
        amount_cents: 500,
        tip_cents: 0,
        currency: 'USD',
        status: 'captured',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: [existingPayment], error: null });

      await expect(
        service.processPayment({
          order_id: orderId,
          account_id: accountId,
          amount_cents: 800 // 500 + 800 = 1300 > 1100 + 100 (overpayment limit of 100)
        })
      ).rejects.toThrow();
      try {
        await service.processPayment({
          order_id: orderId,
          account_id: accountId,
          amount_cents: 800
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });

    it('should set tip when provided', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockPayment: Payment = {
        id: 'payment-1',
        account_id: accountId,
        order_id: orderId,
        amount_cents: 1100,
        tip_cents: 200,
        currency: 'USD',
        status: 'captured',
        processed_at: '2025-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockOrderService.setTip.mockResolvedValue({ ...order, tip_cents: 200, total_cents: 1300 });
      mockDb.insert.mockResolvedValue({ data: mockPayment, error: null });
      mockOrderService.getOrderById.mockResolvedValueOnce({ ...order, tip_cents: 200, total_cents: 1300 });
      mockOrderService.completeOrder.mockResolvedValue({ ...order, status: 'completed' });

      await service.processPayment({
        order_id: orderId,
        account_id: accountId,
        amount_cents: 1100,
        tip_cents: 200
      });

      expect(mockOrderService.setTip).toHaveBeenCalledWith(orderId, 200, accountId);
    });
  });

  describe('voidPayment', () => {
    it('should void a captured payment', async () => {
      const payment: Payment = {
        id: 'payment-1',
        account_id: accountId,
        order_id: orderId,
        amount_cents: 1000,
        tip_cents: 0,
        currency: 'USD',
        status: 'captured',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const voidedPayment = { ...payment, status: 'cancelled' as const };

      mockDb.selectOne.mockResolvedValue({ data: payment, error: null });
      mockDb.update.mockResolvedValue({ data: voidedPayment, error: null });

      const result = await service.voidPayment('payment-1', accountId, 'Customer cancelled');

      expect(result.status).toBe('cancelled');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ConflictError when payment cannot be voided', async () => {
      const payment: Payment = {
        id: 'payment-1',
        account_id: accountId,
        order_id: orderId,
        amount_cents: 1000,
        tip_cents: 0,
        currency: 'USD',
        status: 'refunded',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: payment, error: null });

      await expect(service.voidPayment('payment-1', accountId)).rejects.toThrow();
      try {
        await service.voidPayment('payment-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
      }
    });
  });

  describe('createRefund', () => {
    it('should create a refund for a completed order', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'completed',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockRefund: Refund = {
        id: 'refund-1',
        account_id: accountId,
        order_id: orderId,
        refund_type: 'full',
        amount_cents: 1100,
        currency: 'USD',
        status: 'pending',
        items: [],
        is_offline: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No existing refunds
      mockDb.insert.mockResolvedValue({ data: mockRefund, error: null });

      const result = await service.createRefund({
        order_id: orderId,
        account_id: accountId,
        refund_type: 'full',
        amount_cents: 1100
      });

      expect(result).toEqual(mockRefund);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw ConflictError when order is not completed', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);

      await expect(
        service.createRefund({
          order_id: orderId,
          account_id: accountId,
          refund_type: 'full',
          amount_cents: 1100
        })
      ).rejects.toThrow();
      try {
        await service.createRefund({
          order_id: orderId,
          account_id: accountId,
          refund_type: 'full',
          amount_cents: 1100
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
      }
    });

    it('should throw ValidationError when refund amount exceeds refundable amount', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'completed',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const existingRefund: Refund = {
        id: 'refund-1',
        account_id: accountId,
        order_id: orderId,
        refund_type: 'partial',
        amount_cents: 500,
        currency: 'USD',
        status: 'processed',
        items: [],
        is_offline: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: [existingRefund], error: null });

      await expect(
        service.createRefund({
          order_id: orderId,
          account_id: accountId,
          refund_type: 'partial',
          amount_cents: 700 // 500 + 700 = 1200 > 1100
        })
      ).rejects.toThrow();
      try {
        await service.createRefund({
          order_id: orderId,
          account_id: accountId,
          refund_type: 'partial',
          amount_cents: 700
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });

    it('should throw OfflineOperationError when offline refunds are disabled', async () => {
      const originalConfig = config.features.offlineRefundsEnabled;
      config.features.offlineRefundsEnabled = false;

      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'completed',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockOrderService.getOrderById.mockResolvedValue(order);

      await expect(
        service.createRefund({
          order_id: orderId,
          account_id: accountId,
          refund_type: 'full',
          amount_cents: 1100,
          is_offline: true
        })
      ).rejects.toThrow();
      try {
        await service.createRefund({
          order_id: orderId,
          account_id: accountId,
          refund_type: 'full',
          amount_cents: 1100,
          is_offline: true
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'OFFLINE_UNAVAILABLE');
        expect(error).toHaveProperty('statusCode', 503);
      }

      // Restore config
      config.features.offlineRefundsEnabled = originalConfig;
    });
  });

  describe('approveRefund', () => {
    it('should approve a pending refund', async () => {
      const refund: Refund = {
        id: 'refund-1',
        account_id: accountId,
        order_id: orderId,
        refund_type: 'full',
        amount_cents: 1100,
        currency: 'USD',
        status: 'pending',
        items: [],
        is_offline: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const approvedRefund = { ...refund, status: 'approved' as const, approved_by: 'manager-1', approved_at: '2025-01-01T00:00:00Z' };

      mockDb.selectOne.mockResolvedValue({ data: refund, error: null });
      mockDb.update.mockResolvedValue({ data: approvedRefund, error: null });

      const result = await service.approveRefund('refund-1', accountId, 'manager-1');

      expect(result.status).toBe('approved');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ConflictError when refund is not pending', async () => {
      const refund: Refund = {
        id: 'refund-1',
        account_id: accountId,
        order_id: orderId,
        refund_type: 'full',
        amount_cents: 1100,
        currency: 'USD',
        status: 'approved',
        items: [],
        is_offline: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: refund, error: null });

      await expect(service.approveRefund('refund-1', accountId, 'manager-1')).rejects.toThrow();
      try {
        await service.approveRefund('refund-1', accountId, 'manager-1');
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
      }
    });
  });

  describe('processRefund', () => {
    it('should process an approved refund', async () => {
      const refund: Refund = {
        id: 'refund-1',
        account_id: accountId,
        order_id: orderId,
        refund_type: 'full',
        amount_cents: 1100,
        currency: 'USD',
        status: 'approved',
        items: [],
        is_offline: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const processedRefund = { ...refund, status: 'processed' as const, processed_at: '2025-01-01T00:00:00Z' };

      mockDb.selectOne.mockResolvedValue({ data: refund, error: null });
      mockDb.update.mockResolvedValue({ data: processedRefund, error: null });

      const result = await service.processRefund('refund-1', accountId);

      expect(result.status).toBe('processed');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ConflictError when refund is not approved', async () => {
      const refund: Refund = {
        id: 'refund-1',
        account_id: accountId,
        order_id: orderId,
        refund_type: 'full',
        amount_cents: 1100,
        currency: 'USD',
        status: 'pending',
        items: [],
        is_offline: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: refund, error: null });

      await expect(service.processRefund('refund-1', accountId)).rejects.toThrow();
      try {
        await service.processRefund('refund-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
      }
    });
  });

  describe('getTotalPaid', () => {
    it('should calculate total paid amount for an order', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'completed',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const payments: Payment[] = [
        {
          id: 'payment-1',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 500,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 'payment-2',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 600,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: payments, error: null });

      const result = await service.getTotalPaid(orderId, accountId);

      expect(result).toBe(1100); // 500 + 600
    });
  });

  describe('getRemainingBalance', () => {
    it('should calculate remaining balance for an order', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const payments: Payment[] = [
        {
          id: 'payment-1',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 500,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: payments, error: null });

      const result = await service.getRemainingBalance(orderId, accountId);

      expect(result).toBe(600); // 1100 - 500
    });
  });

  describe('isOrderFullyPaid', () => {
    it('should return true when order is fully paid', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'completed',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const payments: Payment[] = [
        {
          id: 'payment-1',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 1100,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: payments, error: null });

      const result = await service.isOrderFullyPaid(orderId, accountId);

      expect(result).toBe(true);
    });

    it('should return false when order is not fully paid', async () => {
      const order: Order = {
        id: orderId,
        account_id: accountId,
        store_id: 'store-123',
        status: 'pending',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 100,
        tip_cents: 0,
        total_cents: 1100,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const payments: Payment[] = [
        {
          id: 'payment-1',
          account_id: accountId,
          order_id: orderId,
          amount_cents: 500,
          tip_cents: 0,
          currency: 'USD',
          status: 'captured',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockOrderService.getOrderById.mockResolvedValue(order);
      mockDb.select.mockResolvedValue({ data: payments, error: null });

      const result = await service.isOrderFullyPaid(orderId, accountId);

      expect(result).toBe(false);
    });
  });
});

