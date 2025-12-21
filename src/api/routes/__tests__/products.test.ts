import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerProductRoutes } from '../products';

// Mock ProductService
const mockProductService = {
  getProducts: vi.fn(),
  countProducts: vi.fn(),
  searchProducts: vi.fn(),
  getProductById: vi.fn(),
  getProductWithDetails: vi.fn(),
  getProductByBarcode: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getVariants: vi.fn(),
  createVariant: vi.fn(),
  getCategories: vi.fn(),
  getCategoryById: vi.fn(),
  createCategory: vi.fn(),
  getModifierGroups: vi.fn(),
  getModifiers: vi.fn()
};

vi.mock('../../../services/products/product.service', () => ({
  ProductService: vi.fn(() => mockProductService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Product Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerProductRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all product routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/products');
      expect(paths).toContain('GET /api/v1/products/barcode/:barcode');
      expect(paths).toContain('GET /api/v1/products/:id');
      expect(paths).toContain('POST /api/v1/products');
      expect(paths).toContain('PUT /api/v1/products/:id');
      expect(paths).toContain('DELETE /api/v1/products/:id');
      expect(paths).toContain('GET /api/v1/products/:productId/variants');
      expect(paths).toContain('POST /api/v1/products/:productId/variants');
      expect(paths).toContain('GET /api/v1/categories');
      expect(paths).toContain('GET /api/v1/categories/:id');
      expect(paths).toContain('POST /api/v1/categories');
      expect(paths).toContain('GET /api/v1/modifier-groups');
      expect(paths).toContain('GET /api/v1/modifier-groups/:id/modifiers');
      expect(paths).toContain('POST /api/v1/products/search');
    });
  });

  describe('GET /api/v1/products', () => {
    it('should list products with pagination', async () => {
      const mockProducts = [
        { id: TEST_IDS.PRODUCT_ID, name: 'Coffee', price_cents: 500 }
      ];
      mockProductService.getProducts.mockResolvedValue(mockProducts);
      mockProductService.countProducts.mockResolvedValue(1);

      const route = findRoute(router.routes, 'GET', '/api/v1/products')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.getProducts).toHaveBeenCalled();
      expect(mockProductService.countProducts).toHaveBeenCalled();
    });

    it('should search products when query provided', async () => {
      mockProductService.searchProducts.mockResolvedValue([]);

      const route = findRoute(router.routes, 'GET', '/api/v1/products')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { search: 'coffee' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: TEST_IDS.ACCOUNT_ID,
          query: 'coffee'
        })
      );
    });
  });

  describe('GET /api/v1/products/barcode/:barcode', () => {
    it('should lookup product by barcode', async () => {
      const mockProduct = { id: TEST_IDS.PRODUCT_ID, barcode: '123456789' };
      mockProductService.getProductByBarcode.mockResolvedValue(mockProduct);

      const route = findRoute(router.routes, 'GET', '/api/v1/products/barcode/:barcode')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { barcode: '123456789' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.getProductByBarcode).toHaveBeenCalledWith(
        '123456789',
        TEST_IDS.ACCOUNT_ID
      );
    });

    it('should return null for unknown barcode', async () => {
      mockProductService.getProductByBarcode.mockResolvedValue(null);

      const route = findRoute(router.routes, 'GET', '/api/v1/products/barcode/:barcode')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { barcode: 'unknown' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({ success: true, data: null });
    });
  });

  describe('POST /api/v1/products', () => {
    it('should create a new product', async () => {
      const newProduct = {
        id: TEST_IDS.PRODUCT_ID,
        name: 'Latte',
        price_cents: 600
      };
      mockProductService.createProduct.mockResolvedValue(newProduct);

      const route = findRoute(router.routes, 'POST', '/api/v1/products')!;
      const req = createJsonRequest('POST', {
        name: 'Latte',
        price_cents: 600
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Latte',
          price_cents: 600,
          account_id: TEST_IDS.ACCOUNT_ID
        })
      );
    });
  });

  describe('DELETE /api/v1/products/:id', () => {
    it('should soft delete a product', async () => {
      mockProductService.deleteProduct.mockResolvedValue(undefined);

      const route = findRoute(router.routes, 'DELETE', '/api/v1/products/:id')!;
      const req = createAuthenticatedRequest({
        method: 'DELETE',
        params: { id: TEST_IDS.PRODUCT_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.deleteProduct).toHaveBeenCalledWith(
        TEST_IDS.PRODUCT_ID,
        TEST_IDS.ACCOUNT_ID
      );
      expect(res.body).toEqual({
        success: true,
        data: { id: TEST_IDS.PRODUCT_ID, deleted: true },
        meta: expect.any(Object)
      });
    });
  });

  describe('Variant Routes', () => {
    it('should get variants for a product', async () => {
      const mockVariants = [{ id: 'var-1', name: 'Small' }];
      mockProductService.getVariants.mockResolvedValue(mockVariants);

      const route = findRoute(router.routes, 'GET', '/api/v1/products/:productId/variants')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { productId: TEST_IDS.PRODUCT_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.getVariants).toHaveBeenCalledWith(
        TEST_IDS.PRODUCT_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });

    it('should create a variant', async () => {
      const newVariant = { id: 'var-1', name: 'Large', price_cents: 700 };
      mockProductService.createVariant.mockResolvedValue(newVariant);

      const route = findRoute(router.routes, 'POST', '/api/v1/products/:productId/variants')!;
      const req = createJsonRequest(
        'POST',
        { name: 'Large', price_cents: 700 },
        { params: { productId: TEST_IDS.PRODUCT_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.createVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: TEST_IDS.PRODUCT_ID,
          name: 'Large'
        }),
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('Category Routes', () => {
    it('should list categories', async () => {
      const mockCategories = [{ id: 'cat-1', name: 'Beverages' }];
      mockProductService.getCategories.mockResolvedValue(mockCategories);

      const route = findRoute(router.routes, 'GET', '/api/v1/categories')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.getCategories).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
    });

    it('should create a category', async () => {
      const newCategory = { id: 'cat-1', name: 'Food' };
      mockProductService.createCategory.mockResolvedValue(newCategory);

      const route = findRoute(router.routes, 'POST', '/api/v1/categories')!;
      const req = createJsonRequest('POST', { name: 'Food' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.createCategory).toHaveBeenCalledWith({
        name: 'Food',
        account_id: TEST_IDS.ACCOUNT_ID
      });
    });
  });

  describe('Modifier Routes', () => {
    it('should list modifier groups', async () => {
      const mockGroups = [{ id: 'mg-1', name: 'Milk Options' }];
      mockProductService.getModifierGroups.mockResolvedValue(mockGroups);

      const route = findRoute(router.routes, 'GET', '/api/v1/modifier-groups')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockProductService.getModifierGroups).toHaveBeenCalledWith(TEST_IDS.ACCOUNT_ID);
    });
  });
});
