import type { SelectOptions } from '../../db/types';
import type { Shift, ShiftStatus, Payment, Refund } from '../../types/database';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import { nowISO } from '../../utils/datetime';
import { BaseService } from '../base.service';

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface OpenShiftInput {
  account_id: string;
  store_id: string;
  employee_id: string;
  device_id?: string | null;
  opening_cash_cents: number;
  notes?: string | null;
}

export interface CloseShiftInput {
  closing_cash_cents: number;
  notes?: string | null;
}

export interface CashMovementInput {
  type: 'cash_in' | 'cash_out';
  amount_cents: number;
  reason?: string;
}

export interface ShiftSearchInput {
  account_id: string;
  store_id?: string;
  employee_id?: string;
  status?: ShiftStatus;
  from_date?: string;
  to_date?: string;
}

export interface ShiftSummary {
  shift: Shift;
  total_cash_payments: number;
  total_card_payments: number;
  total_other_payments: number;
  total_refunds: number;
  net_sales: number;
  expected_cash: number;
  discrepancy: number;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ShiftService extends BaseService {
  // ===========================================================================
  // SHIFT CRUD
  // ===========================================================================

  /**
   * Get shifts for an account
   */
  async getShifts(accountId: string, options?: SelectOptions): Promise<Shift[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Shift>('shifts', {
      ...options,
      where,
      orderBy: options?.orderBy || [{ column: 'opened_at', direction: 'desc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch shifts: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Search shifts with filters
   */
  async searchShifts(input: ShiftSearchInput): Promise<Shift[]> {
    const where: Array<{ column: string; operator: '=' | '>=' | '<='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    if (input.employee_id) {
      where.push({ column: 'employee_id', operator: '=' as const, value: input.employee_id });
    }

    if (input.status) {
      where.push({ column: 'status', operator: '=' as const, value: input.status });
    }

    if (input.from_date) {
      where.push({ column: 'opened_at', operator: '>=' as const, value: input.from_date });
    }

    if (input.to_date) {
      where.push({ column: 'opened_at', operator: '<=' as const, value: input.to_date });
    }

    const result = await this.db.select<Shift>('shifts', {
      where,
      orderBy: [{ column: 'opened_at', direction: 'desc' as const }],
      limit: 100
    });

    if (result.error) {
      throw new Error(`Failed to search shifts: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get a single shift by ID
   */
  async getShiftById(id: string, accountId: string): Promise<Shift> {
    const result = await this.db.selectOne<Shift>('shifts', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Shift', id);
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Shift', id);
    }

    return result.data;
  }

  /**
   * Get current open shift for employee
   */
  async getCurrentShift(employeeId: string, accountId: string): Promise<Shift | null> {
    const result = await this.db.select<Shift>('shifts', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'employee_id', operator: '=' as const, value: employeeId },
        { column: 'status', operator: '=' as const, value: 'open' }
      ],
      orderBy: [{ column: 'opened_at', direction: 'desc' as const }],
      limit: 1
    });

    if (result.error || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Get open shift for a store
   */
  async getOpenShiftForStore(storeId: string, accountId: string): Promise<Shift | null> {
    const result = await this.db.select<Shift>('shifts', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'store_id', operator: '=' as const, value: storeId },
        { column: 'status', operator: '=' as const, value: 'open' }
      ],
      orderBy: [{ column: 'opened_at', direction: 'desc' as const }],
      limit: 1
    });

    if (result.error || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  // ===========================================================================
  // SHIFT OPERATIONS
  // ===========================================================================

  /**
   * Open a new shift
   */
  async openShift(input: OpenShiftInput): Promise<Shift> {
    // Check if employee already has an open shift
    const existingShift = await this.getCurrentShift(input.employee_id, input.account_id);
    if (existingShift) {
      throw new ConflictError('Employee already has an open shift');
    }

    // Validate opening cash
    if (input.opening_cash_cents < 0) {
      throw new ValidationError('Opening cash cannot be negative');
    }

    const shift: Partial<Shift> = {
      account_id: input.account_id,
      store_id: input.store_id,
      employee_id: input.employee_id,
      device_id: input.device_id || null,
      status: 'open',
      opening_cash_cents: input.opening_cash_cents,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 0,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 0,
      notes: input.notes || null,
      opened_at: nowISO(),
      closed_at: null
    };

    const result = await this.db.insert<Shift>('shifts', shift);

    if (result.error || !result.data) {
      throw new Error(`Failed to open shift: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Close a shift
   */
  async closeShift(shiftId: string, input: CloseShiftInput, accountId: string): Promise<Shift> {
    const shift = await this.getShiftById(shiftId, accountId);

    if (shift.status !== 'open') {
      throw new ConflictError('Shift is not open');
    }

    if (input.closing_cash_cents < 0) {
      throw new ValidationError('Closing cash cannot be negative');
    }

    // Calculate expected cash
    const expectedCash =
      shift.opening_cash_cents +
      shift.cash_in_cents -
      shift.cash_out_cents;
    // Note: Cash from orders is calculated separately via getShiftSummary

    // Get shift summary for accurate totals
    const summary = await this.getShiftSummary(shiftId, accountId);

    const discrepancy = input.closing_cash_cents - summary.expected_cash;

    const result = await this.db.update<Shift>('shifts', shiftId, {
      status: 'closed',
      closing_cash_cents: input.closing_cash_cents,
      expected_cash_cents: summary.expected_cash,
      discrepancy_cents: discrepancy,
      total_sales_cents: summary.net_sales,
      total_refunds_cents: summary.total_refunds,
      notes: input.notes
        ? `${shift.notes || ''}\n${input.notes}`.trim()
        : shift.notes,
      closed_at: nowISO()
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to close shift: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Add cash in/out to shift
   */
  async addCashMovement(
    shiftId: string,
    input: CashMovementInput,
    accountId: string
  ): Promise<Shift> {
    const shift = await this.getShiftById(shiftId, accountId);

    if (shift.status !== 'open') {
      throw new ConflictError('Cannot add cash movement to closed shift');
    }

    if (input.amount_cents <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    const updates: Partial<Shift> = {};

    if (input.type === 'cash_in') {
      updates.cash_in_cents = shift.cash_in_cents + input.amount_cents;
    } else {
      // Validate cash out doesn't exceed available cash
      const currentCash = shift.opening_cash_cents + shift.cash_in_cents - shift.cash_out_cents;
      if (input.amount_cents > currentCash) {
        throw new ValidationError('Cash out amount exceeds available cash');
      }
      updates.cash_out_cents = shift.cash_out_cents + input.amount_cents;
    }

    // Add note about cash movement
    const note = `${input.type === 'cash_in' ? 'Cash In' : 'Cash Out'}: $${(input.amount_cents / 100).toFixed(2)}${input.reason ? ` - ${input.reason}` : ''}`;
    updates.notes = `${shift.notes || ''}\n[${new Date().toISOString()}] ${note}`.trim();

    const result = await this.db.update<Shift>('shifts', shiftId, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to add cash movement: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Update shift transaction totals (called after order/payment)
   */
  async updateShiftTotals(
    shiftId: string,
    saleCents: number,
    tipCents: number,
    accountId: string
  ): Promise<void> {
    const shift = await this.getShiftById(shiftId, accountId);

    if (shift.status !== 'open') {
      return; // Don't update closed shifts
    }

    await this.db.update<Shift>('shifts', shiftId, {
      total_sales_cents: shift.total_sales_cents + saleCents,
      total_tips_cents: shift.total_tips_cents + tipCents,
      transaction_count: shift.transaction_count + 1
    });
  }

  /**
   * Update shift refund totals
   */
  async updateShiftRefunds(
    shiftId: string,
    refundCents: number,
    accountId: string
  ): Promise<void> {
    const shift = await this.getShiftById(shiftId, accountId);

    if (shift.status !== 'open') {
      return;
    }

    await this.db.update<Shift>('shifts', shiftId, {
      total_refunds_cents: shift.total_refunds_cents + refundCents
    });
  }

  // ===========================================================================
  // REPORTING
  // ===========================================================================

  /**
   * Get shift summary with calculated totals
   */
  async getShiftSummary(shiftId: string, accountId: string): Promise<ShiftSummary> {
    const shift = await this.getShiftById(shiftId, accountId);

    // Get orders associated with this shift
    const ordersResult = await this.db.select<{ id: string }>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'shift_id', operator: '=' as const, value: shiftId }
      ],
      columns: ['id']
    });

    const shiftOrderIds = new Set((ordersResult.data || []).map((o) => o.id));

    // Get payments only for orders in this shift
    const paymentsResult = await this.db.select<Payment>('payments', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'status', operator: '=' as const, value: 'captured' }
      ]
    });

    // Filter payments to only those belonging to shift's orders
    const shiftPayments = (paymentsResult.data || []).filter((p) =>
      shiftOrderIds.has(p.order_id)
    );

    // Get refunds only for orders in this shift
    const refundsResult = await this.db.select<Refund>('refunds', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'status', operator: '=' as const, value: 'processed' }
      ]
    });

    // Filter refunds to only those belonging to shift's orders
    const shiftRefunds = (refundsResult.data || []).filter((r) =>
      shiftOrderIds.has(r.order_id)
    );

    // Calculate totals by payment type
    // In production, you'd join with payment_types table
    let totalCashPayments = 0;
    let totalCardPayments = 0;
    let totalOtherPayments = 0;

    for (const payment of shiftPayments) {
      // Determine payment type (simplified - in production use payment_type_id)
      // Include tip_cents in payment totals since tips are part of the transaction
      const paymentTotal = payment.amount_cents + (payment.tip_cents || 0);
      if (payment.card_brand) {
        totalCardPayments += paymentTotal;
      } else if (payment.gateway_transaction_id) {
        totalOtherPayments += paymentTotal;
      } else {
        totalCashPayments += paymentTotal;
      }
    }

    const totalRefunds = shiftRefunds.reduce((sum, r) => sum + r.amount_cents, 0);
    const netSales = totalCashPayments + totalCardPayments + totalOtherPayments - totalRefunds;

    // Expected cash = opening + cash_in - cash_out + cash payments - cash refunds
    // For simplicity, assume all non-card payments are cash
    const cashRefunds = shiftRefunds.filter((r) => !r.gateway_refund_id)
      .reduce((sum, r) => sum + r.amount_cents, 0);
    const expectedCash =
      shift.opening_cash_cents +
      shift.cash_in_cents -
      shift.cash_out_cents +
      totalCashPayments -
      cashRefunds;

    const discrepancy = (shift.closing_cash_cents ?? expectedCash) - expectedCash;

    return {
      shift,
      total_cash_payments: totalCashPayments,
      total_card_payments: totalCardPayments,
      total_other_payments: totalOtherPayments,
      total_refunds: totalRefunds,
      net_sales: netSales,
      expected_cash: expectedCash,
      discrepancy
    };
  }

  /**
   * Get daily summary for a store
   */
  async getDailySummary(
    storeId: string,
    date: string,
    accountId: string
  ): Promise<{
    shifts: ShiftSummary[];
    totals: {
      total_sales: number;
      total_refunds: number;
      net_sales: number;
      total_cash: number;
      total_card: number;
      total_tips: number;
      transaction_count: number;
    };
  }> {
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const shifts = await this.searchShifts({
      account_id: accountId,
      store_id: storeId,
      from_date: startOfDay,
      to_date: endOfDay
    });

    const summaries: ShiftSummary[] = [];
    for (const shift of shifts) {
      const summary = await this.getShiftSummary(shift.id, accountId);
      summaries.push(summary);
    }

    // Calculate totals
    const totals = summaries.reduce(
      (acc, s) => ({
        total_sales: acc.total_sales + s.total_cash_payments + s.total_card_payments + s.total_other_payments,
        total_refunds: acc.total_refunds + s.total_refunds,
        net_sales: acc.net_sales + s.net_sales,
        total_cash: acc.total_cash + s.total_cash_payments,
        total_card: acc.total_card + s.total_card_payments,
        total_tips: acc.total_tips + s.shift.total_tips_cents,
        transaction_count: acc.transaction_count + s.shift.transaction_count
      }),
      {
        total_sales: 0,
        total_refunds: 0,
        net_sales: 0,
        total_cash: 0,
        total_card: 0,
        total_tips: 0,
        transaction_count: 0
      }
    );

    return { shifts: summaries, totals };
  }
}
