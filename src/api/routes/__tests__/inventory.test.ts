import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerInventoryRoutes } from '../inventory';

// Mock InventoryService
const mockInventoryService = {
  getInventory: vi.fn(),
  getInventoryById: vi.fn(),
  createInventory: vi.fn(),
  updateInventory: vi.fn(),
  adjustStock: vi.fn(),
  transferStock: vi.fn(),
  performStockCount: vi.fn(),
  getInventoryTransactions: vi.fn(),
  getAccountTransactions: vi.fn(),
  getLowStockItems: vi.fn(),
  getInventoryValue: vi.fn()
};

vi.mock('../../../services/inventory/inventory.service', () => ({
  InventoryService: vi.fn(() => mockInventoryService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Inventory Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerInventoryRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all inventory routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/inventory');
      expect(paths).toContain('GET /api/v1/inventory/low-stock');
      expect(paths).toContain('GET /api/v1/inventory/transactions');
      expect(paths).toContain('GET /api/v1/inventory/:id');
      expect(paths).toContain('POST /api/v1/inventory');
      expect(paths).toContain('PUT /api/v1/inventory/:id');
      expect(paths).toContain('POST /api/v1/inventory/:id/adjust');
      expect(paths).toContain('POST /api/v1/inventory/transfer');
      expect(paths).toContain('POST /api/v1/inventory/count');
      expect(paths).toContain('GET /api/v1/inventory/:id/transactions');
      expect(paths).toContain('GET /api/v1/stores/:storeId/inventory');
      expect(paths).toContain('GET /api/v1/stores/:storeId/inventory/value');
      expect(paths).toContain('GET /api/v1/products/:productId/inventory');
    });
  });

  describe('GET /api/v1/inventory', () => {
    it('should list inventory with pagination', async () => {
      const mockInventory = [{ id: 'inv-1', product_id: TEST_IDS.PRODUCT_ID, quantity_on_hand: 100 }];
      mockInventoryService.getInventory.mockResolvedValue(mockInventory);

      const route = findRoute(router.routes, 'GET', '/api/v1/inventory')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.getInventory).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: undefined,
        product_id: undefined,
        low_stock_only: undefined
      });
    });
  });

  describe('GET /api/v1/inventory/low-stock', () => {
    it('should return low stock items', async () => {
      const lowStockItems = [{ id: 'inv-1', product_id: TEST_IDS.PRODUCT_ID, quantity_on_hand: 5 }];
      mockInventoryService.getLowStockItems.mockResolvedValue(lowStockItems);

      const route = findRoute(router.routes, 'GET', '/api/v1/inventory/low-stock')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { store_id: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.getLowStockItems).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        TEST_IDS.STORE_ID
      );
    });
  });

  describe('POST /api/v1/inventory', () => {
    it('should create inventory record', async () => {
      const newInventory = { id: 'inv-1', product_id: TEST_IDS.PRODUCT_ID, quantity_on_hand: 50 };
      mockInventoryService.createInventory.mockResolvedValue(newInventory);

      const route = findRoute(router.routes, 'POST', '/api/v1/inventory')!;
      const req = createJsonRequest('POST', {
        store_id: TEST_IDS.STORE_ID,
        product_id: TEST_IDS.PRODUCT_ID,
        quantity_on_hand: 50
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.createInventory).toHaveBeenCalledWith({
        store_id: TEST_IDS.STORE_ID,
        product_id: TEST_IDS.PRODUCT_ID,
        quantity_on_hand: 50,
        account_id: TEST_IDS.ACCOUNT_ID
      });
    });
  });

  describe('POST /api/v1/inventory/:id/adjust', () => {
    it('should adjust stock quantity', async () => {
      const result = { success: true, new_quantity: 90 };
      mockInventoryService.adjustStock.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/inventory/:id/adjust')!;
      const req = createJsonRequest(
        'POST',
        { transaction_type: 'adjustment', quantity_change: -10, reason: 'Damaged goods' },
        { params: { id: 'inv-1' } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.adjustStock).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: TEST_IDS.ACCOUNT_ID,
          inventory_id: 'inv-1',
          transaction_type: 'adjustment',
          quantity_change: -10,
          reason: 'Damaged goods'
        })
      );
    });
  });

  describe('POST /api/v1/inventory/transfer', () => {
    it('should transfer stock between stores', async () => {
      const result = { success: true, from_quantity: 90, to_quantity: 10 };
      mockInventoryService.transferStock.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/inventory/transfer')!;
      const req = createJsonRequest('POST', {
        from_store_id: TEST_IDS.STORE_ID,
        to_store_id: '00000000-0000-0000-0000-000000000099',
        product_id: TEST_IDS.PRODUCT_ID,
        quantity: 10
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.transferStock).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: TEST_IDS.ACCOUNT_ID,
          from_store_id: TEST_IDS.STORE_ID,
          to_store_id: '00000000-0000-0000-0000-000000000099',
          product_id: TEST_IDS.PRODUCT_ID,
          quantity: 10
        })
      );
    });
  });

  describe('POST /api/v1/inventory/count', () => {
    it('should perform stock count', async () => {
      const result = { success: true, adjustments: 2 };
      mockInventoryService.performStockCount.mockResolvedValue(result);

      const route = findRoute(router.routes, 'POST', '/api/v1/inventory/count')!;
      const req = createJsonRequest('POST', {
        store_id: TEST_IDS.STORE_ID,
        counts: [
          { product_id: TEST_IDS.PRODUCT_ID, counted_quantity: 95 }
        ]
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.performStockCount).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: TEST_IDS.STORE_ID,
        counts: [{ product_id: TEST_IDS.PRODUCT_ID, counted_quantity: 95 }],
        employee_id: TEST_IDS.EMPLOYEE_ID
      });
    });
  });

  describe('GET /api/v1/stores/:storeId/inventory/value', () => {
    it('should return inventory value for store', async () => {
      const value = { total_cost_cents: 500000, total_retail_cents: 750000 };
      mockInventoryService.getInventoryValue.mockResolvedValue(value);

      const route = findRoute(router.routes, 'GET', '/api/v1/stores/:storeId/inventory/value')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { storeId: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.getInventoryValue).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        TEST_IDS.STORE_ID
      );
    });
  });

  describe('GET /api/v1/products/:productId/inventory', () => {
    it('should return inventory across all stores for product', async () => {
      const mockInventory = [
        { id: 'inv-1', store_id: 'store-1', quantity_on_hand: 50 },
        { id: 'inv-2', store_id: 'store-2', quantity_on_hand: 30 }
      ];
      mockInventoryService.getInventory.mockResolvedValue(mockInventory);

      const route = findRoute(router.routes, 'GET', '/api/v1/products/:productId/inventory')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { productId: TEST_IDS.PRODUCT_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockInventoryService.getInventory).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        product_id: TEST_IDS.PRODUCT_ID
      });
    });
  });
});
