import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductService } from './product.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { Product, ProductVariant, ProductCategory } from '../../types/database';
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

describe('ProductService', () => {
  let service: ProductService;
  const accountId = 'account-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductService();
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('getProducts', () => {
    it('should fetch active products for account', async () => {
      const mockProducts: Product[] = [
        {
          id: 'prod-1',
          account_id: accountId,
          name: 'Coffee',
          price_cents: 450,
          currency: 'USD',
          track_stock: false,
          sold_by_weight: false,
          is_composite: false,
          is_active: true,
          sort_order: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockProducts, error: null });

      const result = await service.getProducts(accountId);

      expect(result).toEqual(mockProducts);
      expect(mockDb.select).toHaveBeenCalledWith('products', expect.objectContaining({
        where: expect.arrayContaining([
          { column: 'is_active', operator: '=', value: true }
        ])
      }));
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getProducts(accountId)).rejects.toThrow('Failed to fetch products');
    });
  });

  describe('getProductById', () => {
    it('should return product when found', async () => {
      const mockProduct: Product = {
        id: 'prod-1',
        account_id: accountId,
        name: 'Coffee',
        price_cents: 450,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockProduct, error: null });

      const result = await service.getProductById('prod-1', accountId);

      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundError when product not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getProductById('prod-1', accountId)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when product belongs to different account', async () => {
      mockDb.selectOne.mockResolvedValue({
        data: { id: 'prod-1', account_id: 'other-account' },
        error: null
      });

      await expect(service.getProductById('prod-1', accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getProductByBarcode', () => {
    it('should return product by barcode', async () => {
      const mockProduct: Product = {
        id: 'prod-1',
        account_id: accountId,
        name: 'Coffee',
        barcode: '123456789',
        price_cents: 450,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.select.mockResolvedValue({ data: [mockProduct], error: null });

      const result = await service.getProductByBarcode('123456789', accountId);

      expect(result).toEqual(mockProduct);
    });

    it('should return null when barcode not found', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });

      const result = await service.getProductByBarcode('unknown', accountId);

      expect(result).toBeNull();
    });
  });

  describe('createProduct', () => {
    it('should create a new product', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No duplicate SKU/barcode
      mockDb.insert.mockResolvedValue({
        data: {
          id: 'prod-1',
          account_id: accountId,
          name: 'New Product',
          price_cents: 999,
          currency: 'USD',
          is_active: true
        },
        error: null
      });

      const result = await service.createProduct({
        account_id: accountId,
        name: 'New Product',
        price_cents: 999
      });

      expect(result.name).toBe('New Product');
    });

    it('should throw ValidationError for duplicate SKU', async () => {
      mockDb.select.mockResolvedValue({
        data: [{ id: 'existing', sku: 'SKU123' }],
        error: null
      });

      await expect(
        service.createProduct({
          account_id: accountId,
          name: 'New Product',
          price_cents: 999,
          sku: 'SKU123'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for duplicate barcode', async () => {
      const existingProduct: Product = {
        id: 'existing',
        account_id: accountId,
        name: 'Existing Product',
        barcode: 'BAR123',
        price_cents: 500,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      // No SKU provided, so only barcode check will happen
      // Mock the barcode check to return existing product
      mockDb.select.mockResolvedValueOnce({ data: [existingProduct], error: null });

      await expect(
        service.createProduct({
          account_id: accountId,
          name: 'New Product',
          price_cents: 999,
          barcode: 'BAR123'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should validate category exists', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(
        service.createProduct({
          account_id: accountId,
          name: 'New Product',
          price_cents: 999,
          category_id: 'invalid-category'
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProduct', () => {
    it('should update product', async () => {
      const existing: Product = {
        id: 'prod-1',
        account_id: accountId,
        name: 'Old Name',
        price_cents: 450,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: existing, error: null });
      mockDb.update.mockResolvedValue({
        data: { ...existing, name: 'New Name', price_cents: 599 },
        error: null
      });

      const result = await service.updateProduct({
        id: 'prod-1',
        name: 'New Name',
        price_cents: 599
      }, accountId);

      expect(result.name).toBe('New Name');
      expect(result.price_cents).toBe(599);
    });
  });

  describe('deleteProduct', () => {
    it('should soft delete product by setting is_active to false', async () => {
      const existing: Product = {
        id: 'prod-1',
        account_id: accountId,
        name: 'Product',
        price_cents: 450,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: existing, error: null });
      mockDb.update.mockResolvedValue({ data: { ...existing, is_active: false }, error: null });

      await service.deleteProduct('prod-1', accountId);

      expect(mockDb.update).toHaveBeenCalledWith('products', 'prod-1', { is_active: false });
    });
  });

  describe('searchProducts', () => {
    it('should search by name', async () => {
      mockDb.select.mockResolvedValue({
        data: [{ id: 'prod-1', name: 'Coffee Latte' }],
        error: null
      });

      const result = await service.searchProducts({
        account_id: accountId,
        query: 'Coffee'
      });

      expect(result).toHaveLength(1);
      expect(mockDb.select).toHaveBeenCalledWith('products', expect.objectContaining({
        where: expect.arrayContaining([
          { column: 'name', operator: 'ilike', value: '%Coffee%' }
        ])
      }));
    });

    it('should filter by category', async () => {
      mockDb.select.mockResolvedValue({
        data: [{ id: 'prod-1', category_id: 'cat-1' }],
        error: null
      });

      await service.searchProducts({
        account_id: accountId,
        category_id: 'cat-1'
      });

      expect(mockDb.select).toHaveBeenCalledWith('products', expect.objectContaining({
        where: expect.arrayContaining([
          { column: 'category_id', operator: '=', value: 'cat-1' }
        ])
      }));
    });
  });

  describe('Variants', () => {
    describe('getVariants', () => {
      it('should fetch active variants for product', async () => {
        const mockProduct: Product = {
          id: 'prod-1',
          account_id: accountId,
          name: 'Coffee',
          price_cents: 450,
          currency: 'USD',
          track_stock: false,
          sold_by_weight: false,
          is_composite: false,
          is_active: true,
          sort_order: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        const mockVariants: ProductVariant[] = [
          {
            id: 'var-1',
            product_id: 'prod-1',
            name: 'Small',
            price_cents: 350,
            is_active: true,
            sort_order: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }
        ];

        mockDb.selectOne.mockResolvedValue({ data: mockProduct, error: null });
        mockDb.select.mockResolvedValue({ data: mockVariants, error: null });

        const result = await service.getVariants('prod-1', accountId);

        expect(result).toEqual(mockVariants);
      });
    });

    describe('createVariant', () => {
      it('should create variant for product', async () => {
        const mockProduct: Product = {
          id: 'prod-1',
          account_id: accountId,
          name: 'Coffee',
          price_cents: 450,
          currency: 'USD',
          track_stock: false,
          sold_by_weight: false,
          is_composite: false,
          is_active: true,
          sort_order: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockProduct, error: null });
        mockDb.insert.mockResolvedValue({
          data: { id: 'var-1', product_id: 'prod-1', name: 'Large', price_cents: 550 },
          error: null
        });

        const result = await service.createVariant({
          product_id: 'prod-1',
          name: 'Large',
          price_cents: 550
        }, accountId);

        expect(result.name).toBe('Large');
      });
    });
  });

  describe('Categories', () => {
    describe('getCategories', () => {
      it('should fetch active categories', async () => {
        const mockCategories: ProductCategory[] = [
          {
            id: 'cat-1',
            account_id: accountId,
            name: 'Beverages',
            is_active: true,
            sort_order: 0,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }
        ];

        mockDb.select.mockResolvedValue({ data: mockCategories, error: null });

        const result = await service.getCategories(accountId);

        expect(result).toEqual(mockCategories);
      });
    });

    describe('createCategory', () => {
      it('should create category', async () => {
        mockDb.insert.mockResolvedValue({
          data: { id: 'cat-1', account_id: accountId, name: 'New Category' },
          error: null
        });

        const result = await service.createCategory({
          account_id: accountId,
          name: 'New Category'
        });

        expect(result.name).toBe('New Category');
      });

      it('should validate parent category exists', async () => {
        mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

        await expect(
          service.createCategory({
            account_id: accountId,
            name: 'Sub Category',
            parent_id: 'invalid-parent'
          })
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('Modifiers', () => {
    describe('getModifierGroups', () => {
      it('should fetch active modifier groups', async () => {
        mockDb.select.mockResolvedValue({
          data: [{ id: 'mg-1', name: 'Toppings', account_id: accountId }],
          error: null
        });

        const result = await service.getModifierGroups(accountId);

        expect(result).toHaveLength(1);
      });
    });

    describe('getModifiers', () => {
      it('should fetch modifiers for group', async () => {
        mockDb.select.mockResolvedValue({
          data: [
            { id: 'mod-1', name: 'Extra Shot', price_cents: 75, modifier_group_id: 'mg-1' }
          ],
          error: null
        });

        const result = await service.getModifiers('mg-1', accountId);

        expect(result).toHaveLength(1);
      });
    });
  });

  describe('getProductWithDetails', () => {
    it('should return product with variants and category', async () => {
      const mockProduct: Product = {
        id: 'prod-1',
        account_id: accountId,
        name: 'Coffee',
        category_id: 'cat-1',
        price_cents: 450,
        currency: 'USD',
        track_stock: false,
        sold_by_weight: false,
        is_composite: false,
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockCategory: ProductCategory = {
        id: 'cat-1',
        account_id: accountId,
        name: 'Beverages',
        is_active: true,
        sort_order: 0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const mockVariants: ProductVariant[] = [
        {
          id: 'var-1',
          product_id: 'prod-1',
          name: 'Small',
          is_active: true,
          sort_order: 0,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.selectOne
        .mockResolvedValueOnce({ data: mockProduct, error: null })
        .mockResolvedValueOnce({ data: mockProduct, error: null })
        .mockResolvedValueOnce({ data: mockCategory, error: null });
      mockDb.select.mockResolvedValue({ data: mockVariants, error: null });

      const result = await service.getProductWithDetails('prod-1', accountId);

      expect(result.product).toEqual(mockProduct);
      expect(result.variants).toEqual(mockVariants);
      expect(result.category).toEqual(mockCategory);
    });
  });
});
