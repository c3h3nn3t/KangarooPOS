import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerShiftRoutes } from '../shifts';

// Mock ShiftService
const mockShiftService = {
  searchShifts: vi.fn(),
  getCurrentShift: vi.fn(),
  getShiftById: vi.fn(),
  getShiftSummary: vi.fn(),
  openShift: vi.fn(),
  closeShift: vi.fn(),
  addCashMovement: vi.fn(),
  getDailySummary: vi.fn()
};

vi.mock('../../../services/shifts/shift.service', () => ({
  ShiftService: vi.fn(() => mockShiftService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Shift Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerShiftRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all shift routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/shifts');
      expect(paths).toContain('GET /api/v1/shifts/current');
      expect(paths).toContain('GET /api/v1/shifts/:id');
      expect(paths).toContain('GET /api/v1/shifts/:id/summary');
      expect(paths).toContain('POST /api/v1/shifts');
      expect(paths).toContain('POST /api/v1/shifts/:id/close');
      expect(paths).toContain('POST /api/v1/shifts/:id/cash-movement');
      expect(paths).toContain('GET /api/v1/reports/daily');
    });
  });

  describe('GET /api/v1/shifts', () => {
    it('should list shifts with pagination', async () => {
      const mockShifts = [{ id: TEST_IDS.SHIFT_ID, status: 'open' }];
      mockShiftService.searchShifts.mockResolvedValue(mockShifts);

      const route = findRoute(router.routes, 'GET', '/api/v1/shifts')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.searchShifts).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: undefined,
        employee_id: undefined,
        status: undefined,
        from_date: undefined,
        to_date: undefined
      });
    });
  });

  describe('GET /api/v1/shifts/current', () => {
    it('should return current employee shift', async () => {
      const mockShift = { id: TEST_IDS.SHIFT_ID, status: 'open', employee_id: TEST_IDS.EMPLOYEE_ID };
      mockShiftService.getCurrentShift.mockResolvedValue(mockShift);

      const route = findRoute(router.routes, 'GET', '/api/v1/shifts/current')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.getCurrentShift).toHaveBeenCalledWith(
        TEST_IDS.EMPLOYEE_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });

    it('should return null if no open shift', async () => {
      mockShiftService.getCurrentShift.mockResolvedValue(null);

      const route = findRoute(router.routes, 'GET', '/api/v1/shifts/current')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({
        success: true,
        data: null,
        meta: expect.any(Object)
      });
    });
  });

  describe('POST /api/v1/shifts', () => {
    it('should open a new shift', async () => {
      const newShift = {
        id: TEST_IDS.SHIFT_ID,
        status: 'open',
        opening_cash_cents: 10000
      };
      mockShiftService.openShift.mockResolvedValue(newShift);

      const route = findRoute(router.routes, 'POST', '/api/v1/shifts')!;
      const req = createJsonRequest('POST', {
        store_id: TEST_IDS.STORE_ID,
        opening_cash_cents: 10000
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.openShift).toHaveBeenCalledWith({
        store_id: TEST_IDS.STORE_ID,
        opening_cash_cents: 10000,
        account_id: TEST_IDS.ACCOUNT_ID,
        employee_id: TEST_IDS.EMPLOYEE_ID
      });
    });
  });

  describe('POST /api/v1/shifts/:id/close', () => {
    it('should close a shift', async () => {
      const closedShift = {
        id: TEST_IDS.SHIFT_ID,
        status: 'closed',
        closing_cash_cents: 15000
      };
      mockShiftService.closeShift.mockResolvedValue(closedShift);

      const route = findRoute(router.routes, 'POST', '/api/v1/shifts/:id/close')!;
      const req = createJsonRequest(
        'POST',
        { closing_cash_cents: 15000 },
        { params: { id: TEST_IDS.SHIFT_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.closeShift).toHaveBeenCalledWith(
        TEST_IDS.SHIFT_ID,
        { closing_cash_cents: 15000 },
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('POST /api/v1/shifts/:id/cash-movement', () => {
    it('should add cash in', async () => {
      const updatedShift = { id: TEST_IDS.SHIFT_ID, cash_in_cents: 5000 };
      mockShiftService.addCashMovement.mockResolvedValue(updatedShift);

      const route = findRoute(router.routes, 'POST', '/api/v1/shifts/:id/cash-movement')!;
      const req = createJsonRequest(
        'POST',
        { type: 'cash_in', amount_cents: 5000, reason: 'Change replenishment' },
        { params: { id: TEST_IDS.SHIFT_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.addCashMovement).toHaveBeenCalledWith(
        TEST_IDS.SHIFT_ID,
        { type: 'cash_in', amount_cents: 5000, reason: 'Change replenishment' },
        TEST_IDS.ACCOUNT_ID
      );
    });

    it('should add cash out', async () => {
      const updatedShift = { id: TEST_IDS.SHIFT_ID, cash_out_cents: 2000 };
      mockShiftService.addCashMovement.mockResolvedValue(updatedShift);

      const route = findRoute(router.routes, 'POST', '/api/v1/shifts/:id/cash-movement')!;
      const req = createJsonRequest(
        'POST',
        { type: 'cash_out', amount_cents: 2000, reason: 'Bank deposit' },
        { params: { id: TEST_IDS.SHIFT_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.addCashMovement).toHaveBeenCalledWith(
        TEST_IDS.SHIFT_ID,
        { type: 'cash_out', amount_cents: 2000, reason: 'Bank deposit' },
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('GET /api/v1/shifts/:id/summary', () => {
    it('should return shift summary', async () => {
      const mockSummary = {
        shift_id: TEST_IDS.SHIFT_ID,
        total_sales_cents: 50000,
        total_refunds_cents: 2000,
        net_sales_cents: 48000,
        transaction_count: 25
      };
      mockShiftService.getShiftSummary.mockResolvedValue(mockSummary);

      const route = findRoute(router.routes, 'GET', '/api/v1/shifts/:id/summary')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { id: TEST_IDS.SHIFT_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.getShiftSummary).toHaveBeenCalledWith(
        TEST_IDS.SHIFT_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('GET /api/v1/reports/daily', () => {
    it('should return daily summary', async () => {
      const mockSummary = {
        date: '2025-01-15',
        total_sales_cents: 100000,
        shift_count: 3
      };
      mockShiftService.getDailySummary.mockResolvedValue(mockSummary);

      const route = findRoute(router.routes, 'GET', '/api/v1/reports/daily')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { store_id: TEST_IDS.STORE_ID, date: '2025-01-15' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockShiftService.getDailySummary).toHaveBeenCalledWith(
        TEST_IDS.STORE_ID,
        '2025-01-15',
        TEST_IDS.ACCOUNT_ID
      );
    });
  });
});
