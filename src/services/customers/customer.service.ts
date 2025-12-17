import type { SelectOptions } from '../../db/types';
import type {
  Customer,
  LoyaltyAccount,
  LoyaltyTransaction,
  LoyaltyTransactionType
} from '../../types/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BaseService } from '../base.service';
import { nowISO } from '../../utils/datetime';

export interface CreateCustomerInput {
  account_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {
  id: string;
}

export interface SearchCustomersInput {
  account_id: string;
  query?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

export interface CreateLoyaltyAccountInput {
  account_id: string;
  customer_id: string;
  tier?: string;
}

export interface LoyaltyPointsInput {
  loyalty_account_id: string;
  transaction_type: LoyaltyTransactionType;
  points: number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
}

export class CustomerService extends BaseService {
  /**
   * Get customers for an account
   */
  async getCustomers(accountId: string, options?: SelectOptions): Promise<Customer[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Customer>('customers', {
      ...options,
      where,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch customers: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get a single customer by ID
   */
  async getCustomerById(id: string, accountId: string): Promise<Customer> {
    const result = await this.db.selectOne<Customer>('customers', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Customer not found');
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Customer not found');
    }

    return result.data;
  }

  /**
   * Search customers by name, email, or phone
   */
  async searchCustomers(input: SearchCustomersInput): Promise<Customer[]> {
    const where: Array<{
      column: string;
      operator: '=' | 'ilike';
      value: unknown;
    }> = [{ column: 'account_id', operator: '=' as const, value: input.account_id }];

    if (input.query) {
      // Search in name, email, or phone
      const searchTerm = `%${input.query}%`;
      // Note: This is simplified - in production, use full-text search or separate queries
      where.push({ column: 'name', operator: 'ilike' as const, value: searchTerm });
    }

    if (input.email) {
      where.push({ column: 'email', operator: '=' as const, value: input.email });
    }

    if (input.phone) {
      where.push({ column: 'phone', operator: '=' as const, value: input.phone });
    }

    const result = await this.db.select<Customer>('customers', {
      where,
      limit: 50
    });

    if (result.error) {
      throw new Error(`Failed to search customers: ${result.error}`);
    }

    // Filter by tags if provided
    if (input.tags && input.tags.length > 0) {
      return result.data.filter((customer) =>
        input.tags!.some((tag) => customer.tags?.includes(tag))
      );
    }

    return result.data;
  }

  /**
   * Find customer by email or phone
   */
  async findCustomerByEmailOrPhone(
    accountId: string,
    email?: string,
    phone?: string
  ): Promise<Customer | null> {
    if (!email && !phone) {
      return null;
    }

    const where: Array<{
      column: string;
      operator: '=';
      value: unknown;
    }> = [{ column: 'account_id', operator: '=' as const, value: accountId }];

    if (email) {
      where.push({ column: 'email', operator: '=' as const, value: email });
    }

    if (phone) {
      where.push({ column: 'phone', operator: '=' as const, value: phone });
    }

    const result = await this.db.select<Customer>('customers', {
      where,
      limit: 1
    });

    if (result.error || !result.data || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Create a new customer
   */
  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    // Check for duplicate email or phone
    if (input.email || input.phone) {
      const existing = await this.findCustomerByEmailOrPhone(
        input.account_id,
        input.email || undefined,
        input.phone || undefined
      );

      if (existing) {
        throw new ValidationError('Customer with this email or phone already exists');
      }
    }

    const customer: Partial<Customer> = {
      account_id: input.account_id,
      name: input.name?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      date_of_birth: input.date_of_birth || null,
      address_line1: input.address_line1?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      postal_code: input.postal_code?.trim() || null,
      country: input.country?.trim() || null,
      notes: input.notes?.trim() || null,
      tags: input.tags || [],
      total_spent_cents: 0,
      visit_count: 0
    };

    const result = await this.db.insert<Customer>('customers', customer);

    if (result.error || !result.data) {
      throw new Error(`Failed to create customer: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Update a customer
   */
  async updateCustomer(input: UpdateCustomerInput): Promise<Customer> {
    const existing = await this.getCustomerById(input.id, input.account_id!);

    // Check for duplicate email or phone if changing
    if ((input.email && input.email !== existing.email) || (input.phone && input.phone !== existing.phone)) {
      const duplicate = await this.findCustomerByEmailOrPhone(
        input.account_id!,
        input.email || undefined,
        input.phone || undefined
      );

      if (duplicate && duplicate.id !== input.id) {
        throw new ValidationError('Customer with this email or phone already exists');
      }
    }

    const updates: Partial<Customer> = {};
    if (input.name !== undefined) updates.name = input.name?.trim() || null;
    if (input.email !== undefined) updates.email = input.email?.trim().toLowerCase() || null;
    if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
    if (input.date_of_birth !== undefined) updates.date_of_birth = input.date_of_birth;
    if (input.address_line1 !== undefined) updates.address_line1 = input.address_line1?.trim() || null;
    if (input.address_line2 !== undefined) updates.address_line2 = input.address_line2?.trim() || null;
    if (input.city !== undefined) updates.city = input.city?.trim() || null;
    if (input.state !== undefined) updates.state = input.state?.trim() || null;
    if (input.postal_code !== undefined) updates.postal_code = input.postal_code?.trim() || null;
    if (input.country !== undefined) updates.country = input.country?.trim() || null;
    if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;
    if (input.tags !== undefined) updates.tags = input.tags;

    const result = await this.db.update<Customer>('customers', input.id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update customer: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Get loyalty account for customer
   */
  async getLoyaltyAccount(customerId: string, accountId: string): Promise<LoyaltyAccount | null> {
    // Verify customer exists and belongs to account
    await this.getCustomerById(customerId, accountId);

    const result = await this.db.select<LoyaltyAccount>('loyalty_accounts', {
      where: [{ column: 'customer_id', operator: '=' as const, value: customerId }],
      limit: 1
    });

    if (result.error || !result.data || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Create loyalty account for customer
   */
  async createLoyaltyAccount(input: CreateLoyaltyAccountInput): Promise<LoyaltyAccount> {
    // Verify customer exists
    await this.getCustomerById(input.customer_id, input.account_id);

    // Check if loyalty account already exists
    const existing = await this.getLoyaltyAccount(input.customer_id, input.account_id);
    if (existing) {
      throw new ValidationError('Loyalty account already exists for this customer');
    }

    const loyaltyAccount: Partial<LoyaltyAccount> = {
      account_id: input.account_id,
      customer_id: input.customer_id,
      points_balance: 0,
      lifetime_points: 0,
      tier: input.tier || 'standard',
      enrolled_at: nowISO()
    };

    const result = await this.db.insert<LoyaltyAccount>('loyalty_accounts', loyaltyAccount);

    if (result.error || !result.data) {
      throw new Error(`Failed to create loyalty account: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Add or deduct loyalty points
   */
  async adjustLoyaltyPoints(input: LoyaltyPointsInput): Promise<{
    loyaltyAccount: LoyaltyAccount;
    transaction: LoyaltyTransaction;
  }> {
    const loyaltyResult = await this.db.selectOne<LoyaltyAccount>(
      'loyalty_accounts',
      input.loyalty_account_id
    );

    if (loyaltyResult.error || !loyaltyResult.data) {
      throw new NotFoundError('Loyalty account not found');
    }

    const loyaltyAccount = loyaltyResult.data;
    const balanceBefore = loyaltyAccount.points_balance;

    // Calculate new balance
    let balanceAfter = balanceBefore;
    if (input.transaction_type === 'earn' || input.transaction_type === 'adjust') {
      balanceAfter = balanceBefore + input.points;
    } else if (input.transaction_type === 'redeem' || input.transaction_type === 'expire') {
      balanceAfter = balanceAfter - input.points;
    }

    if (balanceAfter < 0) {
      throw new ValidationError('Insufficient points balance');
    }

    // Update loyalty account
    const updateData: Partial<LoyaltyAccount> = {
      points_balance: balanceAfter
    };

    if (input.transaction_type === 'earn') {
      updateData.lifetime_points = loyaltyAccount.lifetime_points + input.points;
    }

    const updateResult = await this.db.update<LoyaltyAccount>(
      'loyalty_accounts',
      input.loyalty_account_id,
      updateData
    );

    if (updateResult.error || !updateResult.data) {
      throw new Error(`Failed to update loyalty account: ${updateResult.error || 'Unknown error'}`);
    }

    // Create transaction record
    const transaction: Partial<LoyaltyTransaction> = {
      loyalty_account_id: input.loyalty_account_id,
      transaction_type: input.transaction_type,
      points: input.points,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      notes: input.notes || null
    };

    const transactionResult = await this.db.insert<LoyaltyTransaction>(
      'loyalty_transactions',
      transaction
    );

    if (transactionResult.error || !transactionResult.data) {
      // Rollback loyalty account update
      await this.db.update<LoyaltyAccount>('loyalty_accounts', input.loyalty_account_id, {
        points_balance: balanceBefore
      });
      throw new Error(`Failed to create transaction: ${transactionResult.error || 'Unknown error'}`);
    }

    return {
      loyaltyAccount: updateResult.data,
      transaction: transactionResult.data
    };
  }

  /**
   * Get loyalty transactions for an account
   */
  async getLoyaltyTransactions(
    loyaltyAccountId: string,
    options?: SelectOptions
  ): Promise<LoyaltyTransaction[]> {
    const where = [
      { column: 'loyalty_account_id', operator: '=' as const, value: loyaltyAccountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<LoyaltyTransaction>('loyalty_transactions', {
      ...options,
      where,
      orderBy: [{ column: 'created_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch loyalty transactions: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Calculate points to earn based on order total
   * Simple 1 point per dollar spent (configurable)
   */
  calculatePointsEarned(orderTotalCents: number, pointsPerDollar = 1): number {
    return Math.floor((orderTotalCents / 100) * pointsPerDollar);
  }

  /**
   * Calculate points value for redemption
   * Simple 100 points = $1 (configurable)
   */
  calculatePointsValue(points: number, pointsPerDollar = 100): number {
    return Math.floor((points / pointsPerDollar) * 100); // Return in cents
  }
}
