import type { Currency } from '../../../config/env';
import {
  BasePaymentGateway,
  type PaymentRequest,
  type PaymentResult,
  type RefundRequest,
  type RefundResult,
  type PaymentGatewayType
} from './base.gateway';

// =============================================================================
// MOCK GATEWAY
// =============================================================================

/**
 * Mock payment gateway for testing and development
 * Simulates payment processing without actual transactions
 */
export class MockPaymentGateway extends BasePaymentGateway {
  readonly type: PaymentGatewayType = 'mock';
  readonly displayName = 'Mock Gateway (Testing)';
  readonly supportedCurrencies: Currency[] = ['TRY', 'EUR', 'USD'];

  // Simulation settings
  private simulateDelay = true;
  private delayMs = 500;
  private failureRate = 0; // 0-1, probability of simulated failure

  // Test card numbers
  private readonly TEST_CARDS = {
    success: ['4111111111111111', '5555555555554444', '378282246310005'],
    decline: ['4000000000000002'],
    insufficient_funds: ['4000000000009995'],
    expired: ['4000000000000069'],
    processing_error: ['4000000000000119']
  };

  /**
   * Configure simulation settings
   */
  configure(options: { simulateDelay?: boolean; delayMs?: number; failureRate?: number }): void {
    if (options.simulateDelay !== undefined) this.simulateDelay = options.simulateDelay;
    if (options.delayMs !== undefined) this.delayMs = options.delayMs;
    if (options.failureRate !== undefined) this.failureRate = options.failureRate;
  }

  isConfigured(): boolean {
    return true; // Mock gateway is always configured
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    this.validatePaymentRequest(request);

    if (this.simulateDelay) {
      await this.delay();
    }

    // Check for simulated failures
    const failure = this.checkForSimulatedFailure(request);
    if (failure) {
      return this.createPaymentResult(false, 'failed', request.amount_cents, request.currency, {
        error_code: failure.code,
        error_message: failure.message,
        gateway_response: { simulated: true, failure_type: failure.code }
      });
    }

    // Random failure based on failure rate
    if (Math.random() < this.failureRate) {
      return this.createPaymentResult(false, 'failed', request.amount_cents, request.currency, {
        error_code: 'RANDOM_FAILURE',
        error_message: 'Simulated random failure for testing',
        gateway_response: { simulated: true }
      });
    }

    // Success
    const cardLastFour = request.payment_method.card_number?.slice(-4) || '1234';
    const cardBrand = this.detectCardBrand(request.payment_method.card_number || '');

    return this.createPaymentResult(true, 'captured', request.amount_cents, request.currency, {
      gateway_transaction_id: `mock_pi_${Date.now()}`,
      card_brand: cardBrand,
      card_last_four: cardLastFour,
      authorization_code: `AUTH${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      gateway_response: {
        simulated: true,
        processor: 'mock',
        captured_at: new Date().toISOString()
      }
    });
  }

  async capturePayment(transactionId: string, amountCents?: number): Promise<PaymentResult> {
    if (this.simulateDelay) {
      await this.delay();
    }

    return this.createPaymentResult(true, 'captured', amountCents || 0, 'TRY', {
      transaction_id: transactionId,
      gateway_transaction_id: transactionId,
      gateway_response: { simulated: true, captured: true }
    });
  }

  async cancelPayment(transactionId: string): Promise<PaymentResult> {
    if (this.simulateDelay) {
      await this.delay();
    }

    return this.createPaymentResult(true, 'cancelled', 0, 'TRY', {
      transaction_id: transactionId,
      gateway_transaction_id: transactionId,
      gateway_response: { simulated: true, cancelled: true }
    });
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    if (this.simulateDelay) {
      await this.delay();
    }

    return this.createRefundResult(true, request.amount_cents, 'processed', {
      gateway_refund_id: `mock_re_${Date.now()}`,
      gateway_response: {
        simulated: true,
        original_payment: request.gateway_transaction_id,
        refunded_at: new Date().toISOString()
      }
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  private checkForSimulatedFailure(request: PaymentRequest): { code: string; message: string } | null {
    const cardNumber = request.payment_method.card_number;
    if (!cardNumber) return null;

    if (this.TEST_CARDS.decline.includes(cardNumber)) {
      return { code: 'CARD_DECLINED', message: 'Card was declined' };
    }
    if (this.TEST_CARDS.insufficient_funds.includes(cardNumber)) {
      return { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' };
    }
    if (this.TEST_CARDS.expired.includes(cardNumber)) {
      return { code: 'EXPIRED_CARD', message: 'Card has expired' };
    }
    if (this.TEST_CARDS.processing_error.includes(cardNumber)) {
      return { code: 'PROCESSING_ERROR', message: 'Processing error occurred' };
    }

    return null;
  }

  private detectCardBrand(cardNumber: string): string {
    if (cardNumber.startsWith('4')) return 'visa';
    if (cardNumber.startsWith('5')) return 'mastercard';
    if (cardNumber.startsWith('3')) return 'amex';
    if (cardNumber.startsWith('6')) return 'discover';
    return 'unknown';
  }

  // ===========================================================================
  // TEST HELPERS
  // ===========================================================================

  /**
   * Get test card numbers for different scenarios
   */
  getTestCards(): typeof this.TEST_CARDS {
    return this.TEST_CARDS;
  }

  /**
   * Force next payment to fail (for testing)
   */
  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Reset to default settings
   */
  reset(): void {
    this.simulateDelay = true;
    this.delayMs = 500;
    this.failureRate = 0;
  }
}
