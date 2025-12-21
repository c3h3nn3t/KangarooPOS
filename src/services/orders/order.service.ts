import type { SelectOptions } from '../../db/types';
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  TaxBreakdownItem,
  DiscountBreakdownItem,
  OrderItemModifier,
  Product,
  TaxRule
} from '../../types/database';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { nowISO } from '../../utils/datetime';
import { generateId } from '../../utils/idempotency';
import { BaseService } from '../base.service';
import { ProductService } from '../products/product.service';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface CreateOrderInput {
  account_id: string;
  store_id: string;
  employee_id?: string | null;
  customer_id?: string | null;
  device_id?: string | null;
  shift_id?: string | null;
  order_type?: OrderType;
  table_number?: string | null;
  guest_count?: number | null;
  notes?: string | null;
  idempotency_key?: string | null;
  is_offline?: boolean;
}

export interface AddOrderItemInput {
  order_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price_cents?: number; // Override product price if provided
  modifiers?: OrderItemModifierInput[];
  notes?: string | null;
}

export interface OrderItemModifierInput {
  modifier_id: string;
  name: string;
  price_cents: number;
}

export interface UpdateOrderItemInput {
  quantity?: number;
  notes?: string | null;
}

export interface ApplyDiscountInput {
  order_id: string;
  type: 'percent' | 'fixed';
  name: string;
  value: number; // Percent (0-100) or cents
  applied_to: 'order' | 'item';
  item_id?: string;
}

export interface OrderSearchInput {
  account_id: string;
  store_id?: string;
  employee_id?: string;
  customer_id?: string;
  status?: OrderStatus | OrderStatus[];
  order_type?: OrderType;
  from_date?: string;
  to_date?: string;
  receipt_number?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// SERVICE
// =============================================================================

export class OrderService extends BaseService {
  private productService: ProductService;

  constructor() {
    super();
    this.productService = new ProductService();
  }

  // ===========================================================================
  // ORDER CRUD
  // ===========================================================================

