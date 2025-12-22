import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerCustomerRoutes } from '../customers';

// Mock CustomerService - use vi.hoisted() to define before vi.mock() hoisting
const { mockCustomerService } = vi.hoisted(() => {
  const mock = {
    getCustomers: vi.fn(),
    getCustomerById: vi.fn(),
    searchCustomers: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    getLoyaltyAccount: vi.fn(),
    createLoyaltyAccount: vi.fn(),
    adjustLoyaltyPoints: vi.fn(),
    getLoyaltyTransactions: vi.fn()
  };
  return { mockCustomerService: mock };
});

vi.mock('../../../services/customers/customer.service', () => ({
  CustomerService: vi.fn(() => mockCustomerService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Customer Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerCustomerRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all customer routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/customers');
      expect(paths).toContain('GET /api/v1/customers/:id');
      expect(paths).toContain('POST /api/v1/customers');
      expect(paths).toContain('PUT /api/v1/customers/:id');
      expect(paths).toContain('POST /api/v1/customers/:id/loyalty');
      expect(paths).toContain('GET /api/v1/customers/:id/loyalty');
      expect(paths).toContain('POST /api/v1/customers/:id/loyalty/points');
      expect(paths).toContain('GET /api/v1/customers/:id/loyalty/transactions');
      expect(paths).toContain('POST /api/v1/customers/search');
    });
  });

  describe('GET /api/v1/customers', () => {
    it('should list customers with pagination', async () => {
      const mockCustomers = [
        { id: TEST_IDS.CUSTOMER_ID, name: 'John Doe', email: 'john@example.com' }
      ];
      mockCustomerService.getCustomers.mockResolvedValue(mockCustomers);

      const route = findRoute(router.routes, 'GET', '/api/v1/customers')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        url: '/api/v1/customers',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockCustomerService.getCustomers).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });

    it('should search customers when query provided', async () => {
      mockCustomerService.searchCustomers.mockResolvedValue([]);

      const route = findRoute(router.routes, 'GET', '/api/v1/customers')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { search: 'john' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockCustomerService.searchCustomers).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: TEST_IDS.ACCOUNT_ID,
          query: 'john'
        })
      );
    });
  });

  describe('GET /api/v1/customers/:id', () => {
    it('should return customer with loyalty account', async () => {
      const mockCustomer = { id: TEST_IDS.CUSTOMER_ID, name: 'John Doe' };
      const mockLoyalty = { id: 'loyalty-1', points_balance: 500 };
      mockCustomerService.getCustomerById.mockResolvedValue(mockCustomer);
      mockCustomerService.getLoyaltyAccount.mockResolvedValue(mockLoyalty);

      const route = findRoute(router.routes, 'GET', '/api/v1/customers/:id')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { id: TEST_IDS.CUSTOMER_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockCustomerService.getCustomerById).toHaveBeenCalledWith(
        TEST_IDS.CUSTOMER_ID,
        TEST_IDS.ACCOUNT_ID
      );
      expect(res.body).toEqual({
        success: true,
        data: expect.objectContaining({
          id: TEST_IDS.CUSTOMER_ID,
          loyalty_account: mockLoyalty
        }),
        meta: expect.any(Object)
      });
    });
  });

  describe('POST /api/v1/customers', () => {
    it('should create a new customer', async () => {
      const newCustomer = {
        id: TEST_IDS.CUSTOMER_ID,
        name: 'Jane Doe',
        email: 'jane@example.com'
      };
      mockCustomerService.createCustomer.mockResolvedValue(newCustomer);

      const route = findRoute(router.routes, 'POST', '/api/v1/customers')!;
      const req = createJsonRequest('POST', {
        name: 'Jane Doe',
        email: 'jane@example.com'
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          account_id: TEST_IDS.ACCOUNT_ID
        })
      );
    });
  });

  describe('PUT /api/v1/customers/:id', () => {
    it('should update customer', async () => {
      const updatedCustomer = { id: TEST_IDS.CUSTOMER_ID, name: 'Updated Name' };
      mockCustomerService.updateCustomer.mockResolvedValue(updatedCustomer);

      const route = findRoute(router.routes, 'PUT', '/api/v1/customers/:id')!;
      const req = createJsonRequest(
        'PUT',
        { name: 'Updated Name' },
        { params: { id: TEST_IDS.CUSTOMER_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockCustomerService.updateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TEST_IDS.CUSTOMER_ID,
          name: 'Updated Name'
        })
      );
    });
  });

  describe('Loyalty Routes', () => {
    describe('POST /api/v1/customers/:id/loyalty', () => {
      it('should create loyalty account', async () => {
        const loyaltyAccount = { id: 'loyalty-1', tier: 'gold' };
        mockCustomerService.createLoyaltyAccount.mockResolvedValue(loyaltyAccount);

        const route = findRoute(router.routes, 'POST', '/api/v1/customers/:id/loyalty')!;
        const req = createJsonRequest(
          'POST',
          { tier: 'gold' },
          { params: { id: TEST_IDS.CUSTOMER_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockCustomerService.createLoyaltyAccount).toHaveBeenCalledWith({
          account_id: TEST_IDS.ACCOUNT_ID,
          customer_id: TEST_IDS.CUSTOMER_ID,
          tier: 'gold'
        });
      });
    });

    describe('POST /api/v1/customers/:id/loyalty/points', () => {
      it('should adjust loyalty points', async () => {
        const loyaltyAccount = { id: 'loyalty-1', points_balance: 500 };
        const transaction = { id: 'trans-1', points: 100 };
        mockCustomerService.getLoyaltyAccount.mockResolvedValue(loyaltyAccount);
        mockCustomerService.adjustLoyaltyPoints.mockResolvedValue(transaction);

        const route = findRoute(router.routes, 'POST', '/api/v1/customers/:id/loyalty/points')!;
        const req = createJsonRequest(
          'POST',
          { transaction_type: 'earn', points: 100 },
          { params: { id: TEST_IDS.CUSTOMER_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockCustomerService.adjustLoyaltyPoints).toHaveBeenCalledWith({
          loyalty_account_id: 'loyalty-1',
          transaction_type: 'earn',
          points: 100
        });
      });

      it('should throw error if loyalty account not found', async () => {
        mockCustomerService.getLoyaltyAccount.mockResolvedValue(null);

        const route = findRoute(router.routes, 'POST', '/api/v1/customers/:id/loyalty/points')!;
        const req = createJsonRequest(
          'POST',
          { transaction_type: 'earn', points: 100 },
          { params: { id: TEST_IDS.CUSTOMER_ID } }
        );
        const res = createMockResponse();

        await expect(route.handler(req as any, res as any)).rejects.toThrow(
          'Loyalty account not found'
        );
      });
    });
  });

  describe('POST /api/v1/customers/search', () => {
    it('should search customers by criteria', async () => {
      const mockCustomers = [{ id: TEST_IDS.CUSTOMER_ID }];
      mockCustomerService.searchCustomers.mockResolvedValue(mockCustomers);

      const route = findRoute(router.routes, 'POST', '/api/v1/customers/search')!;
      const req = createJsonRequest('POST', {
        email: 'john@example.com'
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockCustomerService.searchCustomers).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        email: 'john@example.com'
      });
    });
  });
});
