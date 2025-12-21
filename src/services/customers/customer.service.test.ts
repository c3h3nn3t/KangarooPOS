import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CustomerService } from './customer.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { Customer, LoyaltyAccount, LoyaltyTransaction } from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';

const mockDb: DatabaseAdapter = {
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isOnline: true,
  setOnlineStatus: vi.fn()
} as unknown as DatabaseAdapter;

describe('CustomerService', () => {
  let service: CustomerService;
  const accountId = 'account-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CustomerService();
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('getCustomers', () => {
    it('should fetch customers for an account', async () => {
      const mockCustomers: Customer[] = [
        {
          id: 'customer-1',
          account_id: accountId,
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          total_spent_cents: 50000,
          visit_count: 10,
          tags: ['vip'],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockCustomers, error: null });

      const result = await service.getCustomers(accountId);

      expect(result).toEqual(mockCustomers);
      expect(mockDb.select).toHaveBeenCalledWith('customers', expect.objectContaining({
        where: expect.arrayContaining([
          { column: 'account_id', operator: '=', value: accountId }
        ])
      }));
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getCustomers(accountId)).rejects.toThrow('Failed to fetch customers');
    });
  });

  describe('getCustomerById', () => {
    it('should return customer when found', async () => {
      const mockCustomer: Customer = {
        id: 'customer-1',
        account_id: accountId,
        name: 'John Doe',
        email: 'john@example.com',
        total_spent_cents: 50000,
        visit_count: 10,
        tags: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockCustomer, error: null });

      const result = await service.getCustomerById('customer-1', accountId);

      expect(result).toEqual(mockCustomer);
    });

    it('should throw NotFoundError when customer not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getCustomerById('customer-1', accountId)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when customer belongs to different account', async () => {
      const mockCustomer: Customer = {
        id: 'customer-1',
        account_id: 'other-account',
        name: 'John Doe',
        total_spent_cents: 0,
        visit_count: 0,
        tags: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockCustomer, error: null });

      await expect(service.getCustomerById('customer-1', accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('createCustomer', () => {
    it('should create a new customer', async () => {
      const input = {
        account_id: accountId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1234567890'
      };

      mockDb.select.mockResolvedValue({ data: [], error: null }); // No existing customer
      mockDb.insert.mockResolvedValue({
        data: { id: 'customer-2', ...input, total_spent_cents: 0, visit_count: 0, tags: [] },
        error: null
      });

      const result = await service.createCustomer(input);

      expect(result.email).toBe('jane@example.com');
      expect(mockDb.insert).toHaveBeenCalledWith('customers', expect.objectContaining({
        account_id: accountId,
        email: 'jane@example.com'
      }));
    });

    it('should throw ValidationError for duplicate email', async () => {
      const existingCustomer = {
        id: 'customer-1',
        account_id: accountId,
        email: 'existing@example.com'
      };

      mockDb.select.mockResolvedValue({ data: [existingCustomer], error: null });

      await expect(
        service.createCustomer({
          account_id: accountId,
          email: 'existing@example.com'
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateCustomer', () => {
    it('should update customer', async () => {
      const existingCustomer: Customer = {
        id: 'customer-1',
        account_id: accountId,
        name: 'Old Name',
        email: 'old@example.com',
        total_spent_cents: 100,
        visit_count: 5,
        tags: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: existingCustomer, error: null });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No duplicate
      mockDb.update.mockResolvedValue({
        data: { ...existingCustomer, name: 'New Name' },
        error: null
      });

      const result = await service.updateCustomer({
        id: 'customer-1',
        account_id: accountId,
        name: 'New Name'
      });

      expect(result.name).toBe('New Name');
    });
  });

  describe('searchCustomers', () => {
    it('should search customers by query', async () => {
      const mockCustomers = [
        { id: 'customer-1', name: 'John Doe', account_id: accountId }
      ];

      mockDb.select.mockResolvedValue({ data: mockCustomers, error: null });

      const result = await service.searchCustomers({
        account_id: accountId,
        query: 'John'
      });

      expect(result).toHaveLength(1);
      expect(mockDb.select).toHaveBeenCalledWith('customers', expect.objectContaining({
        where: expect.arrayContaining([
          { column: 'name', operator: 'ilike', value: '%John%' }
        ])
      }));
    });

    it('should filter by tags', async () => {
      const mockCustomers = [
        { id: 'customer-1', name: 'VIP Customer', account_id: accountId, tags: ['vip'] },
        { id: 'customer-2', name: 'Regular', account_id: accountId, tags: [] }
      ];

      mockDb.select.mockResolvedValue({ data: mockCustomers, error: null });

      const result = await service.searchCustomers({
        account_id: accountId,
        tags: ['vip']
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('VIP Customer');
    });
  });

  describe('Loyalty Account', () => {
    describe('getLoyaltyAccount', () => {
      it('should return loyalty account for customer', async () => {
        const mockCustomer: Customer = {
          id: 'customer-1',
          account_id: accountId,
          total_spent_cents: 0,
          visit_count: 0,
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        const mockLoyalty: LoyaltyAccount = {
          id: 'loyalty-1',
          account_id: accountId,
          customer_id: 'customer-1',
          points_balance: 500,
          lifetime_points: 1000,
          tier: 'gold',
          enrolled_at: '2025-01-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockCustomer, error: null });
        mockDb.select.mockResolvedValue({ data: [mockLoyalty], error: null });

        const result = await service.getLoyaltyAccount('customer-1', accountId);

        expect(result).toEqual(mockLoyalty);
      });

      it('should return null if no loyalty account exists', async () => {
        const mockCustomer: Customer = {
          id: 'customer-1',
          account_id: accountId,
          total_spent_cents: 0,
          visit_count: 0,
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockCustomer, error: null });
        mockDb.select.mockResolvedValue({ data: [], error: null });

        const result = await service.getLoyaltyAccount('customer-1', accountId);

        expect(result).toBeNull();
      });
    });

    describe('createLoyaltyAccount', () => {
      it('should create loyalty account', async () => {
        const mockCustomer: Customer = {
          id: 'customer-1',
          account_id: accountId,
          total_spent_cents: 0,
          visit_count: 0,
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockCustomer, error: null });
        mockDb.select.mockResolvedValue({ data: [], error: null }); // No existing loyalty account
        mockDb.insert.mockResolvedValue({
          data: {
            id: 'loyalty-1',
            account_id: accountId,
            customer_id: 'customer-1',
            points_balance: 0,
            tier: 'standard'
          },
          error: null
        });

        const result = await service.createLoyaltyAccount({
          account_id: accountId,
          customer_id: 'customer-1'
        });

        expect(result.tier).toBe('standard');
      });

      it('should throw ValidationError if loyalty account already exists', async () => {
        const mockCustomer: Customer = {
          id: 'customer-1',
          account_id: accountId,
          total_spent_cents: 0,
          visit_count: 0,
          tags: [],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockCustomer, error: null });
        mockDb.select.mockResolvedValue({
          data: [{ id: 'loyalty-1', customer_id: 'customer-1' }],
          error: null
        });

        await expect(
          service.createLoyaltyAccount({
            account_id: accountId,
            customer_id: 'customer-1'
          })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('adjustLoyaltyPoints', () => {
      it('should earn points', async () => {
        const mockLoyalty: LoyaltyAccount = {
          id: 'loyalty-1',
          account_id: accountId,
          customer_id: 'customer-1',
          points_balance: 500,
          lifetime_points: 500,
          tier: 'standard',
          enrolled_at: '2025-01-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockLoyalty, error: null });
        mockDb.update.mockResolvedValue({
          data: { ...mockLoyalty, points_balance: 600, lifetime_points: 600 },
          error: null
        });
        mockDb.insert.mockResolvedValue({
          data: { id: 'tx-1', transaction_type: 'earn', points: 100 },
          error: null
        });

        const result = await service.adjustLoyaltyPoints({
          loyalty_account_id: 'loyalty-1',
          transaction_type: 'earn',
          points: 100
        });

        expect(result.loyaltyAccount.points_balance).toBe(600);
      });

      it('should throw ValidationError for insufficient points on redeem', async () => {
        const mockLoyalty: LoyaltyAccount = {
          id: 'loyalty-1',
          account_id: accountId,
          customer_id: 'customer-1',
          points_balance: 50,
          lifetime_points: 100,
          tier: 'standard',
          enrolled_at: '2025-01-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: mockLoyalty, error: null });

        await expect(
          service.adjustLoyaltyPoints({
            loyalty_account_id: 'loyalty-1',
            transaction_type: 'redeem',
            points: 100
          })
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  describe('calculatePointsEarned', () => {
    it('should calculate points from order total', () => {
      expect(service.calculatePointsEarned(5000)).toBe(50); // $50 = 50 points
      expect(service.calculatePointsEarned(1234)).toBe(12); // $12.34 = 12 points
    });

    it('should use custom points rate', () => {
      expect(service.calculatePointsEarned(5000, 2)).toBe(100); // $50 * 2 = 100 points
    });
  });

  describe('calculatePointsValue', () => {
    it('should calculate monetary value from points', () => {
      expect(service.calculatePointsValue(100)).toBe(100); // 100 points = $1.00 (100 cents)
      expect(service.calculatePointsValue(500)).toBe(500); // 500 points = $5.00
    });

    it('should use custom conversion rate', () => {
      expect(service.calculatePointsValue(100, 50)).toBe(200); // 100 points at 50pts/$1 = $2.00
    });
  });
});
