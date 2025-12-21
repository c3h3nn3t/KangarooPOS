import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShiftService } from './shift.service';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors';
import type { Shift, Payment, Refund } from '../../types/database';
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

describe('ShiftService', () => {
  let service: ShiftService;
  const accountId = 'account-123';
  const storeId = 'store-123';
  const employeeId = 'employee-123';
  const shiftId = 'shift-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ShiftService();
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('getShifts', () => {
    const mockShifts: Shift[] = [
      {
        id: shiftId,
        account_id: accountId,
        store_id: storeId,
        employee_id: employeeId,
        status: 'open',
        opening_cash_cents: 10000,
        closing_cash_cents: null,
        expected_cash_cents: null,
        discrepancy_cents: null,
        cash_in_cents: 0,
        cash_out_cents: 0,
        total_sales_cents: 0,
        total_refunds_cents: 0,
        total_tips_cents: 0,
        transaction_count: 0,
        opened_at: '2025-01-01T08:00:00Z',
        closed_at: null,
        created_at: '2025-01-01T08:00:00Z',
        updated_at: '2025-01-01T08:00:00Z'
      }
    ];

    it('should fetch shifts for an account', async () => {
      mockDb.select.mockResolvedValue({ data: mockShifts, error: null });

      const result = await service.getShifts(accountId);

      expect(result).toEqual(mockShifts);
      expect(mockDb.select).toHaveBeenCalledWith(
        'shifts',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId }
          ])
        })
      );
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getShifts(accountId)).rejects.toThrow('Failed to fetch shifts');
    });
  });

  describe('searchShifts', () => {
    const mockShifts: Shift[] = [
      {
        id: shiftId,
        account_id: accountId,
        store_id: storeId,
        employee_id: employeeId,
        status: 'open',
        opening_cash_cents: 10000,
        closing_cash_cents: null,
        expected_cash_cents: null,
        discrepancy_cents: null,
        cash_in_cents: 0,
        cash_out_cents: 0,
        total_sales_cents: 0,
        total_refunds_cents: 0,
        total_tips_cents: 0,
        transaction_count: 0,
        opened_at: '2025-01-15T08:00:00Z',
        closed_at: null,
        created_at: '2025-01-15T08:00:00Z',
        updated_at: '2025-01-15T08:00:00Z'
      },
      {
        id: 'shift-2',
        account_id: accountId,
        store_id: storeId,
        employee_id: 'employee-456',
        status: 'closed',
        opening_cash_cents: 10000,
        closing_cash_cents: 15000,
        expected_cash_cents: 15000,
        discrepancy_cents: 0,
        cash_in_cents: 0,
        cash_out_cents: 0,
        total_sales_cents: 5000,
        total_refunds_cents: 0,
        total_tips_cents: 100,
        transaction_count: 5,
        opened_at: '2025-01-14T08:00:00Z',
        closed_at: '2025-01-14T16:00:00Z',
        created_at: '2025-01-14T08:00:00Z',
        updated_at: '2025-01-14T16:00:00Z'
      }
    ];

    it('should search shifts with all filters', async () => {
      mockDb.select.mockResolvedValue({ data: mockShifts, error: null });

      const result = await service.searchShifts({
        account_id: accountId,
        store_id: storeId,
        employee_id: employeeId,
        status: 'open',
        from_date: '2025-01-01T00:00:00Z',
        to_date: '2025-01-31T23:59:59Z'
      });

      expect(result).toEqual(mockShifts);
      expect(mockDb.select).toHaveBeenCalledWith(
        'shifts',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId },
            { column: 'store_id', operator: '=', value: storeId },
            { column: 'employee_id', operator: '=', value: employeeId },
            { column: 'status', operator: '=', value: 'open' },
            { column: 'opened_at', operator: '>=', value: '2025-01-01T00:00:00Z' },
            { column: 'opened_at', operator: '<=', value: '2025-01-31T23:59:59Z' }
          ])
        })
      );
    });

    it('should search shifts with minimal filters', async () => {
      mockDb.select.mockResolvedValue({ data: mockShifts, error: null });

      const result = await service.searchShifts({
        account_id: accountId
      });

      expect(result).toEqual(mockShifts);
      expect(mockDb.select).toHaveBeenCalledWith(
        'shifts',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId }
          ])
        })
      );
    });

    it('should filter by date range', async () => {
      mockDb.select.mockResolvedValue({ data: [mockShifts[0]], error: null });

      await service.searchShifts({
        account_id: accountId,
        from_date: '2025-01-15T00:00:00Z',
        to_date: '2025-01-15T23:59:59Z'
      });

      expect(mockDb.select).toHaveBeenCalledWith(
        'shifts',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'opened_at', operator: '>=', value: '2025-01-15T00:00:00Z' },
            { column: 'opened_at', operator: '<=', value: '2025-01-15T23:59:59Z' }
          ])
        })
      );
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(
        service.searchShifts({
          account_id: accountId
        })
      ).rejects.toThrow('Failed to search shifts');
    });
  });

  describe('getShiftById', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 0,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 0,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    it('should return shift when found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });

      const result = await service.getShiftById(shiftId, accountId);

      expect(result).toEqual(mockShift);
    });

    it('should throw NotFoundError when shift not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getShiftById(shiftId, accountId)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when shift belongs to different account', async () => {
      const otherShift = { ...mockShift, account_id: 'other-account' };
      mockDb.selectOne.mockResolvedValue({ data: otherShift, error: null });

      await expect(service.getShiftById(shiftId, accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCurrentShift', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 0,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 0,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    it('should return open shift for employee', async () => {
      mockDb.select.mockResolvedValue({ data: [mockShift], error: null });

      const result = await service.getCurrentShift(employeeId, accountId);

      expect(result).toEqual(mockShift);
    });

    it('should return null when no open shift', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });

      const result = await service.getCurrentShift(employeeId, accountId);

      expect(result).toBeNull();
    });
  });

  describe('openShift', () => {
    it('should open a new shift', async () => {
      // Mock getCurrentShift to return null (no existing shift)
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.insert.mockResolvedValue({
        data: {
          id: shiftId,
          account_id: accountId,
          store_id: storeId,
          employee_id: employeeId,
          status: 'open',
          opening_cash_cents: 10000,
          closing_cash_cents: null,
          expected_cash_cents: null,
          discrepancy_cents: null,
          cash_in_cents: 0,
          cash_out_cents: 0,
          total_sales_cents: 0,
          total_refunds_cents: 0,
          total_tips_cents: 0,
          transaction_count: 0,
          opened_at: '2025-01-01T08:00:00Z',
          closed_at: null,
          created_at: '2025-01-01T08:00:00Z',
          updated_at: '2025-01-01T08:00:00Z'
        } as Shift,
        error: null
      });

      const result = await service.openShift({
        account_id: accountId,
        store_id: storeId,
        employee_id: employeeId,
        opening_cash_cents: 10000
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('open');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw ConflictError when employee already has open shift', async () => {
      const existingShift: Shift = {
        id: shiftId,
        account_id: accountId,
        store_id: storeId,
        employee_id: employeeId,
        status: 'open',
        opening_cash_cents: 10000,
        closing_cash_cents: null,
        expected_cash_cents: null,
        discrepancy_cents: null,
        cash_in_cents: 0,
        cash_out_cents: 0,
        total_sales_cents: 0,
        total_refunds_cents: 0,
        total_tips_cents: 0,
        transaction_count: 0,
        opened_at: '2025-01-01T08:00:00Z',
        closed_at: null,
        created_at: '2025-01-01T08:00:00Z',
        updated_at: '2025-01-01T08:00:00Z'
      };
      mockDb.select.mockResolvedValue({ data: [existingShift], error: null });

      await expect(
        service.openShift({
          account_id: accountId,
          store_id: storeId,
          employee_id: employeeId,
          opening_cash_cents: 10000
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError when opening cash is negative', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });

      await expect(
        service.openShift({
          account_id: accountId,
          store_id: storeId,
          employee_id: employeeId,
          opening_cash_cents: -100
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('closeShift', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 0,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 0,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    it('should close an open shift', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });
      mockDb.select
        .mockResolvedValueOnce({ data: [], error: null }) // Orders
        .mockResolvedValueOnce({ data: [], error: null }) // Payments
        .mockResolvedValueOnce({ data: [], error: null }); // Refunds
      mockDb.update.mockResolvedValue({
        data: {
          ...mockShift,
          status: 'closed',
          closing_cash_cents: 10000,
          closed_at: '2025-01-01T16:00:00Z'
        },
        error: null
      });

      const result = await service.closeShift(shiftId, { closing_cash_cents: 10000 }, accountId);

      expect(result.status).toBe('closed');
      expect(result.closing_cash_cents).toBe(10000);
    });

    it('should throw ConflictError when shift is not open', async () => {
      const closedShift = { ...mockShift, status: 'closed' as const };
      mockDb.selectOne.mockResolvedValue({ data: closedShift, error: null });

      await expect(
        service.closeShift(shiftId, { closing_cash_cents: 10000 }, accountId)
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError when closing cash is negative', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });

      await expect(
        service.closeShift(shiftId, { closing_cash_cents: -100 }, accountId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('addCashMovement', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 0,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 0,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    it('should add cash in movement', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockShift,
          cash_in_cents: 5000
        },
        error: null
      });

      const result = await service.addCashMovement(
        shiftId,
        { type: 'cash_in', amount_cents: 5000 },
        accountId
      );

      expect(result.cash_in_cents).toBe(5000);
    });

    it('should add cash out movement', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockShift,
          cash_out_cents: 2000
        },
        error: null
      });

      const result = await service.addCashMovement(
        shiftId,
        { type: 'cash_out', amount_cents: 2000 },
        accountId
      );

      expect(result.cash_out_cents).toBe(2000);
    });

    it('should throw ConflictError when shift is closed', async () => {
      const closedShift = { ...mockShift, status: 'closed' as const };
      mockDb.selectOne.mockResolvedValue({ data: closedShift, error: null });

      await expect(
        service.addCashMovement(shiftId, { type: 'cash_in', amount_cents: 1000 }, accountId)
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError when amount is zero or negative', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });

      await expect(
        service.addCashMovement(shiftId, { type: 'cash_in', amount_cents: 0 }, accountId)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when cash out exceeds available cash', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });

      await expect(
        service.addCashMovement(shiftId, { type: 'cash_out', amount_cents: 20000 }, accountId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getShiftSummary', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 0,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 0,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    const mockPayments: Payment[] = [
      {
        id: 'payment-1',
        account_id: accountId,
        order_id: 'order-1',
        amount_cents: 2000,
        tip_cents: 100,
        payment_type_id: null,
        card_brand: 'visa',
        status: 'captured',
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z'
      },
      {
        id: 'payment-2',
        account_id: accountId,
        order_id: 'order-2',
        amount_cents: 1500,
        tip_cents: 0,
        payment_type_id: null,
        card_brand: null,
        gateway_transaction_id: null,
        status: 'captured',
        created_at: '2025-01-01T11:00:00Z',
        updated_at: '2025-01-01T11:00:00Z'
      }
    ];

    it('should calculate shift summary with payments', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });
      mockDb.select
        .mockResolvedValueOnce({ data: [{ id: 'order-1' }, { id: 'order-2' }], error: null }) // Orders
        .mockResolvedValueOnce({ data: mockPayments, error: null }) // Payments
        .mockResolvedValueOnce({ data: [], error: null }); // Refunds

      const result = await service.getShiftSummary(shiftId, accountId);

      expect(result).toHaveProperty('shift');
      expect(result).toHaveProperty('total_cash_payments');
      expect(result).toHaveProperty('total_card_payments');
      expect(result).toHaveProperty('net_sales');
      expect(result).toHaveProperty('expected_cash');
    });
  });

  describe('updateShiftTotals', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 1000,
      total_refunds_cents: 0,
      total_tips_cents: 50,
      transaction_count: 1,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    it('should update shift totals for open shift', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockShift,
          total_sales_cents: 2000,
          total_tips_cents: 100,
          transaction_count: 2
        },
        error: null
      });

      await service.updateShiftTotals(shiftId, 1000, 50, accountId);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should not update closed shift', async () => {
      const closedShift = { ...mockShift, status: 'closed' as const };
      mockDb.selectOne.mockResolvedValue({ data: closedShift, error: null });

      await service.updateShiftTotals(shiftId, 1000, 50, accountId);

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('updateShiftRefunds', () => {
    const mockShift: Shift = {
      id: shiftId,
      account_id: accountId,
      store_id: storeId,
      employee_id: employeeId,
      status: 'open',
      opening_cash_cents: 10000,
      closing_cash_cents: null,
      expected_cash_cents: null,
      discrepancy_cents: null,
      cash_in_cents: 0,
      cash_out_cents: 0,
      total_sales_cents: 1000,
      total_refunds_cents: 0,
      total_tips_cents: 0,
      transaction_count: 1,
      opened_at: '2025-01-01T08:00:00Z',
      closed_at: null,
      created_at: '2025-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    };

    it('should update refund totals for open shift', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockShift, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockShift,
          total_refunds_cents: 500
        },
        error: null
      });

      await service.updateShiftRefunds(shiftId, 500, accountId);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should not update closed shift', async () => {
      const closedShift = { ...mockShift, status: 'closed' as const };
      mockDb.selectOne.mockResolvedValue({ data: closedShift, error: null });

      await service.updateShiftRefunds(shiftId, 500, accountId);

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});