  /**
   * Get orders for an account
   */
  async getOrders(accountId: string, options?: SelectOptions): Promise<Order[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Order>('orders', {
      ...options,
      where,
      orderBy: options?.orderBy || [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch orders: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Search orders with filters
   */
  async searchOrders(input: OrderSearchInput): Promise<Order[]> {
    const where: Array<{ column: string; operator: '=' | '>=' | '<=' | 'in'; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    if (input.employee_id) {
      where.push({ column: 'employee_id', operator: '=' as const, value: input.employee_id });
    }

    if (input.customer_id) {
      where.push({ column: 'customer_id', operator: '=' as const, value: input.customer_id });
    }

    if (input.status) {
      if (Array.isArray(input.status)) {
        where.push({ column: 'status', operator: 'in' as const, value: input.status });
      } else {
        where.push({ column: 'status', operator: '=' as const, value: input.status });
      }
    }

    if (input.order_type) {
      where.push({ column: 'order_type', operator: '=' as const, value: input.order_type });
    }

    if (input.from_date) {
      where.push({ column: 'created_at', operator: '>=' as const, value: input.from_date });
    }

    if (input.to_date) {
      where.push({ column: 'created_at', operator: '<=' as const, value: input.to_date });
    }

    if (input.receipt_number) {
      where.push({ column: 'receipt_number', operator: '=' as const, value: input.receipt_number });
    }

    const result = await this.db.select<Order>('orders', {
      where,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      ...(input.limit !== undefined && { limit: input.limit }),
      ...(input.offset !== undefined && { offset: input.offset })
    });

    if (result.error) {
      throw new Error(`Failed to search orders: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get a single order by ID
   */
  async getOrderById(id: string, accountId: string): Promise<Order> {
    const result = await this.db.selectOne<Order>('orders', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Order', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Order', id);
    }

    return result.data;
  }

  /**
   * Get order by idempotency key (for duplicate prevention)
   */
  async getOrderByIdempotencyKey(key: string, accountId: string): Promise<Order | null> {
    const result = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'idempotency_key', operator: '=' as const, value: key }
      ],
      limit: 1
    });

    if (result.error || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Create a new order
   */
  async createOrder(input: CreateOrderInput): Promise<Order> {
    // Check for duplicate via idempotency key
    if (input.idempotency_key) {
      const existing = await this.getOrderByIdempotencyKey(
        input.idempotency_key,
        input.account_id
      );
      if (existing) {
        return existing; // Return existing order instead of creating duplicate
      }
    }

    const order: Partial<Order> = {
      account_id: input.account_id,
      store_id: input.store_id,
      employee_id: input.employee_id || null,
      customer_id: input.customer_id || null,
      device_id: input.device_id || null,
      shift_id: input.shift_id || null,
      status: 'draft',
      order_type: input.order_type || 'dine_in',
      subtotal_cents: 0,
      discount_cents: 0,
      tax_cents: 0,
      tip_cents: 0,
      total_cents: 0,
      currency: 'USD',
      tax_breakdown: [],
      discount_breakdown: [],
      notes: input.notes || null,
      table_number: input.table_number || null,
      guest_count: input.guest_count || null,
      idempotency_key: input.idempotency_key || null,
      is_offline: input.is_offline ?? false,
      offline_created_at: input.is_offline ? nowISO() : null
    };

    const result = await this.db.insert<Order>('orders', order);

    if (result.error || !result.data) {
      throw new Error(`Failed to create order: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Update order metadata (not items)
   */
  async updateOrder(
    id: string,
    accountId: string,
    updates: Partial<Pick<Order, 'customer_id' | 'table_number' | 'guest_count' | 'notes' | 'order_type'>>
  ): Promise<Order> {
    const order = await this.getOrderById(id, accountId);

    if (!['draft', 'pending'].includes(order.status)) {
      throw new ConflictError('Cannot update order that is already being processed');
    }

    const result = await this.db.update<Order>('orders', id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update order: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // ORDER ITEMS
  // ===========================================================================

  /**
   * Get items for an order
   */
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    const result = await this.db.select<OrderItem>('order_items', {
      where: [{ column: 'order_id', operator: '=' as const, value: orderId }],
      orderBy: [{ column: 'sort_order', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch order items: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Add item to order
   */
  async addOrderItem(input: AddOrderItemInput, accountId: string): Promise<OrderItem> {
    // Get the order
    const order = await this.getOrderById(input.order_id, accountId);

    if (!['draft', 'pending'].includes(order.status)) {
      throw new ConflictError('Cannot add items to order that is already being processed');
    }

    // Get the product
    const product = await this.productService.getProductById(input.product_id, accountId);

    // Calculate item totals
    const unitPrice = input.unit_price_cents ?? product.price_cents;
    const quantity = input.quantity;

    // Calculate modifier total
    const modifierTotal = (input.modifiers || []).reduce(
      (sum, mod) => sum + mod.price_cents,
      0
    );

    const subtotal = (unitPrice + modifierTotal) * quantity;

    // Get existing items to determine sort order
    const existingItems = await this.getOrderItems(input.order_id);
    const sortOrder = existingItems.length;

    // Create order item
    const orderItem: Partial<OrderItem> = {
      order_id: input.order_id,
      product_id: input.product_id,
      variant_id: input.variant_id || null,
      name: product.name,
      sku: product.sku,
      quantity,
      unit_price_cents: unitPrice,
      subtotal_cents: subtotal,
      discount_cents: 0,
      tax_cents: 0, // Will be calculated when order is finalized
      total_cents: subtotal,
      modifiers: (input.modifiers || []) as OrderItemModifier[],
      tax_breakdown: [],
      notes: input.notes || null,
      kitchen_status: 'pending',
      sort_order: sortOrder
    };

    const result = await this.db.insert<OrderItem>('order_items', orderItem);

    if (result.error || !result.data) {
      throw new Error(`Failed to add order item: ${result.error || 'Unknown error'}`);
    }

    // Recalculate order totals
    await this.recalculateOrderTotals(input.order_id, accountId);

    return result.data;
  }

  /**
   * Update order item quantity
   */
  async updateOrderItem(
    itemId: string,
    input: UpdateOrderItemInput,
    accountId: string
  ): Promise<OrderItem> {
    const item = await this.getOrderItemById(itemId);
    const order = await this.getOrderById(item.order_id, accountId);

    if (!['draft', 'pending'].includes(order.status)) {
      throw new ConflictError('Cannot update items on order that is already being processed');
    }

    const updates: Partial<OrderItem> = {};

    if (input.quantity !== undefined) {
      if (input.quantity <= 0) {
        throw new ValidationError('Quantity must be greater than 0');
      }

      // Recalculate totals based on new quantity
      const modifierTotal = (item.modifiers || []).reduce(
        (sum, mod) => sum + mod.price_cents,
        0
      );
      const subtotal = (item.unit_price_cents + modifierTotal) * input.quantity;

      updates.quantity = input.quantity;
      updates.subtotal_cents = subtotal;
      updates.total_cents = subtotal - (item.discount_cents || 0);
    }

    if (input.notes !== undefined) {
      updates.notes = input.notes;
    }

    const result = await this.db.update<OrderItem>('order_items', itemId, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update order item: ${result.error || 'Unknown error'}`);
    }

    // Recalculate order totals
    await this.recalculateOrderTotals(item.order_id, accountId);

    return result.data;
  }

  /**
   * Remove item from order
   */
  async removeOrderItem(itemId: string, accountId: string): Promise<void> {
    const item = await this.getOrderItemById(itemId);
    const order = await this.getOrderById(item.order_id, accountId);

    if (!['draft', 'pending'].includes(order.status)) {
      throw new ConflictError('Cannot remove items from order that is already being processed');
    }

    await this.db.delete('order_items', itemId);

    // Recalculate order totals
    await this.recalculateOrderTotals(item.order_id, accountId);
  }

  /**
   * Get order item by ID
   */
  private async getOrderItemById(id: string): Promise<OrderItem> {
    const result = await this.db.selectOne<OrderItem>('order_items', id);

    if (result.error || !result.data) {
      throw new NotFoundError('OrderItem', id);
    }

    return result.data;
  }

  // ===========================================================================
  // ORDER CALCULATIONS
  // ===========================================================================

  /**
   * Recalculate order totals based on items
   */
  async recalculateOrderTotals(orderId: string, accountId: string): Promise<Order> {
    const items = await this.getOrderItems(orderId);
    const order = await this.getOrderById(orderId, accountId);

    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + item.subtotal_cents, 0);

    // Calculate discount (from discount_breakdown)
    const discountBreakdown = order.discount_breakdown || [];
    let discountCents = 0;

    for (const discount of discountBreakdown) {
      if (discount.applied_to === 'order') {
        // Recalculate order-level percent discounts based on current subtotal
        if (discount.type === 'percent') {
          discountCents += Math.round(subtotal * (discount.value / 100));
        } else {
          discountCents += discount.amount_cents;
        }
      } else if (discount.applied_to === 'item') {
        // Item discounts use pre-calculated amount_cents from applyDiscount
        discountCents += discount.amount_cents;
      }
    }

    // Calculate tax (simplified - in production, use tax_group_id from products)
    const taxableAmount = subtotal - discountCents;
    const taxCents = await this.calculateTax(taxableAmount, accountId);

    // Calculate total
    const total = subtotal - discountCents + taxCents + (order.tip_cents || 0);

    // Update order
    const result = await this.db.update<Order>('orders', orderId, {
      subtotal_cents: subtotal,
      discount_cents: discountCents,
      tax_cents: taxCents,
      total_cents: total
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to update order totals: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Calculate tax for an amount (simplified)
   */
  private async calculateTax(amountCents: number, accountId: string): Promise<number> {
    // Get default tax rules for account
    const taxResult = await this.db.select<TaxRule>('tax_rules', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'is_active', operator: '=' as const, value: true }
      ],
      limit: 10
    });

    if (taxResult.error || taxResult.data.length === 0) {
      return 0; // No tax rules configured
    }

    // Apply all active tax rules
    let totalTax = 0;
    for (const rule of taxResult.data) {
      if (!rule.is_inclusive) {
        // Additive tax
        totalTax += Math.round(amountCents * (rule.rate_percent / 100));
      }
    }

    return totalTax;
  }

  /**
   * Apply discount to order
   */
  async applyDiscount(input: ApplyDiscountInput, accountId: string): Promise<Order> {
    const order = await this.getOrderById(input.order_id, accountId);

    if (!['draft', 'pending'].includes(order.status)) {
      throw new ConflictError('Cannot apply discount to order that is already being processed');
    }

    const discountBreakdown = order.discount_breakdown || [];

    // Calculate discount amount
    let amountCents: number;
    if (input.type === 'percent') {
      if (input.value < 0 || input.value > 100) {
        throw new ValidationError('Discount percent must be between 0 and 100');
      }
      amountCents = Math.round(order.subtotal_cents * (input.value / 100));
    } else {
      amountCents = input.value;
    }

    // Add to breakdown
    discountBreakdown.push({
      type: input.type,
      name: input.name,
      value: input.value,
      amount_cents: amountCents,
      applied_to: input.applied_to,
      item_id: input.item_id
    });

    // Update order
    await this.db.update<Order>('orders', input.order_id, {
      discount_breakdown: discountBreakdown
    });

    // Recalculate totals
    return this.recalculateOrderTotals(input.order_id, accountId);
  }

  /**
   * Add tip to order (accumulates with existing tips)
   */
  async addTip(orderId: string, tipCents: number, accountId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (tipCents < 0) {
      throw new ValidationError('Tip cannot be negative');
    }

    const updatedTipCents = order.tip_cents + tipCents;
    const newTotal = order.subtotal_cents - order.discount_cents + order.tax_cents + updatedTipCents;

    const result = await this.db.update<Order>('orders', orderId, {
      tip_cents: updatedTipCents,
      total_cents: newTotal
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to add tip: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Set tip on order (replaces any existing tip)
   * Used during payment processing to avoid double-counting tips
   */
  async setTip(orderId: string, tipCents: number, accountId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (tipCents < 0) {
      throw new ValidationError('Tip cannot be negative');
    }

    const newTotal = order.subtotal_cents - order.discount_cents + order.tax_cents + tipCents;

    const result = await this.db.update<Order>('orders', orderId, {
      tip_cents: tipCents,
      total_cents: newTotal
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to set tip: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // ORDER STATUS TRANSITIONS
  // ===========================================================================

  /**
   * Submit order (draft -> pending)
   */
  async submitOrder(orderId: string, accountId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (order.status !== 'draft') {
      throw new ConflictError(`Cannot submit order with status: ${order.status}`);
    }

    const items = await this.getOrderItems(orderId);
    if (items.length === 0) {
      throw new ValidationError('Cannot submit order with no items');
    }

    const result = await this.db.update<Order>('orders', orderId, {
      status: 'pending'
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to submit order: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Send order to kitchen (pending -> preparing)
   */
  async sendToKitchen(orderId: string, accountId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (order.status !== 'pending') {
      throw new ConflictError(`Cannot send to kitchen order with status: ${order.status}`);
    }

    // Update all items to preparing status first to ensure consistency
    const items = await this.getOrderItems(orderId);
    const kitchenSentAt = nowISO();
    for (const item of items) {
      const itemResult = await this.db.update<OrderItem>('order_items', item.id, {
        kitchen_status: 'preparing',
        kitchen_sent_at: kitchenSentAt
      });
      if (itemResult.error) {
        throw new Error(`Failed to update item ${item.id} for kitchen: ${itemResult.error}`);
      }
    }

    // Update order status only after all items are updated
    const result = await this.db.update<Order>('orders', orderId, {
      status: 'preparing'
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to send to kitchen: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Mark order as ready (preparing -> ready)
   */
  async markReady(orderId: string, accountId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (order.status !== 'preparing') {
      throw new ConflictError(`Cannot mark ready order with status: ${order.status}`);
    }

    // Update all items to ready
    const items = await this.getOrderItems(orderId);
    for (const item of items) {
      await this.db.update<OrderItem>('order_items', item.id, {
        kitchen_status: 'ready'
      });
    }

    const result = await this.db.update<Order>('orders', orderId, {
      status: 'ready'
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to mark order ready: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Complete order (after payment)
   */
  async completeOrder(orderId: string, accountId: string, receiptNumber?: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (!['pending', 'ready'].includes(order.status)) {
      throw new ConflictError(`Cannot complete order with status: ${order.status}`);
    }

    // Generate receipt number if not provided
    const finalReceiptNumber = receiptNumber || this.generateReceiptNumber();

    // Update all items to served first to ensure consistency
    const items = await this.getOrderItems(orderId);
    for (const item of items) {
      const itemResult = await this.db.update<OrderItem>('order_items', item.id, {
        kitchen_status: 'served'
      });
      if (itemResult.error) {
        throw new Error(`Failed to update item ${item.id} to served: ${itemResult.error}`);
      }
    }

    // Update order status only after all items are updated
    const result = await this.db.update<Order>('orders', orderId, {
      status: 'completed',
      receipt_number: finalReceiptNumber,
      completed_at: nowISO()
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to complete order: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, accountId: string, reason?: string): Promise<Order> {
    const order = await this.getOrderById(orderId, accountId);

    if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
      throw new ConflictError(`Cannot cancel order with status: ${order.status}`);
    }

    // Cancel kitchen items first to ensure consistency
    const items = await this.getOrderItems(orderId);
    for (const item of items) {
      const itemResult = await this.db.update<OrderItem>('order_items', item.id, {
        kitchen_status: 'cancelled'
      });
      if (itemResult.error) {
        throw new Error(`Failed to cancel item ${item.id}: ${itemResult.error}`);
      }
    }

    // Update order status only after all items are cancelled
    const result = await this.db.update<Order>('orders', orderId, {
      status: 'cancelled',
      cancelled_at: nowISO(),
      notes: reason ? `${order.notes || ''}\nCancellation reason: ${reason}`.trim() : order.notes
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to cancel order: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Generate a receipt number (format: YYMMDD-XXXX)
   */
  private generateReceiptNumber(): string {
    const now = new Date();
    const dateStr = now
      .toISOString()
      .slice(2, 10)
      .replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${dateStr}-${random}`;
  }

  /**
   * Get order with all details (items, etc.)
   */
  async getOrderWithDetails(
    orderId: string,
    accountId: string
  ): Promise<{
    order: Order;
    items: OrderItem[];
  }> {
    const order = await this.getOrderById(orderId, accountId);
    const items = await this.getOrderItems(orderId);

    return { order, items };
  }
}
