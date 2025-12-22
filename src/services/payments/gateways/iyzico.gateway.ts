import { config, type Currency } from '../../../config/env';
import {
  BasePaymentGateway,
  type PaymentRequest,
  type PaymentResult,
  type RefundRequest,
  type RefundResult,
  type PaymentGatewayType
} from './base.gateway';

// =============================================================================
// IYZICO GATEWAY (Turkey)
// =============================================================================

/**
 * iyzico payment gateway for Turkey
 * https://dev.iyzipay.com/
 *
 * Supports:
 * - Credit/Debit cards
 * - BKM Express
 * - Installments (taksit)
 * - 3D Secure
 */
export class IyzicoPaymentGateway extends BasePaymentGateway {
  readonly type: PaymentGatewayType = 'iyzico';
  readonly displayName = 'iyzico';
  readonly supportedCurrencies: Currency[] = ['TRY'];

  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    super();
    this.apiKey = config.payments.iyzico.apiKey || '';
    this.secretKey = config.payments.iyzico.secretKey || '';
    this.baseUrl = config.payments.iyzico.baseUrl;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey);
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    this.validatePaymentRequest(request);

    if (!this.isConfigured()) {
      return this.createPaymentResult(false, 'failed', request.amount_cents, request.currency, {
        error_code: 'NOT_CONFIGURED',
        error_message: 'iyzico gateway is not configured'
      });
    }

    try {
      // Build iyzico payment request
      const iyzicoRequest = this.buildPaymentRequest(request);

      // In production, this would make an actual API call to iyzico
      // For now, we simulate the response
      const response = await this.simulateIyzicoPayment(iyzicoRequest);

      if (response.status === 'success') {
        return this.createPaymentResult(true, 'captured', request.amount_cents, request.currency, {
          gateway_transaction_id: response.paymentId,
          card_brand: response.cardAssociation?.toLowerCase(),
          card_last_four: response.lastFourDigits,
          authorization_code: response.authCode,
          gateway_response: { ...response }
        });
      }

      return this.createPaymentResult(false, 'failed', request.amount_cents, request.currency, {
        error_code: response.errorCode || 'PAYMENT_FAILED',
        error_message: response.errorMessage || 'Payment failed',
        gateway_response: { ...response }
      });
    } catch (error) {
      return this.createPaymentResult(false, 'failed', request.amount_cents, request.currency, {
        error_code: 'GATEWAY_ERROR',
        error_message: error instanceof Error ? error.message : 'Gateway error occurred'
      });
    }
  }

  async capturePayment(transactionId: string, amountCents?: number): Promise<PaymentResult> {
    // iyzico typically auto-captures, but we implement this for auth-only flows
    if (!this.isConfigured()) {
      return this.createPaymentResult(false, 'failed', amountCents || 0, 'TRY', {
        error_code: 'NOT_CONFIGURED',
        error_message: 'iyzico gateway is not configured'
      });
    }

    // Simulate capture
    return this.createPaymentResult(true, 'captured', amountCents || 0, 'TRY', {
      transaction_id: transactionId,
      gateway_transaction_id: transactionId,
      gateway_response: { captured: true, capturedAt: new Date().toISOString() }
    });
  }

  async cancelPayment(transactionId: string): Promise<PaymentResult> {
    if (!this.isConfigured()) {
      return this.createPaymentResult(false, 'failed', 0, 'TRY', {
        error_code: 'NOT_CONFIGURED',
        error_message: 'iyzico gateway is not configured'
      });
    }

    try {
      // In production, call iyzico cancel API
      // POST /payment/cancel
      const response = await this.simulateIyzicoCancel(transactionId);

      if (response.status === 'success') {
        return this.createPaymentResult(true, 'cancelled', 0, 'TRY', {
          transaction_id: transactionId,
          gateway_transaction_id: transactionId,
          gateway_response: { ...response }
        });
      }

      return this.createPaymentResult(false, 'failed', 0, 'TRY', {
        error_code: response.errorCode || 'CANCEL_FAILED',
        error_message: response.errorMessage || 'Cancel failed',
        gateway_response: { ...response }
      });
    } catch (error) {
      return this.createPaymentResult(false, 'failed', 0, 'TRY', {
        error_code: 'GATEWAY_ERROR',
        error_message: error instanceof Error ? error.message : 'Gateway error occurred'
      });
    }
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    if (!this.isConfigured()) {
      return this.createRefundResult(false, request.amount_cents, 'failed', {
        error_code: 'NOT_CONFIGURED',
        error_message: 'iyzico gateway is not configured'
      });
    }

    try {
      // In production, call iyzico refund API
      // POST /payment/refund
      const response = await this.simulateIyzicoRefund(request);

      if (response.status === 'success') {
        return this.createRefundResult(true, request.amount_cents, 'processed', {
          gateway_refund_id: response.paymentTransactionId,
          gateway_response: { ...response }
        });
      }

      return this.createRefundResult(false, request.amount_cents, 'failed', {
        error_code: response.errorCode || 'REFUND_FAILED',
        error_message: response.errorMessage || 'Refund failed',
        gateway_response: { ...response }
      });
    } catch (error) {
      return this.createRefundResult(false, request.amount_cents, 'failed', {
        error_code: 'GATEWAY_ERROR',
        error_message: error instanceof Error ? error.message : 'Gateway error occurred'
      });
    }
  }

  // ===========================================================================
  // IYZICO-SPECIFIC METHODS
  // ===========================================================================

  /**
   * Get available installment options for a card BIN
   */
  async getInstallmentOptions(
    cardBin: string,
    amountCents: number
  ): Promise<InstallmentOption[]> {
    // In production, call iyzico installment inquiry API
    // POST /payment/iyzipos/installment

    // Simulate installment options
    return [
      { installmentCount: 1, totalAmount: amountCents, installmentAmount: amountCents },
      { installmentCount: 3, totalAmount: Math.round(amountCents * 1.05), installmentAmount: Math.round((amountCents * 1.05) / 3) },
      { installmentCount: 6, totalAmount: Math.round(amountCents * 1.1), installmentAmount: Math.round((amountCents * 1.1) / 6) },
      { installmentCount: 9, totalAmount: Math.round(amountCents * 1.15), installmentAmount: Math.round((amountCents * 1.15) / 9) },
      { installmentCount: 12, totalAmount: Math.round(amountCents * 1.2), installmentAmount: Math.round((amountCents * 1.2) / 12) }
    ];
  }

  /**
   * Create 3D Secure payment (for SCA compliance)
   */
  async create3DSecurePayment(
    request: PaymentRequest,
    callbackUrl: string
  ): Promise<{ htmlContent: string; paymentId: string }> {
    // In production, call iyzico 3D initialize API
    // POST /payment/3dsecure/initialize

    // Simulate 3D Secure redirect
    return {
      htmlContent: `<html><body>3D Secure Simulation - Redirect to bank</body></html>`,
      paymentId: this.generateTransactionId()
    };
  }

  /**
   * Complete 3D Secure payment after bank redirect
   */
  async complete3DSecurePayment(paymentId: string): Promise<PaymentResult> {
    // In production, call iyzico 3D auth API
    // POST /payment/3dsecure/auth

    return this.createPaymentResult(true, 'captured', 0, 'TRY', {
      gateway_transaction_id: paymentId,
      gateway_response: { threeDSecure: true, status: 'success' }
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private buildPaymentRequest(request: PaymentRequest): IyzicoPaymentRequest {
    const priceStr = (request.amount_cents / 100).toFixed(2);

    return {
      locale: 'tr',
      conversationId: request.idempotency_key || this.generateTransactionId(),
      price: priceStr,
      paidPrice: priceStr,
      currency: 'TRY',
      installment: 1,
      basketId: request.order_id,
      paymentChannel: 'WEB',
      paymentGroup: 'PRODUCT',
      paymentCard: {
        cardHolderName: request.payment_method.card_holder_name || '',
        cardNumber: request.payment_method.card_number || '',
        expireMonth: request.payment_method.card_expiry?.split('/')[0] || '',
        expireYear: '20' + (request.payment_method.card_expiry?.split('/')[1] || ''),
        cvc: request.payment_method.card_cvv || ''
      },
      buyer: {
        id: request.customer?.id || 'GUEST',
        name: request.customer?.name?.split(' ')[0] || 'Guest',
        surname: request.customer?.name?.split(' ').slice(1).join(' ') || 'User',
        email: request.customer?.email || 'guest@example.com',
        identityNumber: '11111111111', // TC Kimlik (required by iyzico)
        registrationAddress: request.customer?.billing_address?.line1 || 'N/A',
        city: request.customer?.billing_address?.city || 'Istanbul',
        country: 'Turkey',
        ip: request.customer?.ip_address || '127.0.0.1'
      },
      shippingAddress: {
        contactName: request.customer?.name || 'Guest',
        city: request.customer?.shipping_address?.city || 'Istanbul',
        country: 'Turkey',
        address: request.customer?.shipping_address?.line1 || 'N/A'
      },
      billingAddress: {
        contactName: request.customer?.name || 'Guest',
        city: request.customer?.billing_address?.city || 'Istanbul',
        country: 'Turkey',
        address: request.customer?.billing_address?.line1 || 'N/A'
      },
      basketItems: [
        {
          id: request.order_id,
          name: 'Order',
          category1: 'POS',
          itemType: 'PHYSICAL',
          price: priceStr
        }
      ]
    };
  }

  // Simulation methods (replace with actual API calls in production)
  private async simulateIyzicoPayment(request: IyzicoPaymentRequest): Promise<IyzicoPaymentResponse> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      status: 'success',
      locale: 'tr',
      systemTime: Date.now(),
      conversationId: request.conversationId,
      price: request.price,
      paidPrice: request.paidPrice,
      installment: request.installment,
      paymentId: `iyzico_${Date.now()}`,
      fraudStatus: 1,
      merchantCommissionRate: 0,
      merchantCommissionRateAmount: 0,
      iyziCommissionRateAmount: 0,
      iyziCommissionFee: 0,
      cardType: 'CREDIT_CARD',
      cardAssociation: 'VISA',
      cardFamily: 'Bonus',
      binNumber: request.paymentCard.cardNumber.substring(0, 6),
      lastFourDigits: request.paymentCard.cardNumber.slice(-4),
      authCode: Math.random().toString(36).substring(2, 8).toUpperCase()
    };
  }

  private async simulateIyzicoCancel(paymentId: string): Promise<IyzicoResponse> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 'success', paymentId };
  }

  private async simulateIyzicoRefund(request: RefundRequest): Promise<IyzicoResponse> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      status: 'success',
      paymentTransactionId: `refund_${Date.now()}`
    };
  }
}

