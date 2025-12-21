import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerReportRoutes } from '../reports';

// Mock ReportService
const mockReportService = {
  getSalesSummary: vi.fn(),
  getSalesByPeriod: vi.fn(),
  getHourlySales: vi.fn(),
  getPaymentSummary: vi.fn(),
  getTopProducts: vi.fn(),
  getEmployeeSales: vi.fn(),
  getShiftSummaries: vi.fn(),
  getDailySnapshots: vi.fn(),
  getInventoryReport: vi.fn(),
  getTaxReport: vi.fn(),
  getDiscountReport: vi.fn()
};

vi.mock('../../../services/reports/report.service', () => ({
  ReportService: vi.fn(() => mockReportService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Report Routes', () => {
  let router: ReturnType<typeof createMockRouter>;
  const defaultDateQuery = { start_date: '2025-01-01', end_date: '2025-01-31' };

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerReportRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all report routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/reports/sales/summary');
      expect(paths).toContain('GET /api/v1/reports/sales/by-period');
      expect(paths).toContain('GET /api/v1/reports/sales/hourly');
      expect(paths).toContain('GET /api/v1/reports/payments');
      expect(paths).toContain('GET /api/v1/reports/products/top');
      expect(paths).toContain('GET /api/v1/reports/employees');
      expect(paths).toContain('GET /api/v1/reports/shifts');
      expect(paths).toContain('GET /api/v1/reports/dashboard');
      expect(paths).toContain('GET /api/v1/reports/inventory');
      expect(paths).toContain('GET /api/v1/reports/taxes');
      expect(paths).toContain('GET /api/v1/reports/discounts');
    });
  });

  describe('GET /api/v1/reports/sales/summary', () => {
    it('should return sales summary', async () => {
      const summary = {
        total_sales_cents: 1000000,
        total_orders: 250,
        average_order_cents: 4000,
        total_refunds_cents: 5000
      };
      mockReportService.getSalesSummary.mockResolvedValue(summary);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/sales/summary')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getSalesSummary).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: undefined,
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      });
    });
  });

  describe('GET /api/v1/reports/sales/by-period', () => {
    it('should return sales grouped by day', async () => {
      const salesByDay = [
        { period: '2025-01-01', total_sales_cents: 50000, order_count: 10 },
        { period: '2025-01-02', total_sales_cents: 60000, order_count: 12 }
      ];
      mockReportService.getSalesByPeriod.mockResolvedValue(salesByDay);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/sales/by-period')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { ...defaultDateQuery, group_by: 'day' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getSalesByPeriod).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: TEST_IDS.ACCOUNT_ID,
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        }),
        'day'
      );
    });
  });

  describe('GET /api/v1/reports/sales/hourly', () => {
    it('should return hourly sales breakdown', async () => {
      const hourlySales = [
        { hour: 9, total_sales_cents: 5000, order_count: 5 },
        { hour: 10, total_sales_cents: 8000, order_count: 8 }
      ];
      mockReportService.getHourlySales.mockResolvedValue(hourlySales);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/sales/hourly')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getHourlySales).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: undefined,
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      });
    });
  });

  describe('GET /api/v1/reports/payments', () => {
    it('should return payment summary by type', async () => {
      const paymentSummary = {
        by_type: [
          { payment_type: 'cash', total_cents: 500000, count: 100 },
          { payment_type: 'card', total_cents: 400000, count: 80 }
        ],
        total_cents: 900000
      };
      mockReportService.getPaymentSummary.mockResolvedValue(paymentSummary);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/payments')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getPaymentSummary).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/reports/products/top', () => {
    it('should return top selling products', async () => {
      const topProducts = [
        { product_id: 'prod-1', name: 'Coffee', quantity_sold: 500, revenue_cents: 250000 },
        { product_id: 'prod-2', name: 'Latte', quantity_sold: 300, revenue_cents: 180000 }
      ];
      mockReportService.getTopProducts.mockResolvedValue(topProducts);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/products/top')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { ...defaultDateQuery, limit: '10' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getTopProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: TEST_IDS.ACCOUNT_ID,
          start_date: '2025-01-01',
          end_date: '2025-01-31'
        }),
        10
      );
    });
  });

  describe('GET /api/v1/reports/employees', () => {
    it('should return sales by employee', async () => {
      const employeeSales = [
        { employee_id: 'emp-1', name: 'John', total_sales_cents: 100000, order_count: 25 }
      ];
      mockReportService.getEmployeeSales.mockResolvedValue(employeeSales);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/employees')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getEmployeeSales).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/reports/shifts', () => {
    it('should return shift summaries', async () => {
      const shiftSummaries = [
        { shift_id: 'shift-1', employee_name: 'John', total_sales_cents: 50000 }
      ];
      mockReportService.getShiftSummaries.mockResolvedValue(shiftSummaries);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/shifts')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getShiftSummaries).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/reports/dashboard', () => {
    it('should return daily snapshots', async () => {
      const snapshots = [
        { date: '2025-01-01', total_sales_cents: 50000, order_count: 25 }
      ];
      mockReportService.getDailySnapshots.mockResolvedValue(snapshots);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/dashboard')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getDailySnapshots).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/reports/inventory', () => {
    it('should return inventory report', async () => {
      const inventoryReport = {
        total_items: 500,
        total_value_cents: 1000000,
        low_stock_items: 10
      };
      mockReportService.getInventoryReport.mockResolvedValue(inventoryReport);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/inventory')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { store_id: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getInventoryReport).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        TEST_IDS.STORE_ID
      );
    });
  });

  describe('GET /api/v1/reports/taxes', () => {
    it('should return tax report', async () => {
      const taxReport = {
        total_tax_collected_cents: 50000,
        by_rate: [
          { rate_percent: 10, tax_cents: 30000 },
          { rate_percent: 5, tax_cents: 20000 }
        ]
      };
      mockReportService.getTaxReport.mockResolvedValue(taxReport);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/taxes')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getTaxReport).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/reports/discounts', () => {
    it('should return discount usage report', async () => {
      const discountReport = {
        total_discounts_cents: 25000,
        discount_count: 50,
        by_type: [
          { type: 'percent', count: 30, total_cents: 15000 },
          { type: 'fixed', count: 20, total_cents: 10000 }
        ]
      };
      mockReportService.getDiscountReport.mockResolvedValue(discountReport);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/discounts')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: defaultDateQuery
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockReportService.getDiscountReport).toHaveBeenCalled();
    });
  });
});
