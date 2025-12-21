import type { SelectOptions } from '../../db/types';
import type { Inventory, InventoryTransaction, InventoryTransactionType } from '../../types/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BaseService } from '../base.service';
import { nowISO } from '../../utils/datetime';

export interface GetInventoryInput {
  account_id: string;
  store_id?: string;
  product_id?: string;
  low_stock_only?: boolean;
}

export interface CreateInventoryInput {
  account_id: string;
  store_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity_on_hand?: number;
  reorder_point?: number | null;
  reorder_quantity?: number | null;
}

export interface UpdateInventoryInput {
  id: string;
  account_id: string;
  reorder_point?: number | null;
  reorder_quantity?: number | null;
}

export interface AdjustStockInput {
  account_id: string;
  inventory_id: string;
  transaction_type: InventoryTransactionType;
  quantity_change: number;
  reason?: string | null;
  notes?: string | null;
  employee_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}

export interface TransferStockInput {
  account_id: string;
  from_store_id: string;
  to_store_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
  employee_id?: string | null;
}

export interface StockCountInput {
  account_id: string;
  store_id: string;
  counts: Array<{
    product_id: string;
    variant_id?: string | null;
    counted_quantity: number;
    notes?: string | null;
  }>;
  employee_id?: string | null;
}

export interface LowStockItem extends Inventory {
  product_name?: string;
  variant_name?: string;
  stock_shortage: number;
}

