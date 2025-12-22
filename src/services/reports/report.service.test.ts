import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportService } from './report.service';
import type { Order, Payment, Refund, Shift, OrderItem } from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';

const mockDb: DatabaseAdapter = {
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isOnline: true,
  setOnlineStatus: vi.fn()
} as unknown as DatabaseAdapter;

describe('ReportService', () => {
  let service: ReportService;
  const accountId = 'account-123';
  const storeId = 'store-123';
  const startDate = '2025-01-01T00:00:00Z';
  const endDate = '2025-01-31T23:59:59Z';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReportService();
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('getSalesSummary', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 100,
        discount_cents: 0,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      },
      {
        id: 'order-2',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'takeout',
        total_cents: 1500,
        subtotal_cents: 1400,
        tax_cents: 100,
        tip_cents: 0,
        discount_cents: 0,
        created_at: '2025-01-15T11:00:00Z',
        updated_at: '2025-01-15T11:00:00Z'
      }
    ];

    const mockRefunds: Refund[] = [
      {
        id: 'refund-1',
        account_id: accountId,
        order_id: 'order-1',
        amount_cents: 500,
        status: 'processed',
        reason: 'Customer request',
        created_at: '2025-01-16T10:00:00Z',
        updated_at: '2025-01-16T10:00:00Z'
      }
    ];

    it('should calculate sales summary correctly', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null }) // Orders
        .mockResolvedValueOnce({ data: mockRefunds, error: null }); // Refunds

      const result = await service.getSalesSummary({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.total_orders).toBe(2);
      expect(result.total_sales_cents).toBe(3500); // 2000 + 1500
      expect(result.total_refunds_cents).toBe(500);
      expect(result.net_sales_cents).toBe(3000); // 3500 - 500
      expect(result.total_tax_cents).toBe(300); // 200 + 100
      expect(result.total_tips_cents).toBe(100);
      expect(result.orders_by_status.completed).toBe(2);
      expect(result.orders_by_type.dine_in).toBe(1);
      expect(result.orders_by_type.takeout).toBe(1);
    });

    it('should filter by store_id when provided', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: mockRefunds, error: null });

      await service.getSalesSummary({
        account_id: accountId,
        store_id: storeId,
        start_date: startDate,
        end_date: endDate
      });

      expect(mockDb.select).toHaveBeenCalledWith(
        'orders',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'store_id', operator: '=', value: storeId }
          ])
        })
      );
    });

    it('should calculate average order correctly', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getSalesSummary({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.average_order_cents).toBe(1750); // 3500 / 2
    });
  });

  describe('getSalesByPeriod', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 0,
        discount_cents: 0,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      },
      {
        id: 'order-2',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'takeout',
        total_cents: 1500,
        subtotal_cents: 1400,
        tax_cents: 100,
        tip_cents: 0,
        discount_cents: 0,
        created_at: '2025-01-16T10:00:00Z',
        updated_at: '2025-01-16T10:00:00Z'
      }
    ];

    it('should group sales by day', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getSalesByPeriod(
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate
        },
        'day'
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('orders');
      expect(result[0]).toHaveProperty('sales_cents');
    });

    it('should group sales by week', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getSalesByPeriod(
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate
        },
        'week'
      );

      expect(result.length).toBeGreaterThan(0);
    });

    it('should group sales by month', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getSalesByPeriod(
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate
        },
        'month'
      );

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getPaymentSummary', () => {
    const mockPayments: Payment[] = [
      {
        id: 'payment-1',
        account_id: accountId,
        order_id: 'order-1',
        amount_cents: 2000,
        tip_cents: 100,
        payment_type_id: null,
        card_brand: 'visa',
        status: 'captured',
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      },
      {
        id: 'payment-2',
        account_id: accountId,
        order_id: 'order-2',
        amount_cents: 1500,
        tip_cents: 0,
        payment_type_id: null,
        card_brand: null,
        gateway_transaction_id: null,
        status: 'captured',
        created_at: '2025-01-15T11:00:00Z',
        updated_at: '2025-01-15T11:00:00Z'
      }
    ];

    it('should summarize payments by type', async () => {
      mockDb.select.mockResolvedValue({ data: mockPayments, error: null });

      const result = await service.getPaymentSummary({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('payment_type');
      expect(result[0]).toHaveProperty('count');
      expect(result[0]).toHaveProperty('amount_cents');
    });
  });

  describe('getTopProducts', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 0,
        discount_cents: 0,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    const mockOrderItems: OrderItem[] = [
      {
        id: 'item-1',
        order_id: 'order-1',
        product_id: 'product-1',
        name: 'Burger',
        quantity: 2,
        unit_price_cents: 1000,
        total_cents: 2000,
        modifiers: [],
        sort_order: 1,
        kitchen_status: 'pending',
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    it('should return top products sorted by sales', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: mockOrderItems, error: null });

      const result = await service.getTopProducts(
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate
        },
        10
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('product_id');
      expect(result[0]).toHaveProperty('product_name');
      expect(result[0]).toHaveProperty('quantity_sold');
      expect(result[0]).toHaveProperty('total_sales_cents');
    });

    it('should return empty array when no orders', async () => {
      mockDb.select.mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getTopProducts(
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate
        },
        10
      );

      expect(result).toEqual([]);
    });

    it('should limit results to specified limit', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null })
        .mockResolvedValueOnce({ data: mockOrderItems, error: null });

      const result = await service.getTopProducts(
        {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate
        },
        5
      );

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getEmployeeSales', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        employee_id: 'employee-1',
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 100,
        discount_cents: 0,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    it('should calculate employee sales summary', async () => {
      mockDb.select.mockResolvedValueOnce({ data: mockOrders, error: null });
      mockDb.selectOne.mockResolvedValueOnce({
        data: { id: 'employee-1', name: 'John Doe' },
        error: null
      });

      const result = await service.getEmployeeSales({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('employee_id');
      expect(result[0]).toHaveProperty('employee_name');
      expect(result[0]).toHaveProperty('orders_count');
      expect(result[0]).toHaveProperty('total_sales_cents');
      expect(result[0]).toHaveProperty('total_tips_cents');
    });

    it('should skip orders without employee_id', async () => {
      const ordersWithoutEmployee = mockOrders.map((o) => ({
        ...o,
        employee_id: null
      }));
      mockDb.select.mockResolvedValueOnce({ data: ordersWithoutEmployee, error: null });

      const result = await service.getEmployeeSales({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result).toEqual([]);
    });
  });

  describe('getShiftSummaries', () => {
    const mockShifts: Shift[] = [
      {
        id: 'shift-1',
        account_id: accountId,
        store_id: storeId,
        employee_id: 'employee-1',
        status: 'closed',
        opening_cash_cents: 10000,
        closing_cash_cents: 15000,
        expected_cash_cents: 15000,
        discrepancy_cents: 0,
        cash_in_cents: 0,
        cash_out_cents: 0,
        total_sales_cents: 5000,
        total_refunds_cents: 0,
        total_tips_cents: 100,
        transaction_count: 5,
        opened_at: '2025-01-15T08:00:00Z',
        closed_at: '2025-01-15T16:00:00Z',
        created_at: '2025-01-15T08:00:00Z',
        updated_at: '2025-01-15T16:00:00Z'
      }
    ];

    it('should return shift summaries', async () => {
      mockDb.select.mockResolvedValueOnce({ data: mockShifts, error: null });
      mockDb.selectOne.mockResolvedValueOnce({
        data: { id: 'employee-1', name: 'John Doe' },
        error: null
      });

      const result = await service.getShiftSummaries({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('shift_id');
      expect(result[0]).toHaveProperty('employee_name');
      expect(result[0]).toHaveProperty('opened_at');
      expect(result[0]).toHaveProperty('total_sales_cents');
    });
  });

  describe('getHourlySales', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 0,
        discount_cents: 0,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    it('should return hourly sales breakdown', async () => {
      mockDb.select.mockResolvedValue({ data: mockOrders, error: null });

      const result = await service.getHourlySales({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.length).toBe(24); // 24 hours
      expect(result[10]).toHaveProperty('hour', 10);
      expect(result[10]).toHaveProperty('orders');
      expect(result[10]).toHaveProperty('sales_cents');
    });
  });

  describe('getDailySnapshots', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        customer_id: 'customer-1',
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 0,
        discount_cents: 0,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    it('should return daily snapshots with customer counts', async () => {
      mockDb.select
        .mockResolvedValueOnce({ data: mockOrders, error: null }) // For getSalesByPeriod
        .mockResolvedValueOnce({ data: [], error: null }) // Refunds
        .mockResolvedValueOnce({ data: mockOrders, error: null }); // For customer counts

      const result = await service.getDailySnapshots({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('orders');
      expect(result[0]).toHaveProperty('sales_cents');
      expect(result[0]).toHaveProperty('customers');
    });
  });

  describe('getTaxReport', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 0,
        discount_cents: 0,
        tax_breakdown: [
          {
            tax_rule_id: 'tax-1',
            name: 'Sales Tax',
            rate_percent: 10,
            amount_cents: 200
          }
        ],
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    it('should calculate tax report', async () => {
      mockDb.select.mockResolvedValue({ data: mockOrders, error: null });

      const result = await service.getTaxReport({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result).toHaveProperty('total_tax_cents');
      expect(result).toHaveProperty('tax_breakdown');
      expect(result.tax_breakdown.length).toBeGreaterThan(0);
    });
  });

  describe('getDiscountReport', () => {
    const mockOrders: Order[] = [
      {
        id: 'order-1',
        account_id: accountId,
        store_id: storeId,
        status: 'completed',
        order_type: 'dine_in',
        total_cents: 2000,
        subtotal_cents: 1800,
        tax_cents: 200,
        tip_cents: 0,
        discount_cents: 100,
        discount_breakdown: [
          {
            discount_id: 'discount-1',
            name: '10% Off',
            type: 'percentage',
            amount_cents: 100
          }
        ],
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }
    ];

    it('should calculate discount report', async () => {
      mockDb.select.mockResolvedValue({ data: mockOrders, error: null });

      const result = await service.getDiscountReport({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate
      });

      expect(result).toHaveProperty('total_discount_cents');
      expect(result).toHaveProperty('discount_count');
      expect(result).toHaveProperty('discounts');
    });
  });

  describe('getInventoryReport', () => {
    const mockInventory = [
      {
        id: 'inv-1',
        product_id: 'product-1',
        quantity_on_hand: 50,
        reorder_point: 20
      },
      {
        id: 'inv-2',
        product_id: 'product-2',
        quantity_on_hand: 10,
        reorder_point: 15
      },
      {
        id: 'inv-3',
        product_id: 'product-3',
        quantity_on_hand: 0,
        reorder_point: 10
      }
    ];

    it('should calculate inventory statistics', async () => {
      mockDb.select.mockResolvedValue({ data: mockInventory, error: null });

      const result = await service.getInventoryReport(accountId);

      expect(result).toHaveProperty('total_items');
      expect(result).toHaveProperty('total_quantity');
      expect(result).toHaveProperty('low_stock_count');
      expect(result).toHaveProperty('out_of_stock_count');
      expect(result.total_items).toBe(3);
      expect(result.total_quantity).toBe(60); // 50 + 10 + 0
      expect(result.low_stock_count).toBe(1); // inv-2 (10 <= 15); inv-3 counted as out_of_stock not low_stock
      expect(result.out_of_stock_count).toBe(1); // inv-3 (0)
    });

    it('should filter by store_id when provided', async () => {
      mockDb.select.mockResolvedValue({ data: mockInventory, error: null });

      await service.getInventoryReport(accountId, storeId);

      expect(mockDb.select).toHaveBeenCalledWith(
        'inventory',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId },
            { column: 'store_id', operator: '=', value: storeId }
          ])
        })
      );
    });

    it('should handle items without reorder_point', async () => {
      const inventoryWithoutReorder = [
        {
          id: 'inv-1',
          product_id: 'product-1',
          quantity_on_hand: 50,
          reorder_point: null
        }
      ];
      mockDb.select.mockResolvedValue({ data: inventoryWithoutReorder, error: null });

      const result = await service.getInventoryReport(accountId);

      expect(result.low_stock_count).toBe(0);
    });
  });
});

