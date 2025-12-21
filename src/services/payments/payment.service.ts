import type { SelectOptions } from '../../db/types';
import type {
  Payment,
  PaymentStatus,
  PaymentType,
  Refund,
  RefundStatus,
  RefundType,
  RefundItem,
  Order
} from '../../types/database';
import { NotFoundError, ValidationError, ConflictError, OfflineOperationError } from '../../utils/errors';
import { nowISO } from '../../utils/datetime';
import { config } from '../../config/env';
import { BaseService } from '../base.service';
import { OrderService } from '../orders/order.service';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface ProcessPaymentInput {
  order_id: string;
  account_id: string;
  payment_type_id?: string | null;
  amount_cents: number;
  tip_cents?: number;
  currency?: string;
  reference?: string | null;
  notes?: string | null;
  // Card payment fields (if applicable)
  gateway_transaction_id?: string | null;
  gateway_response?: Record<string, unknown> | null;
  card_brand?: string | null;
  card_last_four?: string | null;
}

export interface CreateRefundInput {
  order_id: string;
  account_id: string;
  payment_id?: string | null;
  employee_id?: string | null;
  refund_type: RefundType;
  amount_cents: number;
  reason?: string | null;
  notes?: string | null;
  items?: RefundItem[];
  is_offline?: boolean;
}