export class InventoryService extends BaseService {
  /**
   * Get inventory records for an account
   */
  async getInventory(input: GetInventoryInput, options?: SelectOptions): Promise<Inventory[]> {
    const where: Array<{ column: string; operator: '=' | '<' | '<=' | '>' | '>='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    if (input.product_id) {
      where.push({ column: 'product_id', operator: '=' as const, value: input.product_id });
    }

    const result = await this.db.select<Inventory>('inventory', {
      ...options,
      where: [...where, ...(options?.where || [])]
    });

    if (result.error) {
      throw new Error(`Failed to fetch inventory: ${result.error}`);
    }

    // Filter low stock items if requested
    if (input.low_stock_only) {
      return result.data.filter(
        (inv) =>
          inv.reorder_point !== null && inv.quantity_on_hand <= inv.reorder_point
      );
    }

    return result.data;
  }

  /**
   * Get inventory by ID
   */
  async getInventoryById(id: string, accountId: string): Promise<Inventory> {
    const result = await this.db.selectOne<Inventory>('inventory', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Inventory record not found');
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Inventory record not found');
    }

    return result.data;
  }

  /**
   * Get inventory for a specific product at a store
   */
  async getProductInventory(
    productId: string,
    storeId: string,
    accountId: string,
    variantId?: string | null
  ): Promise<Inventory | null> {
    const where: Array<{ column: string; operator: '='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      { column: 'store_id', operator: '=' as const, value: storeId },
      { column: 'product_id', operator: '=' as const, value: productId }
    ];

    if (variantId !== undefined) {
      where.push({ column: 'variant_id', operator: '=' as const, value: variantId });
    }

    const result = await this.db.select<Inventory>('inventory', {
      where,
      limit: 1
    });

    if (result.error || !result.data || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Create inventory record for a product at a store
   */
  async createInventory(input: CreateInventoryInput): Promise<Inventory> {
    // Check if inventory record already exists
    const existing = await this.getProductInventory(
      input.product_id,
      input.store_id,
      input.account_id,
      input.variant_id
    );

    if (existing) {
      throw new ValidationError('Inventory record already exists for this product at this store');
    }

    const inventory: Partial<Inventory> = {
      account_id: input.account_id,
      store_id: input.store_id,
      product_id: input.product_id,
      variant_id: input.variant_id || null,
      quantity_on_hand: input.quantity_on_hand || 0,
      quantity_reserved: 0,
      reorder_point: input.reorder_point ?? null,
      reorder_quantity: input.reorder_quantity ?? null,
      last_counted_at: null
    };

    const result = await this.db.insert<Inventory>('inventory', inventory);

    if (result.error || !result.data) {
      throw new Error(`Failed to create inventory: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Update inventory settings (reorder point, quantity)
   */
  async updateInventory(input: UpdateInventoryInput): Promise<Inventory> {
    await this.getInventoryById(input.id, input.account_id);

    const updates: Partial<Inventory> = {};

    if (input.reorder_point !== undefined) {
      updates.reorder_point = input.reorder_point;
    }
    if (input.reorder_quantity !== undefined) {
      updates.reorder_quantity = input.reorder_quantity;
    }

    const result = await this.db.update<Inventory>('inventory', input.id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update inventory: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Adjust stock quantity with transaction logging
   */
  async adjustStock(input: AdjustStockInput): Promise<{
    inventory: Inventory;
    transaction: InventoryTransaction;
  }> {
    const inventory = await this.getInventoryById(input.inventory_id, input.account_id);

    // Validate transaction
    if (input.quantity_change === 0) {
      throw new ValidationError('Quantity change cannot be zero');
    }

    // Calculate new quantity
    let newQuantity = inventory.quantity_on_hand;
    const transactionTypes: InventoryTransactionType[] = ['sale', 'transfer_out'];

    if (transactionTypes.includes(input.transaction_type)) {
      // Reducing stock
      newQuantity -= Math.abs(input.quantity_change);
    } else {
      // Increasing stock
      newQuantity += Math.abs(input.quantity_change);
    }

    if (newQuantity < 0) {
      throw new ValidationError(
        `Insufficient stock. Current: ${inventory.quantity_on_hand}, Requested: ${Math.abs(input.quantity_change)}`
      );
    }

    // Create transaction record
    const transaction: Partial<InventoryTransaction> = {
      account_id: input.account_id,
      inventory_id: input.inventory_id,
      transaction_type: input.transaction_type,
      quantity_change: input.quantity_change,
      quantity_before: inventory.quantity_on_hand,
      quantity_after: newQuantity,
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      reason: input.reason || null,
      notes: input.notes || null,
      employee_id: input.employee_id || null
    };

    const transactionResult = await this.db.insert<InventoryTransaction>(
      'inventory_transactions',
      transaction
    );

    if (transactionResult.error || !transactionResult.data) {
      throw new Error(`Failed to create transaction: ${transactionResult.error || 'Unknown error'}`);
    }

    // Update inventory quantity
    const inventoryResult = await this.db.update<Inventory>('inventory', input.inventory_id, {
      quantity_on_hand: newQuantity
    });

    if (inventoryResult.error || !inventoryResult.data) {
      throw new Error(`Failed to update inventory: ${inventoryResult.error || 'Unknown error'}`);
    }

    return {
      inventory: inventoryResult.data,
      transaction: transactionResult.data
    };
  }

  /**
   * Reserve stock for an order
   */
  async reserveStock(
    inventoryId: string,
    accountId: string,
    quantity: number
  ): Promise<Inventory> {
    const inventory = await this.getInventoryById(inventoryId, accountId);

    const availableQuantity = inventory.quantity_on_hand - inventory.quantity_reserved;
    if (quantity > availableQuantity) {
      throw new ValidationError(
        `Insufficient available stock. Available: ${availableQuantity}, Requested: ${quantity}`
      );
    }

    const result = await this.db.update<Inventory>('inventory', inventoryId, {
      quantity_reserved: inventory.quantity_reserved + quantity
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to reserve stock: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Release reserved stock
   */
  async releaseReservedStock(
    inventoryId: string,
    accountId: string,
    quantity: number
  ): Promise<Inventory> {
    const inventory = await this.getInventoryById(inventoryId, accountId);

    const newReserved = Math.max(0, inventory.quantity_reserved - quantity);

    const result = await this.db.update<Inventory>('inventory', inventoryId, {
      quantity_reserved: newReserved
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to release reserved stock: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Transfer stock between stores
   */
  async transferStock(input: TransferStockInput): Promise<{
    from_inventory: Inventory;
    to_inventory: Inventory;
    from_transaction: InventoryTransaction;
    to_transaction: InventoryTransaction;
  }> {
    if (input.quantity <= 0) {
      throw new ValidationError('Transfer quantity must be positive');
    }

    if (input.from_store_id === input.to_store_id) {
      throw new ValidationError('Cannot transfer to the same store');
    }

    // Get or create source inventory
    let fromInventory = await this.getProductInventory(
      input.product_id,
      input.from_store_id,
      input.account_id,
      input.variant_id
    );

    if (!fromInventory) {
      throw new NotFoundError('Source inventory not found');
    }

    // Check sufficient stock
    const availableQuantity = fromInventory.quantity_on_hand - fromInventory.quantity_reserved;
    if (input.quantity > availableQuantity) {
      throw new ValidationError(
        `Insufficient stock for transfer. Available: ${availableQuantity}, Requested: ${input.quantity}`
      );
    }

    // Get or create destination inventory
    let toInventory = await this.getProductInventory(
      input.product_id,
      input.to_store_id,
      input.account_id,
      input.variant_id
    );

    if (!toInventory) {
      toInventory = await this.createInventory({
        account_id: input.account_id,
        store_id: input.to_store_id,
        product_id: input.product_id,
        variant_id: input.variant_id,
        quantity_on_hand: 0
      });
    }

    // Adjust source inventory
    const fromResult = await this.adjustStock({
      account_id: input.account_id,
      inventory_id: fromInventory.id,
      transaction_type: 'transfer_out',
      quantity_change: -input.quantity,
      reason: input.reason,
      notes: input.notes,
      employee_id: input.employee_id,
      reference_type: 'transfer',
      reference_id: toInventory.id
    });

    // Adjust destination inventory
    const toResult = await this.adjustStock({
      account_id: input.account_id,
      inventory_id: toInventory.id,
      transaction_type: 'transfer_in',
      quantity_change: input.quantity,
      reason: input.reason,
      notes: input.notes,
      employee_id: input.employee_id,
      reference_type: 'transfer',
      reference_id: fromInventory.id
    });

    return {
      from_inventory: fromResult.inventory,
      to_inventory: toResult.inventory,
      from_transaction: fromResult.transaction,
      to_transaction: toResult.transaction
    };
  }

  /**
   * Perform stock count and create adjustments
   */
  async performStockCount(input: StockCountInput): Promise<{
    adjustments: Array<{
      inventory: Inventory;
      transaction: InventoryTransaction;
      variance: number;
    }>;
    summary: {
      total_items: number;
      items_with_variance: number;
      total_positive_variance: number;
      total_negative_variance: number;
    };
  }> {
    const adjustments: Array<{
      inventory: Inventory;
      transaction: InventoryTransaction;
      variance: number;
    }> = [];

    let itemsWithVariance = 0;
    let totalPositiveVariance = 0;
    let totalNegativeVariance = 0;

    for (const count of input.counts) {
      // Get or create inventory
      let inventory = await this.getProductInventory(
        count.product_id,
        input.store_id,
        input.account_id,
        count.variant_id
      );

      if (!inventory) {
        inventory = await this.createInventory({
          account_id: input.account_id,
          store_id: input.store_id,
          product_id: count.product_id,
          variant_id: count.variant_id,
          quantity_on_hand: 0
        });
      }

      const variance = count.counted_quantity - inventory.quantity_on_hand;

      if (variance !== 0) {
        itemsWithVariance++;
        if (variance > 0) {
          totalPositiveVariance += variance;
        } else {
          totalNegativeVariance += Math.abs(variance);
        }

        const result = await this.adjustStock({
          account_id: input.account_id,
          inventory_id: inventory.id,
          transaction_type: 'count',
          quantity_change: variance,
          reason: 'Stock count adjustment',
          notes: count.notes,
          employee_id: input.employee_id
        });

        adjustments.push({
          inventory: result.inventory,
          transaction: result.transaction,
          variance
        });
      }

      // Update last counted timestamp
      await this.db.update<Inventory>('inventory', inventory.id, {
        last_counted_at: nowISO()
      });
    }

    return {
      adjustments,
      summary: {
        total_items: input.counts.length,
        items_with_variance: itemsWithVariance,
        total_positive_variance: totalPositiveVariance,
        total_negative_variance: totalNegativeVariance
      }
    };
  }

  /**
   * Get low stock items
   */
  async getLowStockItems(accountId: string, storeId?: string): Promise<LowStockItem[]> {
    const lowStockInventory = await this.getInventory({
      account_id: accountId,
      store_id: storeId,
      low_stock_only: true
    });

    return lowStockInventory.map((inv) => ({
      ...inv,
      stock_shortage: (inv.reorder_point || 0) - inv.quantity_on_hand
    }));
  }

  /**
   * Get inventory transactions for an inventory record
   */
  async getInventoryTransactions(
    inventoryId: string,
    accountId: string,
    options?: SelectOptions
  ): Promise<InventoryTransaction[]> {
    // Verify inventory belongs to account
    await this.getInventoryById(inventoryId, accountId);

    const result = await this.db.select<InventoryTransaction>('inventory_transactions', {
      ...options,
      where: [
        { column: 'inventory_id', operator: '=' as const, value: inventoryId },
        ...(options?.where || [])
      ],
      orderBy: [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch transactions: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get all transactions for an account (for reporting)
   */
  async getAccountTransactions(
    accountId: string,
    options?: SelectOptions & {
      transaction_type?: InventoryTransactionType;
      start_date?: string;
      end_date?: string;
    }
  ): Promise<InventoryTransaction[]> {
    const where: Array<{ column: string; operator: '=' | '>=' | '<='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: accountId }
    ];

    if (options?.transaction_type) {
      where.push({
        column: 'transaction_type',
        operator: '=' as const,
        value: options.transaction_type
      });
    }

    if (options?.start_date) {
      where.push({
        column: 'created_at',
        operator: '>=' as const,
        value: options.start_date
      });
    }

    if (options?.end_date) {
      where.push({
        column: 'created_at',
        operator: '<=' as const,
        value: options.end_date
      });
    }

    const result = await this.db.select<InventoryTransaction>('inventory_transactions', {
      where,
      limit: options?.limit || 100,
      offset: options?.offset,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch transactions: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get inventory value for a store
   */
  async getInventoryValue(
    accountId: string,
    storeId: string
  ): Promise<{
    total_items: number;
    total_quantity: number;
    total_value_cents: number;
  }> {
    const inventory = await this.getInventory({
      account_id: accountId,
      store_id: storeId
    });

    // We'd need to join with products table to get cost
    // For now, return quantity stats
    const totalQuantity = inventory.reduce((sum, inv) => sum + inv.quantity_on_hand, 0);

    return {
      total_items: inventory.length,
      total_quantity: totalQuantity,
      total_value_cents: 0 // Would need product cost data
    };
  }

  /**
   * Deduct stock for a sale (called from OrderService)
   */
  async deductStockForSale(
    accountId: string,
    storeId: string,
    items: Array<{
      product_id: string;
      variant_id?: string | null;
      quantity: number;
    }>,
    orderId: string,
    employeeId?: string
  ): Promise<void> {
    for (const item of items) {
      const inventory = await this.getProductInventory(
        item.product_id,
        storeId,
        accountId,
        item.variant_id
      );

      if (inventory) {
        await this.adjustStock({
          account_id: accountId,
          inventory_id: inventory.id,
          transaction_type: 'sale',
          quantity_change: -item.quantity,
          reference_type: 'order',
          reference_id: orderId,
          employee_id: employeeId
        });
      }
    }
  }

  /**
   * Return stock for a refund (called from PaymentService)
   */
  async returnStockForRefund(
    accountId: string,
    storeId: string,
    items: Array<{
      product_id: string;
      variant_id?: string | null;
      quantity: number;
    }>,
    refundId: string,
    employeeId?: string
  ): Promise<void> {
    for (const item of items) {
      const inventory = await this.getProductInventory(
        item.product_id,
        storeId,
        accountId,
        item.variant_id
      );

      if (inventory) {
        await this.adjustStock({
          account_id: accountId,
          inventory_id: inventory.id,
          transaction_type: 'refund',
          quantity_change: item.quantity,
          reference_type: 'refund',
          reference_id: refundId,
          employee_id: employeeId
        });
      }
    }
  }
}
