import type { Currency } from '../../../config/env';

// =============================================================================
// TYPES
// =============================================================================

export type PaymentGatewayType = 'mock' | 'iyzico' | 'stripe' | 'square' | 'sumup' | 'eftpos';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded';

export interface PaymentRequest {
  order_id: string;
  amount_cents: number;
  currency: Currency;
  payment_method: PaymentMethod;
  customer?: CustomerInfo;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface PaymentMethod {
  type: 'card' | 'cash' | 'wallet' | 'bank_transfer';
  // Card-specific
  card_number?: string;
  card_expiry?: string;
  card_cvv?: string;
  card_holder_name?: string;
  card_token?: string; // For tokenized cards
  // Terminal-specific
  terminal_id?: string;
  // Wallet-specific
  wallet_type?: 'apple_pay' | 'google_pay' | 'samsung_pay';
  wallet_token?: string;
}

export interface CustomerInfo {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  ip_address?: string;
  billing_address?: Address;
  shipping_address?: Address;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
}

export interface PaymentResult {
  success: boolean;
  transaction_id: string;
  gateway_transaction_id?: string;
  status: PaymentStatus;
  amount_cents: number;
  currency: Currency;
  card_brand?: string;
  card_last_four?: string;
  authorization_code?: string;
  error_code?: string;
  error_message?: string;
  gateway_response?: Record<string, unknown>;
  requires_action?: boolean;
  action_url?: string;
  created_at: string;
}

export interface RefundRequest {
  payment_id: string;
  gateway_transaction_id: string;
  amount_cents: number;
  currency: Currency;
  reason?: string;
  idempotency_key?: string;
}

export interface RefundResult {
  success: boolean;
  refund_id: string;
  gateway_refund_id?: string;
  amount_cents: number;
  status: 'pending' | 'processed' | 'failed';
  error_code?: string;
  error_message?: string;
  gateway_response?: Record<string, unknown>;
  created_at: string;
}

export interface TerminalReaderStatus {
  id: string;
  label: string;
  status: 'online' | 'offline' | 'busy';
  last_seen_at?: string;
  battery_level?: number;
}

// =============================================================================
// BASE GATEWAY
// =============================================================================

/**
 * Abstract base class for payment gateways
 * All gateway implementations should extend this class
 */
export abstract class BasePaymentGateway {
  abstract readonly type: PaymentGatewayType;
  abstract readonly displayName: string;
  abstract readonly supportedCurrencies: Currency[];

  /**
   * Check if the gateway is properly configured
   */
  abstract isConfigured(): boolean;

  /**
   * Process a payment
   */
  abstract processPayment(request: PaymentRequest): Promise<PaymentResult>;

  /**
   * Capture an authorized payment
   */
  abstract capturePayment(transactionId: string, amountCents?: number): Promise<PaymentResult>;

  /**
   * Cancel/void an authorized payment
   */
  abstract cancelPayment(transactionId: string): Promise<PaymentResult>;

  /**
   * Process a refund
   */
  abstract processRefund(request: RefundRequest): Promise<RefundResult>;

  /**
   * Check if currency is supported
   */
  supportsCurrency(currency: Currency): boolean {
    return this.supportedCurrencies.includes(currency);
  }

  /**
   * Generate a unique transaction ID
   */
  protected generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${this.type}_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Create a standard payment result
   */
  protected createPaymentResult(
    success: boolean,
    status: PaymentStatus,
    amountCents: number,
    currency: Currency,
    options?: Partial<PaymentResult>
  ): PaymentResult {
    return {
      success,
      transaction_id: options?.transaction_id || this.generateTransactionId(),
      gateway_transaction_id: options?.gateway_transaction_id,
      status,
      amount_cents: amountCents,
      currency,
      card_brand: options?.card_brand,
      card_last_four: options?.card_last_four,
      authorization_code: options?.authorization_code,
      error_code: options?.error_code,
      error_message: options?.error_message,
      gateway_response: options?.gateway_response,
      requires_action: options?.requires_action,
      action_url: options?.action_url,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Create a standard refund result
   */
  protected createRefundResult(
    success: boolean,
    amountCents: number,
    status: 'pending' | 'processed' | 'failed',
    options?: Partial<RefundResult>
  ): RefundResult {
    return {
      success,
      refund_id: options?.refund_id || this.generateTransactionId(),
      gateway_refund_id: options?.gateway_refund_id,
      amount_cents: amountCents,
      status,
      error_code: options?.error_code,
      error_message: options?.error_message,
      gateway_response: options?.gateway_response,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Validate payment request
   */
  protected validatePaymentRequest(request: PaymentRequest): void {
    if (!request.order_id) {
      throw new Error('Order ID is required');
    }
    if (request.amount_cents <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    if (!this.supportsCurrency(request.currency)) {
      throw new Error(`Currency ${request.currency} is not supported by ${this.displayName}`);
    }
  }
}

// =============================================================================
// TERMINAL GATEWAY (for card readers)
// =============================================================================

/**
 * Extended base class for gateways that support terminal readers
 */
export abstract class TerminalPaymentGateway extends BasePaymentGateway {
  /**
   * List available terminal readers
   */
  abstract listReaders(locationId?: string): Promise<TerminalReaderStatus[]>;

  /**
   * Get a specific reader status
   */
  abstract getReaderStatus(readerId: string): Promise<TerminalReaderStatus>;

  /**
   * Create a payment intent for terminal
   */
  abstract createTerminalPayment(
    request: PaymentRequest,
    readerId: string
  ): Promise<PaymentResult>;

  /**
   * Cancel an in-progress terminal payment
   */
  abstract cancelTerminalPayment(paymentIntentId: string): Promise<void>;
}
