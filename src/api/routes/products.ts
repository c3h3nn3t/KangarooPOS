import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { ProductService } from '../../services/products/product.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const productService = new ProductService();

// =============================================================================
// SCHEMAS
// =============================================================================

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  price_cents: z.number().int().min(0),
  cost_cents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default('USD'),
  tax_group_id: z.string().uuid().nullable().optional(),
  track_stock: z.boolean().default(false),
  sold_by_weight: z.boolean().default(false),
  weight_unit: z.enum(['kg', 'lb', 'oz', 'g']).nullable().optional(),
  is_composite: z.boolean().default(false),
  kitchen_routing: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().default(0)
});

const updateProductSchema = createProductSchema.partial().extend({
  is_active: z.boolean().optional()
});

const createVariantSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  price_cents: z.number().int().min(0).nullable().optional(),
  cost_cents: z.number().int().min(0).nullable().optional(),
  sort_order: z.number().int().default(0)
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().default(0)
});

const querySchema = z.object({
  search: z.string().optional(),
  category_id: z.string().uuid().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const uuidParamSchema = z.object({ id: z.string().uuid() });
const productIdParamSchema = z.object({ productId: z.string().uuid() });

// =============================================================================
// ROUTES
// =============================================================================

export function registerProductRoutes(router: Router): void {
  // ===========================================================================
  // PRODUCTS
  // ===========================================================================

  /**
   * GET /api/v1/products
   * List all products
   */
  router.get(
    '/api/v1/products',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      if (query.search || query.category_id || query.barcode || query.sku) {
        // Get total count for pagination
        const allProducts = await productService.searchProducts({
          account_id: accountId,
          query: query.search,
          category_id: query.category_id,
          barcode: query.barcode,
          sku: query.sku,
          is_active: query.is_active
        });

        // Get paginated results
        const products = await productService.searchProducts({
          account_id: accountId,
          query: query.search,
          category_id: query.category_id,
          barcode: query.barcode,
          sku: query.sku,
          is_active: query.is_active,
          limit: query.limit,
          offset: (query.page - 1) * query.limit
        });

        paginatedResponse(res, products, allProducts.length, query.page, query.limit, {
          requestId: req.requestId
        });
      } else {
        // Get paginated products and total count separately for correct pagination
        const [products, totalCount] = await Promise.all([
          productService.getProducts(accountId, {
            limit: query.limit,
            offset: (query.page - 1) * query.limit
          }),
          productService.countProducts(accountId)
        ]);

        paginatedResponse(res, products, totalCount, query.page, query.limit, {
          requestId: req.requestId
        });
      }
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/products/barcode/:barcode
   * Lookup product by barcode
   * Note: This route must be registered before the generic :id route
   */
  router.get(
    '/api/v1/products/barcode/:barcode',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const barcode = req.params.barcode;

      const product = await productService.getProductByBarcode(barcode, accountId);

      if (!product) {
        successResponse(res, null, 200, { requestId: req.requestId });
        return;
      }

      successResponse(res, product, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(z.object({ barcode: z.string().min(1) }))]
  );

  /**
   * GET /api/v1/products/:id
   * Get single product with details
   */
  router.get(
    '/api/v1/products/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const productId = req.params.id;

      const result = await productService.getProductWithDetails(productId, accountId);

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/products
   * Create a new product
   */
  router.post(
    '/api/v1/products',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createProductSchema.parse(req.body);

      const product = await productService.createProduct({
        ...input,
        account_id: accountId
      });

      successResponse(res, product, 201, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateBody(createProductSchema)]
  );

  /**
   * PUT /api/v1/products/:id
   * Update a product
   */
  router.put(
    '/api/v1/products/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const productId = req.params.id;
      const input = updateProductSchema.parse(req.body);

      const product = await productService.updateProduct(
        { ...input, id: productId },
        accountId
      );

      successResponse(res, product, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('manager'),
      validateParams(uuidParamSchema),
      validateBody(updateProductSchema)
    ]
  );

  /**
   * DELETE /api/v1/products/:id
   * Soft delete a product
   */
  router.delete(
    '/api/v1/products/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const productId = req.params.id;

      await productService.deleteProduct(productId, accountId);

      successResponse(res, { id: productId, deleted: true }, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateParams(uuidParamSchema)]
  );

  // ===========================================================================
  // VARIANTS
  // ===========================================================================

  /**
   * GET /api/v1/products/:productId/variants
   * Get variants for a product
   */
  router.get(
    '/api/v1/products/:productId/variants',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const productId = req.params.productId;

      const variants = await productService.getVariants(productId, accountId);

      successResponse(res, variants, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(productIdParamSchema)]
  );

  /**
   * POST /api/v1/products/:productId/variants
   * Create a variant for a product
   */
  router.post(
    '/api/v1/products/:productId/variants',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const productId = req.params.productId;
      const input = createVariantSchema.parse(req.body);

      const variant = await productService.createVariant(
        { ...input, product_id: productId },
        accountId
      );

      successResponse(res, variant, 201, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('manager'),
      validateParams(productIdParamSchema),
      validateBody(createVariantSchema)
    ]
  );

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================

  /**
   * GET /api/v1/categories
   * List all categories
   */
  router.get(
    '/api/v1/categories',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const categories = await productService.getCategories(accountId);

      successResponse(res, categories, 200, { requestId: req.requestId });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/categories/:id
   * Get single category
   */
  router.get(
    '/api/v1/categories/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const categoryId = req.params.id;

      const category = await productService.getCategoryById(categoryId, accountId);

      successResponse(res, category, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/categories
   * Create a category
   */
  router.post(
    '/api/v1/categories',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createCategorySchema.parse(req.body);

      const category = await productService.createCategory({
        ...input,
        account_id: accountId
      });

      successResponse(res, category, 201, { requestId: req.requestId });
    },
    [authenticate(), requireRole('manager'), validateBody(createCategorySchema)]
  );

  // ===========================================================================
  // MODIFIERS
  // ===========================================================================

  /**
   * GET /api/v1/modifier-groups
   * List all modifier groups
   */
  router.get(
    '/api/v1/modifier-groups',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const groups = await productService.getModifierGroups(accountId);

      successResponse(res, groups, 200, { requestId: req.requestId });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/modifier-groups/:id/modifiers
   * Get modifiers for a group
   */
  router.get(
    '/api/v1/modifier-groups/:id/modifiers',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const groupId = req.params.id;

      const modifiers = await productService.getModifiers(groupId, accountId);

      successResponse(res, modifiers, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(uuidParamSchema)]
  );

  /**
   * POST /api/v1/products/search
   * Advanced product search
   */
  router.post(
    '/api/v1/products/search',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const body = z
        .object({
          query: z.string().optional(),
          category_id: z.string().uuid().optional(),
          barcode: z.string().optional(),
          sku: z.string().optional(),
          is_active: z.boolean().optional()
        })
        .parse(req.body);

      const products = await productService.searchProducts({
        account_id: accountId,
        ...body
      });

      successResponse(res, products, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      validateBody(
        z.object({
          query: z.string().optional(),
          category_id: z.string().uuid().optional(),
          barcode: z.string().optional(),
          sku: z.string().optional(),
          is_active: z.boolean().optional()
        })
      )
    ]
  );
}