// =============================================================================
// IYZICO TYPES
// =============================================================================

interface IyzicoPaymentRequest {
  locale: string;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: string;
  installment: number;
  basketId: string;
  paymentChannel: string;
  paymentGroup: string;
  paymentCard: {
    cardHolderName: string;
    cardNumber: string;
    expireMonth: string;
    expireYear: string;
    cvc: string;
  };
  buyer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    identityNumber: string;
    registrationAddress: string;
    city: string;
    country: string;
    ip: string;
  };
  shippingAddress: {
    contactName: string;
    city: string;
    country: string;
    address: string;
  };
  billingAddress: {
    contactName: string;
    city: string;
    country: string;
    address: string;
  };
  basketItems: Array<{
    id: string;
    name: string;
    category1: string;
    itemType: string;
    price: string;
  }>;
}

interface IyzicoPaymentResponse extends IyzicoResponse {
  price?: string;
  paidPrice?: string;
  installment?: number;
  paymentId?: string;
  fraudStatus?: number;
  merchantCommissionRate?: number;
  merchantCommissionRateAmount?: number;
  iyziCommissionRateAmount?: number;
  iyziCommissionFee?: number;
  cardType?: string;
  cardAssociation?: string;
  cardFamily?: string;
  binNumber?: string;
  lastFourDigits?: string;
  authCode?: string;
}

interface IyzicoResponse {
  status: string;
  errorCode?: string;
  errorMessage?: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  paymentId?: string;
  paymentTransactionId?: string;
}

interface InstallmentOption {
  installmentCount: number;
  totalAmount: number;
  installmentAmount: number;
}
