import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerEmployeeRoutes } from '../employees';

// Mock EmployeeService
const mockEmployeeService = {
  searchEmployees: vi.fn(),
  getEmployeesWithoutPin: vi.fn(),
  getEmployeeById: vi.fn(),
  hasPinConfigured: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deactivateEmployee: vi.fn(),
  reactivateEmployee: vi.fn(),
  setPin: vi.fn(),
  removePin: vi.fn(),
  verifyPin: vi.fn(),
  updatePermissions: vi.fn(),
  assignToStore: vi.fn(),
  getEmployeesByStore: vi.fn()
};

vi.mock('../../../services/employees/employee.service', () => ({
  EmployeeService: vi.fn(() => mockEmployeeService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('Employee Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerEmployeeRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all employee routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/employees');
      expect(paths).toContain('GET /api/v1/employees/without-pin');
      expect(paths).toContain('GET /api/v1/employees/:id');
      expect(paths).toContain('POST /api/v1/employees');
      expect(paths).toContain('PUT /api/v1/employees/:id');
      expect(paths).toContain('DELETE /api/v1/employees/:id');
      expect(paths).toContain('POST /api/v1/employees/:id/reactivate');
      expect(paths).toContain('POST /api/v1/employees/:id/pin');
      expect(paths).toContain('DELETE /api/v1/employees/:id/pin');
      expect(paths).toContain('POST /api/v1/employees/:id/verify-pin');
      expect(paths).toContain('PUT /api/v1/employees/:id/permissions');
      expect(paths).toContain('PUT /api/v1/employees/:id/store');
      expect(paths).toContain('GET /api/v1/stores/:storeId/employees');
    });
  });

  describe('GET /api/v1/employees', () => {
    it('should list employees with pagination', async () => {
      const mockEmployees = [{ id: TEST_IDS.EMPLOYEE_ID, name: 'John Doe', role: 'cashier' }];
      mockEmployeeService.searchEmployees.mockResolvedValue(mockEmployees);

      const route = findRoute(router.routes, 'GET', '/api/v1/employees')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockEmployeeService.searchEmployees).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: undefined,
        role: undefined,
        query: undefined,
        is_active: undefined
      });
    });
  });

  describe('GET /api/v1/employees/:id', () => {
    it('should return employee with PIN status', async () => {
      const mockEmployee = { id: TEST_IDS.EMPLOYEE_ID, name: 'John Doe' };
      mockEmployeeService.getEmployeeById.mockResolvedValue(mockEmployee);
      mockEmployeeService.hasPinConfigured.mockResolvedValue(true);

      const route = findRoute(router.routes, 'GET', '/api/v1/employees/:id')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { id: TEST_IDS.EMPLOYEE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({
        success: true,
        data: expect.objectContaining({
          id: TEST_IDS.EMPLOYEE_ID,
          has_pin_configured: true
        }),
        meta: expect.any(Object)
      });
    });
  });

  describe('POST /api/v1/employees', () => {
    it('should create a new employee', async () => {
      const newEmployee = {
        id: TEST_IDS.EMPLOYEE_ID,
        name: 'Jane Doe',
        role: 'cashier'
      };
      mockEmployeeService.createEmployee.mockResolvedValue(newEmployee);

      const route = findRoute(router.routes, 'POST', '/api/v1/employees')!;
      const req = createJsonRequest('POST', {
        name: 'Jane Doe',
        role: 'cashier'
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockEmployeeService.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Doe',
          role: 'cashier',
          account_id: TEST_IDS.ACCOUNT_ID
        })
      );
    });
  });

  describe('DELETE /api/v1/employees/:id', () => {
    it('should deactivate an employee', async () => {
      const deactivatedEmployee = { id: TEST_IDS.EMPLOYEE_ID, is_active: false };
      mockEmployeeService.deactivateEmployee.mockResolvedValue(deactivatedEmployee);

      const route = findRoute(router.routes, 'DELETE', '/api/v1/employees/:id')!;
      const req = createAuthenticatedRequest({
        method: 'DELETE',
        params: { id: TEST_IDS.EMPLOYEE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockEmployeeService.deactivateEmployee).toHaveBeenCalledWith(
        TEST_IDS.EMPLOYEE_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('PIN Management', () => {
    describe('POST /api/v1/employees/:id/pin', () => {
      it('should set employee PIN', async () => {
        const result = { success: true };
        mockEmployeeService.setPin.mockResolvedValue(result);

        const route = findRoute(router.routes, 'POST', '/api/v1/employees/:id/pin')!;
        const req = createJsonRequest(
          'POST',
          { new_pin: '1234' },
          { params: { id: TEST_IDS.EMPLOYEE_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockEmployeeService.setPin).toHaveBeenCalledWith({
          employee_id: TEST_IDS.EMPLOYEE_ID,
          account_id: TEST_IDS.ACCOUNT_ID,
          new_pin: '1234',
          current_pin: undefined
        });
      });
    });

    describe('POST /api/v1/employees/:id/verify-pin', () => {
      it('should verify PIN and return result', async () => {
        const result = { valid: true, employee_id: TEST_IDS.EMPLOYEE_ID };
        mockEmployeeService.verifyPin.mockResolvedValue(result);

        const route = findRoute(router.routes, 'POST', '/api/v1/employees/:id/verify-pin')!;
        const req = createJsonRequest(
          'POST',
          { pin: '1234' },
          { params: { id: TEST_IDS.EMPLOYEE_ID } }
        );
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockEmployeeService.verifyPin).toHaveBeenCalledWith({
          employee_id: TEST_IDS.EMPLOYEE_ID,
          pin: '1234'
        });
      });
    });

    describe('DELETE /api/v1/employees/:id/pin', () => {
      it('should remove employee PIN', async () => {
        const result = { success: true };
        mockEmployeeService.removePin.mockResolvedValue(result);

        const route = findRoute(router.routes, 'DELETE', '/api/v1/employees/:id/pin')!;
        const req = createAuthenticatedRequest({
          method: 'DELETE',
          params: { id: TEST_IDS.EMPLOYEE_ID }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockEmployeeService.removePin).toHaveBeenCalledWith(
          TEST_IDS.EMPLOYEE_ID,
          TEST_IDS.ACCOUNT_ID
        );
      });
    });
  });

  describe('PUT /api/v1/employees/:id/permissions', () => {
    it('should update employee permissions', async () => {
      const updatedEmployee = { id: TEST_IDS.EMPLOYEE_ID, permissions: { can_refund: true } };
      mockEmployeeService.updatePermissions.mockResolvedValue(updatedEmployee);

      const route = findRoute(router.routes, 'PUT', '/api/v1/employees/:id/permissions')!;
      const req = createJsonRequest(
        'PUT',
        { can_refund: true, can_discount: false },
        { params: { id: TEST_IDS.EMPLOYEE_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockEmployeeService.updatePermissions).toHaveBeenCalledWith(
        TEST_IDS.EMPLOYEE_ID,
        TEST_IDS.ACCOUNT_ID,
        { can_refund: true, can_discount: false }
      );
    });
  });

  describe('PUT /api/v1/employees/:id/store', () => {
    it('should assign employee to store', async () => {
      const updatedEmployee = { id: TEST_IDS.EMPLOYEE_ID, store_id: TEST_IDS.STORE_ID };
      mockEmployeeService.assignToStore.mockResolvedValue(updatedEmployee);

      const route = findRoute(router.routes, 'PUT', '/api/v1/employees/:id/store')!;
      const req = createJsonRequest(
        'PUT',
        { store_id: TEST_IDS.STORE_ID },
        { params: { id: TEST_IDS.EMPLOYEE_ID } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockEmployeeService.assignToStore).toHaveBeenCalledWith(
        TEST_IDS.EMPLOYEE_ID,
        TEST_IDS.STORE_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });
  });

  describe('GET /api/v1/stores/:storeId/employees', () => {
    it('should get employees for a store', async () => {
      const mockEmployees = [{ id: TEST_IDS.EMPLOYEE_ID, name: 'John' }];
      mockEmployeeService.getEmployeesByStore.mockResolvedValue(mockEmployees);

      const route = findRoute(router.routes, 'GET', '/api/v1/stores/:storeId/employees')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { storeId: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockEmployeeService.getEmployeesByStore).toHaveBeenCalledWith(
        TEST_IDS.STORE_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });
  });
});
