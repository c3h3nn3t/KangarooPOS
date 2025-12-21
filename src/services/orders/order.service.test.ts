import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderService } from './order.service';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import type { Order, OrderItem, Product } from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';

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

// Mock ProductService
const mockProductService = {
  getProductById: vi.fn()
};

vi.mock('../products/product.service', () => ({
  ProductService: vi.fn(() => mockProductService)
}));

describe('OrderService', () => {
  let service: OrderService;
  const accountId = 'account-123';
  const storeId = 'store-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrderService();
    // Inject mock db
    (service as unknown as { db: typeof mockDb }).db = mockDb;
    // Inject mock product service
    (service as unknown as { productService: typeof mockProductService }).productService = mockProductService;
  });

  describe('getOrders', () => {
    it('should fetch orders for an account', async () => {
      const mockOrders: Order[] = [
        {
          id: 'order-1',
          account_id: accountId,
          store_id: storeId,
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
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockOrders, error: null });

      const result = await service.getOrders(accountId);

      expect(result).toEqual(mockOrders);
      expect(mockDb.select).toHaveBeenCalledWith('orders', {
        where: [{ column: 'account_id', operator: '=', value: accountId }],
        orderBy: [{ column: 'created_at', direction: 'desc' }]
      });
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getOrders(accountId)).rejects.toThrow('Failed to fetch orders');
    });
  });

  describe('getOrderById', () => {
    it('should return order when found', async () => {
      const mockOrder: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
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

      mockDb.selectOne.mockResolvedValue({ data: mockOrder, error: null });

      const result = await service.getOrderById('order-1', accountId);

      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundError when order not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getOrderById('order-1', accountId)).rejects.toThrow();
      try {
        await service.getOrderById('order-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'NOT_FOUND');
        expect(error).toHaveProperty('statusCode', 404);
      }
    });

    it('should throw NotFoundError when order belongs to different account', async () => {
      const mockOrder: Order = {
        id: 'order-1',
        account_id: 'other-account',
        store_id: storeId,
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

      mockDb.selectOne.mockResolvedValue({ data: mockOrder, error: null });

      await expect(service.getOrderById('order-1', accountId)).rejects.toThrow();
      try {
        await service.getOrderById('order-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'NOT_FOUND');
        expect(error).toHaveProperty('statusCode', 404);
      }
    });
  });

  describe('createOrder', () => {
    it('should create a new order', async () => {
      const input = {
        account_id: accountId,
        store_id: storeId,
        order_type: 'dine_in' as const
      };

      const mockOrder: Order = {
        id: 'order-1',
        ...input,
        status: 'draft',
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 0,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.insert.mockResolvedValue({ data: mockOrder, error: null });

      const result = await service.createOrder(input);

      expect(result).toEqual(mockOrder);
      expect(mockDb.insert).toHaveBeenCalledWith('orders', expect.objectContaining({
        account_id: accountId,
        store_id: storeId,
        status: 'draft',
        order_type: 'dine_in'
      }));
    });

    it('should return existing order if idempotency key matches', async () => {
      const existingOrder: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'draft',
        order_type: 'dine_in',
        idempotency_key: 'key-123',
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 0,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.select.mockResolvedValue({ data: [existingOrder], error: null });

      const result = await service.createOrder({
        account_id: accountId,
        store_id: storeId,
        idempotency_key: 'key-123'
      });

      expect(result).toEqual(existingOrder);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('addOrderItem', () => {
    it('should add item to order', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'draft',
        order_type: 'dine_in',
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 0,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const product: Product = {
        id: 'product-1',
        account_id: accountId,
        name: 'Test Product',
        price_cents: 1000,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockItem: OrderItem = {
        id: 'item-1',
        order_id: 'order-1',
        product_id: 'product-1',
        name: 'Test Product',
        quantity: 1,
        unit_price_cents: 1000,
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 0,
        total_cents: 1000,
        modifiers: [],
        tax_breakdown: [],
        kitchen_status: 'pending',
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z'
      };

      // Mock getOrderById call
      mockDb.selectOne.mockResolvedValueOnce({ data: order, error: null });
      mockProductService.getProductById.mockResolvedValue(product);
      // Mock getOrderItems call
      mockDb.select.mockResolvedValueOnce({ data: [], error: null }); // No existing items
      // Mock insert order item
      mockDb.insert.mockResolvedValue({ data: mockItem, error: null });
      // Mock recalculateOrderTotals calls
      mockDb.select.mockResolvedValueOnce({ data: [], error: null }); // getOrderItems in recalculate
      mockDb.selectOne.mockResolvedValueOnce({ data: order, error: null }); // getOrderById in recalculate
      mockDb.select.mockResolvedValueOnce({ data: [], error: null }); // tax rules
      mockDb.update.mockResolvedValue({ data: order, error: null });

      const result = await service.addOrderItem(
        {
          order_id: 'order-1',
          product_id: 'product-1',
          quantity: 1
        },
        accountId
      );

      expect(result).toEqual(mockItem);
      expect(mockProductService.getProductById).toHaveBeenCalledWith('product-1', accountId);
    });

    it('should throw ConflictError when order is not in draft/pending status', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
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

      mockDb.selectOne.mockResolvedValue({ data: order, error: null });

      await expect(
        service.addOrderItem(
          {
            order_id: 'order-1',
            product_id: 'product-1',
            quantity: 1
          },
          accountId
        )
      ).rejects.toThrow();
      try {
        await service.addOrderItem(
          {
            order_id: 'order-1',
            product_id: 'product-1',
            quantity: 1
          },
          accountId
        );
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
        expect(error).toHaveProperty('statusCode', 409);
      }
    });
  });

  describe('submitOrder', () => {
    it('should submit order from draft to pending', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
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

      const updatedOrder = { ...order, status: 'pending' as const };

      mockDb.selectOne.mockResolvedValue({ data: order, error: null });
      mockDb.select.mockResolvedValue({ data: [{ id: 'item-1' }], error: null }); // Has items
      mockDb.update.mockResolvedValue({ data: updatedOrder, error: null });

      const result = await service.submitOrder('order-1', accountId);

      expect(result.status).toBe('pending');
      expect(mockDb.update).toHaveBeenCalledWith('orders', 'order-1', { status: 'pending' });
    });

    it('should throw ConflictError when order is not in draft status', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
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

      mockDb.selectOne.mockResolvedValue({ data: order, error: null });

      await expect(service.submitOrder('order-1', accountId)).rejects.toThrow();
      try {
        await service.submitOrder('order-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'CONFLICT');
        expect(error).toHaveProperty('statusCode', 409);
      }
    });

    it('should throw ValidationError when order has no items', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'draft',
        order_type: 'dine_in',
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 0,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: order, error: null });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No items

      await expect(service.submitOrder('order-1', accountId)).rejects.toThrow();
      try {
        await service.submitOrder('order-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(error).toHaveProperty('statusCode', 400);
      }
    });
  });

  describe('applyDiscount', () => {
    it('should apply percent discount to order', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'draft',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 1000,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: order, error: null });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No tax rules
      mockDb.update.mockResolvedValue({ data: order, error: null });

      const result = await service.applyDiscount(
        {
          order_id: 'order-1',
          type: 'percent',
          name: '10% Off',
          value: 10,
          applied_to: 'order'
        },
        accountId
      );

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid discount percent', async () => {
      const order: Order = {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'draft',
        order_type: 'dine_in',
        subtotal_cents: 1000,
        discount_cents: 0,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 1000,
        currency: 'USD',
        tax_breakdown: [],
        discount_breakdown: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: order, error: null });

      await expect(
        service.applyDiscount(
          {
            order_id: 'order-1',
            type: 'percent',
            name: 'Invalid',
            value: 150, // > 100
            applied_to: 'order'
          },
          accountId
        )
      ).rejects.toThrow();
      try {
        await service.applyDiscount(
          {
            order_id: 'order-1',
            type: 'percent',
            name: 'Invalid',
            value: 150,
            applied_to: 'order'
          },
          accountId
        );
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(error).toHaveProperty('statusCode', 400);
      }
    });
  });
});

