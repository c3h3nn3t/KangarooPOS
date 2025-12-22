import type { SelectOptions } from '../../db/types';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { BaseService } from '../base.service';

// =============================================================================
// TYPES
// =============================================================================

export interface LoyaltyAccount {
  id: string;
  account_id: string;
  customer_id: string;
  points_balance: number;
  lifetime_points: number;
  tier: string;
  enrolled_at: string;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  loyalty_account_id: string;
  transaction_type: 'earn' | 'redeem' | 'adjust' | 'expire';
  points: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface LoyaltyProgram {
  points_per_currency_unit: number; // e.g., 1 point per $1 spent
  redemption_rate_cents: number; // e.g., 100 points = $1 discount (100 cents)
  minimum_redemption: number; // Minimum points to redeem
  tiers: LoyaltyTier[];
}

export interface LoyaltyTier {
  name: string;
  minimum_points: number;
  points_multiplier: number; // e.g., 1.5 for 50% bonus points
  perks: string[];
}

export interface EnrollCustomerInput {
  account_id: string;
  customer_id: string;
}

export interface EarnPointsInput {
  loyalty_account_id: string;
  order_total_cents: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
}

export interface RedeemPointsInput {
  loyalty_account_id: string;
  points: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
}

export interface AdjustPointsInput {
  loyalty_account_id: string;
  points: number; // Can be positive or negative
  reason: string;
  notes?: string;
}

// Default loyalty program configuration
const DEFAULT_LOYALTY_PROGRAM: LoyaltyProgram = {
  points_per_currency_unit: 1,
  redemption_rate_cents: 100, // 100 points = 1 currency unit
  minimum_redemption: 100,
  tiers: [
    { name: 'standard', minimum_points: 0, points_multiplier: 1, perks: [] },
    {
      name: 'silver',
      minimum_points: 1000,
      points_multiplier: 1.25,
      perks: ['5% birthday discount']
    },
    {
      name: 'gold',
      minimum_points: 5000,
      points_multiplier: 1.5,
      perks: ['10% birthday discount', 'Free gift on signup']
    },
    {
      name: 'platinum',
      minimum_points: 10000,
      points_multiplier: 2,
      perks: ['15% birthday discount', 'Free gift on signup', 'Priority support']
    }
  ]
};

// =============================================================================
// SERVICE
// =============================================================================

export class LoyaltyService extends BaseService {
  private program: LoyaltyProgram = DEFAULT_LOYALTY_PROGRAM;

  /**
   * Configure the loyalty program
   */
  setProgram(program: Partial<LoyaltyProgram>): void {
    this.program = { ...DEFAULT_LOYALTY_PROGRAM, ...program };
  }

  /**
   * Get the current loyalty program configuration
   */
  getProgram(): LoyaltyProgram {
    return this.program;
  }

  // ===========================================================================
  // LOYALTY ACCOUNTS
  // ===========================================================================

  /**
   * Get a loyalty account by ID
   */
  async getAccount(id: string): Promise<LoyaltyAccount> {
    const result = await this.db.selectOne<LoyaltyAccount>('loyalty_accounts', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Loyalty account', id);
    }

    return result.data;
  }

  /**
   * Get a loyalty account by customer ID
   */
  async getAccountByCustomer(customerId: string): Promise<LoyaltyAccount | null> {
    const result = await this.db.select<LoyaltyAccount>('loyalty_accounts', {
      where: [{ column: 'customer_id', operator: '=' as const, value: customerId }],
      limit: 1
    });

    if (result.error) {
      throw new Error(`Failed to fetch loyalty account: ${result.error}`);
    }

    return result.data?.[0] || null;
  }

