import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { InventoryService } from '../../services/inventory/inventory.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import type { InventoryTransactionType } from '../../types/database';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const inventoryService = new InventoryService();

const transactionTypeEnum = z.enum([
  'sale',
  'refund',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'count',
  'purchase',
  'production'
]);

const querySchema = z.object({
  store_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  low_stock_only: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const createInventorySchema = z.object({
  store_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity_on_hand: z.number().int().nonnegative().default(0),
  reorder_point: z.number().int().nonnegative().nullable().optional(),
  reorder_quantity: z.number().int().positive().nullable().optional()
});

const updateInventorySchema = z.object({
  reorder_point: z.number().int().nonnegative().nullable().optional(),
  reorder_quantity: z.number().int().positive().nullable().optional()
});

const adjustStockSchema = z.object({
  transaction_type: transactionTypeEnum,
  quantity_change: z.number().int().refine((val) => val !== 0, 'Quantity change cannot be zero'),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  reference_type: z.string().nullable().optional(),
  reference_id: z.string().uuid().nullable().optional()
});

const transferStockSchema = z.object({
  from_store_id: z.string().uuid(),
  to_store_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

const stockCountSchema = z.object({
  store_id: z.string().uuid(),
  counts: z.array(
    z.object({
      product_id: z.string().uuid(),
      variant_id: z.string().uuid().nullable().optional(),
      counted_quantity: z.number().int().nonnegative(),
      notes: z.string().nullable().optional()
    })
  )
});

const transactionQuerySchema = z.object({
  transaction_type: transactionTypeEnum.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

/**
 * Register inventory routes
 */
export function registerInventoryRoutes(router: Router): void {
  /**
   * GET /api/v1/inventory
   * Get inventory records for the account
   */
  router.get(
    '/api/v1/inventory',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      const inventory = await inventoryService.getInventory(
        {
          account_id: accountId,
          store_id: query.store_id,
          product_id: query.product_id,
          low_stock_only: query.low_stock_only
        },
        {
          limit: query.limit,
          offset: (query.page - 1) * query.limit
        }
      );

      paginatedResponse(res, inventory, inventory.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateQuery(querySchema)]
  );

  /**
   * GET /api/v1/inventory/:id
   * Get a specific inventory record
   */
  router.get(
    '/api/v1/inventory/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const inventoryId = req.params.id;

      const inventory = await inventoryService.getInventoryById(inventoryId, accountId);

      successResponse(res, inventory, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/inventory
   * Create inventory record for a product at a store
   */
  router.post(
    '/api/v1/inventory',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createInventorySchema.parse(req.body);

      const inventory = await inventoryService.createInventory({
        ...input,
        account_id: accountId
      });

      successResponse(res, inventory, 201, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateBody(createInventorySchema)
    ]
  );

  /**
   * PUT /api/v1/inventory/:id
   * Update inventory settings (reorder point, quantity)
   */
  router.put(
    '/api/v1/inventory/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const inventoryId = req.params.id;
      const input = updateInventorySchema.parse(req.body);

      const inventory = await inventoryService.updateInventory({
        id: inventoryId,
        account_id: accountId,
        ...input
      });

      successResponse(res, inventory, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(updateInventorySchema)
    ]
  );

  /**
   * POST /api/v1/inventory/:id/adjust
   * Adjust stock quantity for an inventory record
   */
  router.post(
    '/api/v1/inventory/:id/adjust',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const inventoryId = req.params.id;
      const employeeId = req.employeeId || req.userId;
      const input = adjustStockSchema.parse(req.body);

      const result = await inventoryService.adjustStock({
        account_id: accountId,
        inventory_id: inventoryId,
        transaction_type: input.transaction_type as InventoryTransactionType,
        quantity_change: input.quantity_change as number,
        reason: input.reason as string | null | undefined,
        notes: input.notes as string | null | undefined,
        employee_id: employeeId,
        reference_type: input.reference_type as string | null | undefined,
        reference_id: input.reference_id as string | null | undefined
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(adjustStockSchema)
    ]
  );

  /**
   * POST /api/v1/inventory/transfer
   * Transfer stock between stores
   */
  router.post(
    '/api/v1/inventory/transfer',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.employeeId || req.userId;
      const input = transferStockSchema.parse(req.body);

      const result = await inventoryService.transferStock({
        account_id: accountId,
        from_store_id: input.from_store_id,
        to_store_id: input.to_store_id,
        product_id: input.product_id,
        variant_id: input.variant_id,
        quantity: input.quantity,
        reason: input.reason,
        notes: input.notes,
        employee_id: employeeId
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateBody(transferStockSchema)]
  );

  /**
   * POST /api/v1/inventory/count
   * Perform stock count and create adjustments
   */
  router.post(
    '/api/v1/inventory/count',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.employeeId || req.userId;
      const input = stockCountSchema.parse(req.body);

      const result = await inventoryService.performStockCount({
        account_id: accountId,
        store_id: input.store_id,
        counts: input.counts,
        employee_id: employeeId
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager'), validateBody(stockCountSchema)]
  );

  /**
   * GET /api/v1/inventory/low-stock
   * Get low stock items
   */
  router.get(
    '/api/v1/inventory/low-stock',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const { store_id } = z
        .object({ store_id: z.string().uuid().optional() })
        .parse(req.query || {});

      const lowStockItems = await inventoryService.getLowStockItems(accountId, store_id);

      successResponse(res, lowStockItems, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateQuery(z.object({ store_id: z.string().uuid().optional() }))
    ]
  );

  /**
   * GET /api/v1/inventory/:id/transactions
   * Get transactions for an inventory record
   */
  router.get(
    '/api/v1/inventory/:id/transactions',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const inventoryId = req.params.id;
      const query = transactionQuerySchema.parse(req.query || {});

      const transactions = await inventoryService.getInventoryTransactions(
        inventoryId,
        accountId,
        {
          limit: query.limit,
          offset: (query.page - 1) * query.limit
        }
      );

      paginatedResponse(res, transactions, transactions.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateQuery(transactionQuerySchema)
    ]
  );

  /**
   * GET /api/v1/inventory/transactions
   * Get all inventory transactions for the account
   */
  router.get(
    '/api/v1/inventory/transactions',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = transactionQuerySchema.parse(req.query || {});

      const transactions = await inventoryService.getAccountTransactions(accountId, {
        transaction_type: query.transaction_type as InventoryTransactionType | undefined,
        start_date: query.start_date,
        end_date: query.end_date,
        limit: query.limit,
        offset: (query.page - 1) * query.limit
      });

      paginatedResponse(res, transactions, transactions.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateQuery(transactionQuerySchema)
    ]
  );

  /**
   * GET /api/v1/stores/:storeId/inventory
   * Get inventory for a specific store
   */
  router.get(
    '/api/v1/stores/:storeId/inventory',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const storeId = req.params.storeId;
      const query = querySchema.parse(req.query || {});

      const inventory = await inventoryService.getInventory(
        {
          account_id: accountId,
          store_id: storeId,
          product_id: query.product_id,
          low_stock_only: query.low_stock_only
        },
        {
          limit: query.limit,
          offset: (query.page - 1) * query.limit
        }
      );

      paginatedResponse(res, inventory, inventory.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ storeId: z.string().uuid() })),
      validateQuery(querySchema)
    ]
  );

  /**
   * GET /api/v1/stores/:storeId/inventory/value
   * Get inventory value for a store
   */
  router.get(
    '/api/v1/stores/:storeId/inventory/value',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const storeId = req.params.storeId;

      const value = await inventoryService.getInventoryValue(accountId, storeId);

      successResponse(res, value, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ storeId: z.string().uuid() }))
    ]
  );

  /**
   * GET /api/v1/products/:productId/inventory
   * Get inventory for a specific product across all stores
   */
  router.get(
    '/api/v1/products/:productId/inventory',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const productId = req.params.productId;

      const inventory = await inventoryService.getInventory({
        account_id: accountId,
        product_id: productId
      });

      successResponse(res, inventory, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ productId: z.string().uuid() }))
    ]
  );
}
