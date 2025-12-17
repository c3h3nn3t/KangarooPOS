import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { CustomerService } from '../../services/customers/customer.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import type { Customer } from '../../types/database';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const customerService = new CustomerService();

const createCustomerSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

const updateCustomerSchema = createCustomerSchema.partial().extend({
  id: z.string().uuid()
});

const querySchema = z.object({
  search: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  tags: z.array(z.string()).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const loyaltyPointsSchema = z.object({
  transaction_type: z.enum(['earn', 'redeem', 'adjust', 'expire']),
  points: z.number().int().positive(),
  reference_type: z.string().nullable().optional(),
  reference_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional()
});

/**
 * Register customer routes
 */
export function registerCustomerRoutes(router: Router): void {
  /**
   * GET /api/v1/customers
   * Get all customers for the authenticated account
   */
  router.get(
    '/api/v1/customers',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      let customers: Customer[];

      if (query.search || query.email || query.phone || query.tags) {
        customers = await customerService.searchCustomers({
          account_id: accountId,
          query: query.search,
          email: query.email,
          phone: query.phone,
          tags: query.tags
        });
      } else {
        customers = await customerService.getCustomers(accountId, {
          limit: query.limit,
          offset: (query.page - 1) * query.limit
        });
      }

      paginatedResponse(res, customers, customers.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/customers/:id
   * Get a single customer by ID
   */
  router.get(
    '/api/v1/customers/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const customerId = req.params.id;

      const customer = await customerService.getCustomerById(customerId, accountId);

      // Get loyalty account if exists
      const loyaltyAccount = await customerService.getLoyaltyAccount(customerId, accountId);

      successResponse(
        res,
        {
          ...customer,
          loyalty_account: loyaltyAccount
        },
        200,
        { requestId: req.requestId }
      );
    },
    [authenticate(), validateParams(z.object({ id: z.string().uuid() }))]
  );

  /**
   * POST /api/v1/customers
   * Create a new customer
   */
  router.post(
    '/api/v1/customers',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createCustomerSchema.parse(req.body);

      const customer = await customerService.createCustomer({
        ...input,
        account_id: accountId
      });

      successResponse(res, customer, 201, { requestId: req.requestId });
    },
    [authenticate(), validateBody(createCustomerSchema)]
  );

  /**
   * PUT /api/v1/customers/:id
   * Update a customer
   */
  router.put(
    '/api/v1/customers/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const customerId = req.params.id;
      const bodyInput = createCustomerSchema.partial().parse(req.body);
      const input = { ...bodyInput, id: customerId, account_id: accountId };

      const customer = await customerService.updateCustomer(input);

      successResponse(res, customer, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(createCustomerSchema.partial())
    ]
  );

  /**
   * POST /api/v1/customers/:id/loyalty
   * Create loyalty account for customer
   */
  router.post(
    '/api/v1/customers/:id/loyalty',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const customerId = req.params.id;
      const body = z
        .object({
          tier: z.string().default('standard')
        })
        .parse(req.body);

      const loyaltyAccount = await customerService.createLoyaltyAccount({
        account_id: accountId,
        customer_id: customerId,
        tier: body.tier
      });

      successResponse(res, loyaltyAccount, 201, { requestId: req.requestId });
    },
    [
      authenticate(),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(z.object({ tier: z.string().default('standard') }))
    ]
  );

  /**
   * GET /api/v1/customers/:id/loyalty
   * Get loyalty account for customer
   */
  router.get(
    '/api/v1/customers/:id/loyalty',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const customerId = req.params.id;

      const loyaltyAccount = await customerService.getLoyaltyAccount(customerId, accountId);

      if (!loyaltyAccount) {
        throw new Error('Loyalty account not found');
      }

      successResponse(res, loyaltyAccount, 200, { requestId: req.requestId });
    },
    [authenticate(), validateParams(z.object({ id: z.string().uuid() }))]
  );

  /**
   * POST /api/v1/customers/:id/loyalty/points
   * Adjust loyalty points (earn, redeem, adjust, expire)
   */
  router.post(
    '/api/v1/customers/:id/loyalty/points',
    async (req: ApiRequest, res: ApiResponse) => {
      const customerId = req.params.id;
      const accountId = req.accountId!;
      const input = loyaltyPointsSchema.parse(req.body);

      // Get loyalty account
      const loyaltyAccount = await customerService.getLoyaltyAccount(customerId, accountId);
      if (!loyaltyAccount) {
        throw new Error('Loyalty account not found');
      }

      const result = await customerService.adjustLoyaltyPoints({
        ...input,
        loyalty_account_id: loyaltyAccount.id
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'cashier'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(loyaltyPointsSchema)
    ]
  );

  /**
   * GET /api/v1/customers/:id/loyalty/transactions
   * Get loyalty transaction history
   */
  router.get(
    '/api/v1/customers/:id/loyalty/transactions',
    async (req: ApiRequest, res: ApiResponse) => {
      const customerId = req.params.id;
      const accountId = req.accountId!;
      const query = z
        .object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20)
        })
        .parse(req.query || {});

      // Get loyalty account
      const loyaltyAccount = await customerService.getLoyaltyAccount(customerId, accountId);
      if (!loyaltyAccount) {
        throw new Error('Loyalty account not found');
      }

      const transactions = await customerService.getLoyaltyTransactions(loyaltyAccount.id, {
        limit: query.limit,
        offset: (query.page - 1) * query.limit
      });

      paginatedResponse(res, transactions, transactions.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate(), validateParams(z.object({ id: z.string().uuid() }))]
  );

  /**
   * POST /api/v1/customers/search
   * Search customers by email, phone, or name
   */
  router.post(
    '/api/v1/customers/search',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const body = z
        .object({
          query: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          tags: z.array(z.string()).optional()
        })
        .parse(req.body);

      const customers = await customerService.searchCustomers({
        account_id: accountId,
        ...body
      });

      successResponse(res, customers, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      validateBody(
        z.object({
          query: z.string().optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          tags: z.array(z.string()).optional()
        })
      )
    ]
  );
}