export interface PaymentSearchInput {
  account_id: string;
  order_id?: string;
  status?: PaymentStatus | PaymentStatus[];
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface RefundSearchInput {
  account_id: string;
  order_id?: string;
  status?: RefundStatus | RefundStatus[];
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// SERVICE
// =============================================================================

export class PaymentService extends BaseService {
  private orderService: OrderService;

  constructor() {
    super();
    this.orderService = new OrderService();
  }

  // ===========================================================================
  // PAYMENTS
  // ===========================================================================

  /**
   * Get payments for an account
   */
  async getPayments(accountId: string, options?: SelectOptions): Promise<Payment[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Payment>('payments', {
      ...options,
      where,
      orderBy: options?.orderBy || [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch payments: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Search payments with filters
   */
  async searchPayments(input: PaymentSearchInput): Promise<Payment[]> {
    const where: Array<{ column: string; operator: '=' | '>=' | '<=' | 'in'; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.order_id) {
      where.push({ column: 'order_id', operator: '=' as const, value: input.order_id });
    }

    if (input.status) {
      if (Array.isArray(input.status)) {
        where.push({ column: 'status', operator: 'in' as const, value: input.status });
      } else {
        where.push({ column: 'status', operator: '=' as const, value: input.status });
      }
    }

    if (input.from_date) {
      where.push({ column: 'created_at', operator: '>=' as const, value: input.from_date });
    }

    if (input.to_date) {
      where.push({ column: 'created_at', operator: '<=' as const, value: input.to_date });
    }

    const result = await this.db.select<Payment>('payments', {
      where,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      ...(input.limit !== undefined && { limit: input.limit }),
      ...(input.offset !== undefined && { offset: input.offset })
    });

    if (result.error) {
      throw new Error(`Failed to search payments: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get a single payment by ID
   */
  async getPaymentById(id: string, accountId: string): Promise<Payment> {
    const result = await this.db.selectOne<Payment>('payments', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Payment', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Payment', id);
    }

    return result.data;
  }

  /**
   * Get payments for an order
   */
  async getPaymentsForOrder(orderId: string, accountId: string): Promise<Payment[]> {
    // Verify order belongs to account
    await this.orderService.getOrderById(orderId, accountId);

    const result = await this.db.select<Payment>('payments', {
      where: [{ column: 'order_id', operator: '=' as const, value: orderId }],
      orderBy: [{ column: 'created_at', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch payments: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Process a payment for an order
   */
  async processPayment(input: ProcessPaymentInput): Promise<Payment> {
    // Get the order
    const order = await this.orderService.getOrderById(input.order_id, input.account_id);

    // Validate order status
    if (!['pending', 'ready'].includes(order.status)) {
      throw new ConflictError(`Cannot process payment for order with status: ${order.status}`);
    }

    // Validate amount
    if (input.amount_cents <= 0) {
      throw new ValidationError('Payment amount must be greater than 0');
    }

    // Get existing payments (tips are separate from order settlement, only count amount_cents)
    const existingPayments = await this.getPaymentsForOrder(input.order_id, input.account_id);
    const paidAmount = existingPayments
      .filter((p) => p.status === 'captured')
      .reduce((sum, p) => sum + p.amount_cents, 0);

    const remainingAmount = order.total_cents - paidAmount;

    // Check if payment exceeds remaining amount (allow small overpayment for cash rounding)
    if (input.amount_cents > remainingAmount + 100) {
      // Allow 100 cents overpayment
      throw new ValidationError(
        `Payment amount ${input.amount_cents} exceeds remaining balance ${remainingAmount}`
      );
    }

    // Update order tip if provided (use setTip to replace, not accumulate)
    // This prevents double-counting if tip was already added via /orders/:id/tip endpoint
    if (input.tip_cents && input.tip_cents > 0) {
      await this.orderService.setTip(input.order_id, input.tip_cents, input.account_id);
    }

    // Create the payment
    const payment: Partial<Payment> = {
      account_id: input.account_id,
      order_id: input.order_id,
      payment_type_id: input.payment_type_id || null,
      amount_cents: input.amount_cents,
      tip_cents: input.tip_cents || 0,
      currency: input.currency || 'USD',
      status: 'captured', // Immediate capture for POS
      gateway_transaction_id: input.gateway_transaction_id || null,
      gateway_response: input.gateway_response || null,
      card_brand: input.card_brand || null,
      card_last_four: input.card_last_four || null,
      reference: input.reference || null,
      notes: input.notes || null,
      processed_at: nowISO()
    };

    const result = await this.db.insert<Payment>('payments', payment);

    if (result.error || !result.data) {
      throw new Error(`Failed to process payment: ${result.error || 'Unknown error'}`);
    }

    // Check if order is fully paid and complete it
    // Include tip_cents since the customer pays amount_cents + tip_cents total,
    // and addTip() increased order.total_cents by tip_cents
    const newPaidAmount = paidAmount + input.amount_cents + (input.tip_cents || 0);
    const updatedOrder = await this.orderService.getOrderById(input.order_id, input.account_id);

    if (newPaidAmount >= updatedOrder.total_cents) {
      await this.orderService.completeOrder(input.order_id, input.account_id);
    }

    return result.data;
  }

  /**
   * Void a payment (before settlement)
   */
  async voidPayment(paymentId: string, accountId: string, reason?: string): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId, accountId);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw new ConflictError(`Cannot void payment with status: ${payment.status}`);
    }

    // In production, you would call the payment gateway to void the transaction
    // For now, we just update the status

    const result = await this.db.update<Payment>('payments', paymentId, {
      status: 'cancelled',
      notes: reason ? `${payment.notes || ''}\nVoid reason: ${reason}`.trim() : payment.notes
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to void payment: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // REFUNDS
  // ===========================================================================

  /**
   * Get refunds for an account
   */
  async getRefunds(accountId: string, options?: SelectOptions): Promise<Refund[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Refund>('refunds', {
      ...options,
      where,
      orderBy: options?.orderBy || [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch refunds: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Search refunds with filters
   */
  async searchRefunds(input: RefundSearchInput): Promise<Refund[]> {
    const where: Array<{ column: string; operator: '=' | '>=' | '<=' | 'in'; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.order_id) {
      where.push({ column: 'order_id', operator: '=' as const, value: input.order_id });
    }

    if (input.status) {
      if (Array.isArray(input.status)) {
        where.push({ column: 'status', operator: 'in' as const, value: input.status });
      } else {
        where.push({ column: 'status', operator: '=' as const, value: input.status });
      }
    }

    if (input.from_date) {
      where.push({ column: 'created_at', operator: '>=' as const, value: input.from_date });
    }

    if (input.to_date) {
      where.push({ column: 'created_at', operator: '<=' as const, value: input.to_date });
    }

    const result = await this.db.select<Refund>('refunds', {
      where,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      ...(input.limit !== undefined && { limit: input.limit }),
      ...(input.offset !== undefined && { offset: input.offset })
    });

    if (result.error) {
      throw new Error(`Failed to search refunds: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get a single refund by ID
   */
  async getRefundById(id: string, accountId: string): Promise<Refund> {
    const result = await this.db.selectOne<Refund>('refunds', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Refund', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Refund', id);
    }

    return result.data;
  }

  /**
   * Get refunds for an order
   */
  async getRefundsForOrder(orderId: string, accountId: string): Promise<Refund[]> {
    // Verify order belongs to account
    await this.orderService.getOrderById(orderId, accountId);

    const result = await this.db.select<Refund>('refunds', {
      where: [{ column: 'order_id', operator: '=' as const, value: orderId }],
      orderBy: [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch refunds: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Create a refund
   */
  async createRefund(input: CreateRefundInput): Promise<Refund> {
    // Check offline refund permission
    if (input.is_offline && !config.features.offlineRefundsEnabled) {
      throw new OfflineOperationError('refund');
    }

    // Get the order
    const order = await this.orderService.getOrderById(input.order_id, input.account_id);

    // Validate order status
    if (!['completed', 'refunded'].includes(order.status)) {
      throw new ConflictError(`Cannot refund order with status: ${order.status}`);
    }

    // Get existing refunds
    const existingRefunds = await this.getRefundsForOrder(input.order_id, input.account_id);
    const refundedAmount = existingRefunds
      .filter((r) => r.status === 'processed')
      .reduce((sum, r) => sum + r.amount_cents, 0);

    // Validate amount
    const maxRefundable = order.total_cents - refundedAmount;
    if (input.amount_cents > maxRefundable) {
      throw new ValidationError(
        `Refund amount ${input.amount_cents} exceeds refundable amount ${maxRefundable}`
      );
    }

    if (input.amount_cents <= 0) {
      throw new ValidationError('Refund amount must be greater than 0');
    }

    // Create the refund
    const refund: Partial<Refund> = {
      account_id: input.account_id,
      order_id: input.order_id,
      payment_id: input.payment_id || null,
      employee_id: input.employee_id || null,
      refund_type: input.refund_type,
      amount_cents: input.amount_cents,
      currency: 'USD',
      status: 'pending', // Requires approval for non-manager
      reason: input.reason || null,
      notes: input.notes || null,
      items: input.items || [],
      is_offline: input.is_offline ?? false
    };

    const result = await this.db.insert<Refund>('refunds', refund);

    if (result.error || !result.data) {
      throw new Error(`Failed to create refund: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Approve a refund
   */
  async approveRefund(
    refundId: string,
    accountId: string,
    approvedById: string
  ): Promise<Refund> {
    const refund = await this.getRefundById(refundId, accountId);

    if (refund.status !== 'pending') {
      throw new ConflictError(`Cannot approve refund with status: ${refund.status}`);
    }

    const result = await this.db.update<Refund>('refunds', refundId, {
      status: 'approved',
      approved_by: approvedById,
      approved_at: nowISO()
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to approve refund: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Process a refund (execute the actual refund)
   */
  async processRefund(refundId: string, accountId: string): Promise<Refund> {
    const refund = await this.getRefundById(refundId, accountId);

    if (refund.status !== 'approved') {
      throw new ConflictError(`Cannot process refund with status: ${refund.status}`);
    }

    // In production, you would:
    // 1. Call payment gateway to process refund
    // 2. Update inventory if items returned
    // For now, we just update the status

    const result = await this.db.update<Refund>('refunds', refundId, {
      status: 'processed',
      processed_at: nowISO()
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to process refund: ${result.error || 'Unknown error'}`);
    }

    // Check if full refund and update order status
    const order = await this.orderService.getOrderById(refund.order_id, accountId);
    const allRefunds = await this.getRefundsForOrder(refund.order_id, accountId);
    const totalRefunded = allRefunds
      .filter((r) => r.status === 'processed')
      .reduce((sum, r) => sum + r.amount_cents, 0);

    if (totalRefunded >= order.total_cents) {
      await this.db.update<Order>('orders', refund.order_id, { status: 'refunded' });
    }

    return result.data;
  }

  /**
   * Cancel a pending refund
   */
  async cancelRefund(refundId: string, accountId: string, reason?: string): Promise<Refund> {
    const refund = await this.getRefundById(refundId, accountId);

    if (!['pending', 'approved'].includes(refund.status)) {
      throw new ConflictError(`Cannot cancel refund with status: ${refund.status}`);
    }

    const result = await this.db.update<Refund>('refunds', refundId, {
      status: 'cancelled',
      notes: reason ? `${refund.notes || ''}\nCancellation reason: ${reason}`.trim() : refund.notes
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to cancel refund: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Calculate total paid for an order
   */
  async getTotalPaid(orderId: string, accountId: string): Promise<number> {
    const payments = await this.getPaymentsForOrder(orderId, accountId);
    return payments
      .filter((p) => p.status === 'captured')
      .reduce((sum, p) => sum + p.amount_cents, 0);
  }

  /**
   * Calculate remaining balance for an order
   */
  async getRemainingBalance(orderId: string, accountId: string): Promise<number> {
    const order = await this.orderService.getOrderById(orderId, accountId);
    const paid = await this.getTotalPaid(orderId, accountId);
    return Math.max(0, order.total_cents - paid);
  }

  /**
   * Check if order is fully paid
   */
  async isOrderFullyPaid(orderId: string, accountId: string): Promise<boolean> {
    const remaining = await this.getRemainingBalance(orderId, accountId);
    return remaining === 0;
  }
}
