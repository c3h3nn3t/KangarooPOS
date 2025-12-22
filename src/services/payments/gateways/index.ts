export * from './base.gateway';
export * from './mock.gateway';
export * from './iyzico.gateway';

import type { PaymentGatewayType } from './base.gateway';
import { MockPaymentGateway } from './mock.gateway';
import { IyzicoPaymentGateway } from './iyzico.gateway';

/**
 * Factory function to create payment gateway instances
 */
export function createPaymentGateway(type: PaymentGatewayType) {
  switch (type) {
    case 'mock':
      return new MockPaymentGateway();
    case 'iyzico':
      return new IyzicoPaymentGateway();
    case 'stripe':
      // TODO: Implement Stripe gateway
      throw new Error('Stripe gateway not yet implemented');
    case 'square':
      // TODO: Implement Square gateway
      throw new Error('Square gateway not yet implemented');
    case 'sumup':
      // TODO: Implement SumUp gateway
      throw new Error('SumUp gateway not yet implemented');
    case 'eftpos':
      // TODO: Implement EFT-POS gateway
      throw new Error('EFT-POS gateway not yet implemented');
    default:
      throw new Error(`Unknown payment gateway type: ${type}`);
  }
}

/**
 * Get all available payment gateways
 */
export function getAvailableGateways(): PaymentGatewayType[] {
  return ['mock', 'iyzico'];
}
