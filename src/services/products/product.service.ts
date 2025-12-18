import type { SelectOptions } from '../../db/types';
import type {
  Product,
  ProductCategory,
  ProductVariant,
  Modifier,
  ModifierGroup
} from '../../types/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BaseService } from '../base.service';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface CreateProductInput {
  account_id: string;
  category_id?: string | null;
  name: string;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price_cents: number;
  cost_cents?: number | null;
  currency?: string;
  tax_group_id?: string | null;
  track_stock?: boolean;
  sold_by_weight?: boolean;
  weight_unit?: 'kg' | 'lb' | 'oz' | 'g' | null;
  is_composite?: boolean;
  kitchen_routing?: string | null;
  color?: string | null;
  image_url?: string | null;
  sort_order?: number;
}

export interface UpdateProductInput extends Partial<Omit<CreateProductInput, 'account_id'>> {
  id: string;
  is_active?: boolean;
}

export interface CreateVariantInput {
  product_id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price_cents?: number | null;
  cost_cents?: number | null;
  sort_order?: number;
}

export interface CreateCategoryInput {
  account_id: string;
  name: string;
  parent_id?: string | null;
  description?: string | null;
  color?: string | null;
  image_url?: string | null;
  sort_order?: number;
}

export interface ProductSearchInput {
  account_id: string;
  query?: string;
  category_id?: string;
  barcode?: string;
  sku?: string;
  is_active?: boolean;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ProductService extends BaseService {
  // ===========================================================================
  // PRODUCTS
  // ===========================================================================

  /**
   * Get all products for an account
   */
  async getProducts(accountId: string, options?: SelectOptions): Promise<Product[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      { column: 'is_active', operator: '=' as const, value: true },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Product>('products', {
      ...options,
      where,
      orderBy: options?.orderBy || [{ column: 'sort_order', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch products: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get a single product by ID
   */
  async getProductById(id: string, accountId: string): Promise<Product> {
    const result = await this.db.selectOne<Product>('products', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Product', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Product', id);
    }

    return result.data;
  }

  /**
   * Get product by barcode
   */
  async getProductByBarcode(barcode: string, accountId: string): Promise<Product | null> {
    const result = await this.db.select<Product>('products', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'barcode', operator: '=' as const, value: barcode },
        { column: 'is_active', operator: '=' as const, value: true }
      ],
      limit: 1
    });

    if (result.error || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Get product by SKU
   */
  async getProductBySku(sku: string, accountId: string): Promise<Product | null> {
    const result = await this.db.select<Product>('products', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'sku', operator: '=' as const, value: sku },
        { column: 'is_active', operator: '=' as const, value: true }
      ],
      limit: 1
    });

    if (result.error || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Search products by name, SKU, or barcode
   */
  async searchProducts(input: ProductSearchInput): Promise<Product[]> {
    const where: Array<{ column: string; operator: '=' | 'ilike'; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.is_active !== undefined) {
      where.push({ column: 'is_active', operator: '=' as const, value: input.is_active });
    } else {
      where.push({ column: 'is_active', operator: '=' as const, value: true });
    }

    if (input.category_id) {
      where.push({ column: 'category_id', operator: '=' as const, value: input.category_id });
    }

    if (input.barcode) {
      where.push({ column: 'barcode', operator: '=' as const, value: input.barcode });
    }

    if (input.sku) {
      where.push({ column: 'sku', operator: '=' as const, value: input.sku });
    }

    if (input.query) {
      // Search by name (case-insensitive)
      where.push({ column: 'name', operator: 'ilike' as const, value: `%${input.query}%` });
    }

    const result = await this.db.select<Product>('products', {
      where,
      orderBy: [{ column: 'name', direction: 'asc' as const }],
      limit: 100
    });

    if (result.error) {
      throw new Error(`Failed to search products: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Create a new product
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    // Validate unique SKU if provided
    if (input.sku) {
      const existing = await this.getProductBySku(input.sku, input.account_id);
      if (existing) {
        throw new ValidationError('Product with this SKU already exists');
      }
    }

    // Validate unique barcode if provided
    if (input.barcode) {
      const existing = await this.getProductByBarcode(input.barcode, input.account_id);
      if (existing) {
        throw new ValidationError('Product with this barcode already exists');
      }
    }

    // Validate category exists if provided
    if (input.category_id) {
      await this.getCategoryById(input.category_id, input.account_id);
    }

    const product: Partial<Product> = {
      account_id: input.account_id,
      category_id: input.category_id || null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      price_cents: input.price_cents,
      cost_cents: input.cost_cents || null,
      currency: input.currency || 'USD',
      tax_group_id: input.tax_group_id || null,
      track_stock: input.track_stock ?? false,
      sold_by_weight: input.sold_by_weight ?? false,
      weight_unit: input.weight_unit || null,
      is_composite: input.is_composite ?? false,
      kitchen_routing: input.kitchen_routing || null,
      color: input.color || null,
      image_url: input.image_url || null,
      sort_order: input.sort_order ?? 0,
      is_active: true
    };

    const result = await this.db.insert<Product>('products', product);

    if (result.error || !result.data) {
      throw new Error(`Failed to create product: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Update a product
   */
  async updateProduct(input: UpdateProductInput, accountId: string): Promise<Product> {
    // Verify product exists and belongs to account
    await this.getProductById(input.id, accountId);

    // Validate unique SKU if changing
    if (input.sku !== undefined) {
      const existing = await this.getProductBySku(input.sku!, accountId);
      if (existing && existing.id !== input.id) {
        throw new ValidationError('Product with this SKU already exists');
      }
    }

    // Validate unique barcode if changing
    if (input.barcode !== undefined) {
      const existing = await this.getProductByBarcode(input.barcode!, accountId);
      if (existing && existing.id !== input.id) {
        throw new ValidationError('Product with this barcode already exists');
      }
    }

    // Validate category if changing
    if (input.category_id !== undefined && input.category_id !== null) {
      await this.getCategoryById(input.category_id, accountId);
    }

    const updates: Partial<Product> = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;
    if (input.sku !== undefined) updates.sku = input.sku?.trim() || null;
    if (input.barcode !== undefined) updates.barcode = input.barcode?.trim() || null;
    if (input.category_id !== undefined) updates.category_id = input.category_id;
    if (input.price_cents !== undefined) updates.price_cents = input.price_cents;
    if (input.cost_cents !== undefined) updates.cost_cents = input.cost_cents;
    if (input.currency !== undefined) updates.currency = input.currency;
    if (input.tax_group_id !== undefined) updates.tax_group_id = input.tax_group_id;
    if (input.track_stock !== undefined) updates.track_stock = input.track_stock;
    if (input.sold_by_weight !== undefined) updates.sold_by_weight = input.sold_by_weight;
    if (input.weight_unit !== undefined) updates.weight_unit = input.weight_unit;
    if (input.is_composite !== undefined) updates.is_composite = input.is_composite;
    if (input.kitchen_routing !== undefined) updates.kitchen_routing = input.kitchen_routing;
    if (input.color !== undefined) updates.color = input.color;
    if (input.image_url !== undefined) updates.image_url = input.image_url;
    if (input.sort_order !== undefined) updates.sort_order = input.sort_order;
    if (input.is_active !== undefined) updates.is_active = input.is_active;

    const result = await this.db.update<Product>('products', input.id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update product: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Delete (soft) a product
   */
  async deleteProduct(id: string, accountId: string): Promise<void> {
    await this.getProductById(id, accountId);
    await this.db.update<Product>('products', id, { is_active: false });
  }

  // ===========================================================================
  // VARIANTS
  // ===========================================================================

  /**
   * Get variants for a product
   */
  async getVariants(productId: string, accountId: string): Promise<ProductVariant[]> {
    // Verify product exists
    await this.getProductById(productId, accountId);

    const result = await this.db.select<ProductVariant>('product_variants', {
      where: [
        { column: 'product_id', operator: '=' as const, value: productId },
        { column: 'is_active', operator: '=' as const, value: true }
      ],
      orderBy: [{ column: 'sort_order', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch variants: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get variant by ID
   */
  async getVariantById(id: string, accountId: string): Promise<ProductVariant> {
    const result = await this.db.selectOne<ProductVariant>('product_variants', id);

    if (result.error || !result.data) {
      throw new NotFoundError('ProductVariant', id);
    }

    // Verify product belongs to account
    await this.getProductById(result.data.product_id, accountId);

    return result.data;
  }

  /**
   * Create a variant
   */
  async createVariant(input: CreateVariantInput, accountId: string): Promise<ProductVariant> {
    // Verify product exists
    await this.getProductById(input.product_id, accountId);

    const variant: Partial<ProductVariant> = {
      product_id: input.product_id,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      price_cents: input.price_cents || null,
      cost_cents: input.cost_cents || null,
      sort_order: input.sort_order ?? 0,
      is_active: true
    };

    const result = await this.db.insert<ProductVariant>('product_variants', variant);

    if (result.error || !result.data) {
      throw new Error(`Failed to create variant: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================

  /**
   * Get all categories for an account
   */
  async getCategories(accountId: string): Promise<ProductCategory[]> {
    const result = await this.db.select<ProductCategory>('product_categories', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'is_active', operator: '=' as const, value: true }
      ],
      orderBy: [{ column: 'sort_order', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch categories: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get category by ID
   */
  async getCategoryById(id: string, accountId: string): Promise<ProductCategory> {
    const result = await this.db.selectOne<ProductCategory>('product_categories', id);

    if (result.error || !result.data) {
      throw new NotFoundError('ProductCategory', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('ProductCategory', id);
    }

    return result.data;
  }

  /**
   * Create a category
   */
  async createCategory(input: CreateCategoryInput): Promise<ProductCategory> {
    // Validate parent category if provided
    if (input.parent_id) {
      await this.getCategoryById(input.parent_id, input.account_id);
    }

    const category: Partial<ProductCategory> = {
      account_id: input.account_id,
      name: input.name.trim(),
      parent_id: input.parent_id || null,
      description: input.description?.trim() || null,
      color: input.color || null,
      image_url: input.image_url || null,
      sort_order: input.sort_order ?? 0,
      is_active: true
    };

    const result = await this.db.insert<ProductCategory>('product_categories', category);

    if (result.error || !result.data) {
      throw new Error(`Failed to create category: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // MODIFIERS
  // ===========================================================================

  /**
   * Get all modifier groups for an account
   */
  async getModifierGroups(accountId: string): Promise<ModifierGroup[]> {
    const result = await this.db.select<ModifierGroup>('modifier_groups', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'is_active', operator: '=' as const, value: true }
      ]
    });

    if (result.error) {
      throw new Error(`Failed to fetch modifier groups: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get modifiers for a group
   */
  async getModifiers(groupId: string, accountId: string): Promise<Modifier[]> {
    const result = await this.db.select<Modifier>('modifiers', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'modifier_group_id', operator: '=' as const, value: groupId },
        { column: 'is_active', operator: '=' as const, value: true }
      ],
      orderBy: [{ column: 'sort_order', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch modifiers: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get modifier by ID
   */
  async getModifierById(id: string, accountId: string): Promise<Modifier> {
    const result = await this.db.selectOne<Modifier>('modifiers', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Modifier', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Modifier', id);
    }

    return result.data;
  }

  // ===========================================================================
  // PRODUCT WITH DETAILS
  // ===========================================================================

  /**
   * Get product with all related data (variants, modifiers, etc.)
   */
  async getProductWithDetails(
    id: string,
    accountId: string
  ): Promise<{
    product: Product;
    variants: ProductVariant[];
    category: ProductCategory | null;
  }> {
    const product = await this.getProductById(id, accountId);
    const variants = await this.getVariants(id, accountId);

    let category: ProductCategory | null = null;
    if (product.category_id) {
      try {
        category = await this.getCategoryById(product.category_id, accountId);
      } catch {
        // Category might have been deleted
      }
    }

    return { product, variants, category };
  }
}