  /**
   * Enroll a customer in the loyalty program
   */
  async enrollCustomer(input: EnrollCustomerInput): Promise<LoyaltyAccount> {
    // Check if customer is already enrolled
    const existing = await this.getAccountByCustomer(input.customer_id);
    if (existing) {
      throw new ConflictError('Customer is already enrolled in the loyalty program');
    }

    const now = new Date().toISOString();
    const account: Partial<LoyaltyAccount> = {
      account_id: input.account_id,
      customer_id: input.customer_id,
      points_balance: 0,
      lifetime_points: 0,
      tier: 'standard',
      enrolled_at: now,
      created_at: now,
      updated_at: now
    };

    const result = await this.db.insert<LoyaltyAccount>('loyalty_accounts', account);

    if (result.error || !result.data) {
      throw new Error(`Failed to enroll customer: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Calculate the tier for a given lifetime points
   */
  calculateTier(lifetimePoints: number): string {
    const tiers = [...this.program.tiers].sort((a, b) => b.minimum_points - a.minimum_points);

    for (const tier of tiers) {
      if (lifetimePoints >= tier.minimum_points) {
        return tier.name;
      }
    }

    return 'standard';
  }

  /**
   * Get tier configuration by name
   */
  getTierConfig(tierName: string): LoyaltyTier {
    return this.program.tiers.find((t) => t.name === tierName) || this.program.tiers[0];
  }

  // ===========================================================================
  // TRANSACTIONS
  // ===========================================================================

  /**
   * Get transactions for a loyalty account
   */
  async getTransactions(
    loyaltyAccountId: string,
    options?: SelectOptions
  ): Promise<LoyaltyTransaction[]> {
    const result = await this.db.select<LoyaltyTransaction>('loyalty_transactions', {
      where: [
        { column: 'loyalty_account_id', operator: '=' as const, value: loyaltyAccountId },
        ...(options?.where || [])
      ],
      orderBy: [{ column: 'created_at', direction: 'desc' as const }],
      limit: options?.limit,
      offset: options?.offset
    });

    if (result.error) {
      throw new Error(`Failed to fetch loyalty transactions: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * Earn points from a purchase
   */
  async earnPoints(input: EarnPointsInput): Promise<LoyaltyTransaction> {
    const account = await this.getAccount(input.loyalty_account_id);
    const tierConfig = this.getTierConfig(account.tier);

    // Calculate points (amount in currency units * points rate * tier multiplier)
    const currencyUnits = Math.floor(input.order_total_cents / 100);
    const basePoints = currencyUnits * this.program.points_per_currency_unit;
    const earnedPoints = Math.floor(basePoints * tierConfig.points_multiplier);

    if (earnedPoints <= 0) {
      throw new ValidationError('Order total too low to earn points');
    }

    const balanceBefore = account.points_balance;
    const balanceAfter = balanceBefore + earnedPoints;
    const newLifetimePoints = account.lifetime_points + earnedPoints;
    const newTier = this.calculateTier(newLifetimePoints);

    // Create transaction
    const transaction: Partial<LoyaltyTransaction> = {
      loyalty_account_id: input.loyalty_account_id,
      transaction_type: 'earn',
      points: earnedPoints,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: input.reference_type || 'order',
      reference_id: input.reference_id || null,
      notes: input.notes || null,
      created_at: new Date().toISOString()
    };

    const txResult = await this.db.insert<LoyaltyTransaction>('loyalty_transactions', transaction);

    if (txResult.error || !txResult.data) {
      throw new Error(`Failed to create loyalty transaction: ${txResult.error}`);
    }

    // Update account
    await this.db.update('loyalty_accounts', account.id, {
      points_balance: balanceAfter,
      lifetime_points: newLifetimePoints,
      tier: newTier,
      updated_at: new Date().toISOString()
    });

    return txResult.data;
  }

  /**
   * Redeem points for a discount
   */
  async redeemPoints(input: RedeemPointsInput): Promise<{ transaction: LoyaltyTransaction; discount_cents: number }> {
    const account = await this.getAccount(input.loyalty_account_id);

    if (input.points < this.program.minimum_redemption) {
      throw new ValidationError(
        `Minimum redemption is ${this.program.minimum_redemption} points`
      );
    }

    if (input.points > account.points_balance) {
      throw new ValidationError('Insufficient points balance');
    }

    const balanceBefore = account.points_balance;
    const balanceAfter = balanceBefore - input.points;
    const discountCents = Math.floor(
      (input.points / this.program.redemption_rate_cents) * 100
    );

    // Create transaction
    const transaction: Partial<LoyaltyTransaction> = {
      loyalty_account_id: input.loyalty_account_id,
      transaction_type: 'redeem',
      points: -input.points,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: input.reference_type || 'order',
      reference_id: input.reference_id || null,
      notes: input.notes || null,
      created_at: new Date().toISOString()
    };

    const txResult = await this.db.insert<LoyaltyTransaction>('loyalty_transactions', transaction);

    if (txResult.error || !txResult.data) {
      throw new Error(`Failed to create loyalty transaction: ${txResult.error}`);
    }

    // Update account
    await this.db.update('loyalty_accounts', account.id, {
      points_balance: balanceAfter,
      updated_at: new Date().toISOString()
    });

    return { transaction: txResult.data, discount_cents: discountCents };
  }

  /**
   * Manually adjust points (admin function)
   */
  async adjustPoints(input: AdjustPointsInput): Promise<LoyaltyTransaction> {
    const account = await this.getAccount(input.loyalty_account_id);

    const balanceBefore = account.points_balance;
    const balanceAfter = balanceBefore + input.points;

    if (balanceAfter < 0) {
      throw new ValidationError('Adjustment would result in negative balance');
    }

    // Create transaction
    const transaction: Partial<LoyaltyTransaction> = {
      loyalty_account_id: input.loyalty_account_id,
      transaction_type: 'adjust',
      points: input.points,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: 'adjustment',
      reference_id: null,
      notes: input.reason + (input.notes ? ` - ${input.notes}` : ''),
      created_at: new Date().toISOString()
    };

    const txResult = await this.db.insert<LoyaltyTransaction>('loyalty_transactions', transaction);

    if (txResult.error || !txResult.data) {
      throw new Error(`Failed to create loyalty transaction: ${txResult.error}`);
    }

    // Update account - adjust lifetime points only if positive
    const newLifetimePoints =
      input.points > 0 ? account.lifetime_points + input.points : account.lifetime_points;
    const newTier = this.calculateTier(newLifetimePoints);

    await this.db.update('loyalty_accounts', account.id, {
      points_balance: balanceAfter,
      lifetime_points: newLifetimePoints,
      tier: newTier,
      updated_at: new Date().toISOString()
    });

    return txResult.data;
  }

  /**
   * Calculate points that would be earned for an order
   */
  calculateEarnablePoints(orderTotalCents: number, tier = 'standard'): number {
    const tierConfig = this.getTierConfig(tier);
    const currencyUnits = Math.floor(orderTotalCents / 100);
    const basePoints = currencyUnits * this.program.points_per_currency_unit;
    return Math.floor(basePoints * tierConfig.points_multiplier);
  }

  /**
   * Calculate discount value for points
   */
  calculateRedemptionValue(points: number): number {
    return Math.floor((points / this.program.redemption_rate_cents) * 100);
  }
}
