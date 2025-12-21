import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { EmployeeService } from '../../services/employees/employee.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import type { UserRole } from '../../types/database';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const employeeService = new EmployeeService();

const roleEnum = z.enum(['owner', 'admin', 'manager', 'cashier', 'kitchen']);

const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  store_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  role: roleEnum,
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits').optional(),
  hourly_rate_cents: z.number().int().nonnegative().nullable().optional(),
  permissions: z.record(z.boolean()).optional()
});

const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  is_active: z.boolean().optional()
});

const querySchema = z.object({
  store_id: z.string().uuid().optional(),
  role: roleEnum.optional(),
  search: z.string().optional(),
  is_active: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const setPinSchema = z.object({
  new_pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits'),
  current_pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits').optional()
});

const verifyPinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits')
});

const permissionsSchema = z.record(z.boolean());

/**
 * Register employee routes
 */
export function registerEmployeeRoutes(router: Router): void {
  /**
   * GET /api/v1/employees
   * Get all employees for the authenticated account
   */
  router.get(
    '/api/v1/employees',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = querySchema.parse(req.query || {});

      const employees = await employeeService.searchEmployees({
        account_id: accountId,
        store_id: query.store_id,
        role: query.role as UserRole | undefined,
        query: query.search,
        is_active: query.is_active
      });

      const start = (query.page - 1) * query.limit;
      const paginatedEmployees = employees.slice(start, start + query.limit);

      paginatedResponse(res, paginatedEmployees, employees.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager')]
  );

  /**
   * GET /api/v1/employees/:id
   * Get a single employee by ID
   */
  router.get(
    '/api/v1/employees/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;

      const employee = await employeeService.getEmployeeById(employeeId, accountId);
      const hasPin = await employeeService.hasPinConfigured(employeeId, accountId);

      successResponse(
        res,
        {
          ...employee,
          has_pin_configured: hasPin
        },
        200,
        { requestId: req.requestId }
      );
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/employees
   * Create a new employee
   */
  router.post(
    '/api/v1/employees',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createEmployeeSchema.parse(req.body);

      const employee = await employeeService.createEmployee({
        ...input,
        account_id: accountId
      });

      successResponse(res, employee, 201, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateBody(createEmployeeSchema)
    ]
  );

  /**
   * PUT /api/v1/employees/:id
   * Update an employee
   */
  router.put(
    '/api/v1/employees/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;
      const input = updateEmployeeSchema.parse(req.body);

      const employee = await employeeService.updateEmployee({
        ...input,
        id: employeeId,
        account_id: accountId
      });

      successResponse(res, employee, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(updateEmployeeSchema)
    ]
  );

  /**
   * DELETE /api/v1/employees/:id
   * Deactivate an employee (soft delete)
   */
  router.delete(
    '/api/v1/employees/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;

      const employee = await employeeService.deactivateEmployee(employeeId, accountId);

      successResponse(res, employee, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/employees/:id/reactivate
   * Reactivate a deactivated employee
   */
  router.post(
    '/api/v1/employees/:id/reactivate',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;

      const employee = await employeeService.reactivateEmployee(employeeId, accountId);

      successResponse(res, employee, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/employees/:id/pin
   * Set or update employee PIN
   */
  router.post(
    '/api/v1/employees/:id/pin',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;
      const input = setPinSchema.parse(req.body);

      const result = await employeeService.setPin({
        employee_id: employeeId,
        account_id: accountId,
        new_pin: input.new_pin,
        current_pin: input.current_pin
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(setPinSchema)
    ]
  );

  /**
   * DELETE /api/v1/employees/:id/pin
   * Remove employee PIN
   */
  router.delete(
    '/api/v1/employees/:id/pin',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;

      const result = await employeeService.removePin(employeeId, accountId);

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/employees/:id/verify-pin
   * Verify employee PIN (for POS login)
   */
  router.post(
    '/api/v1/employees/:id/verify-pin',
    async (req: ApiRequest, res: ApiResponse) => {
      const employeeId = req.params.id;
      const input = verifyPinSchema.parse(req.body);

      const result = await employeeService.verifyPin({
        employee_id: employeeId,
        pin: input.pin
      });

      successResponse(res, result, 200, { requestId: req.requestId });
    },
    [validateParams(z.object({ id: z.string().uuid() })), validateBody(verifyPinSchema)]
  );

  /**
   * PUT /api/v1/employees/:id/permissions
   * Update employee permissions
   */
  router.put(
    '/api/v1/employees/:id/permissions',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;
      const permissions = permissionsSchema.parse(req.body);

      const employee = await employeeService.updatePermissions(employeeId, accountId, permissions);

      successResponse(res, employee, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(permissionsSchema)
    ]
  );

  /**
   * PUT /api/v1/employees/:id/store
   * Assign employee to a store
   */
  router.put(
    '/api/v1/employees/:id/store',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const employeeId = req.params.id;
      const { store_id } = z
        .object({
          store_id: z.string().uuid().nullable()
        })
        .parse(req.body);

      const employee = await employeeService.assignToStore(employeeId, store_id, accountId);

      successResponse(res, employee, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(z.object({ store_id: z.string().uuid().nullable() }))
    ]
  );

  /**
   * GET /api/v1/employees/without-pin
   * Get employees who haven't configured their PIN
   */
  router.get(
    '/api/v1/employees/without-pin',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;

      const employees = await employeeService.getEmployeesWithoutPin(accountId);

      successResponse(res, employees, 200, { requestId: req.requestId });
    },
    [authenticate(), requireRole('owner', 'admin', 'manager')]
  );

  /**
   * GET /api/v1/stores/:storeId/employees
   * Get employees for a specific store
   */
  router.get(
    '/api/v1/stores/:storeId/employees',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const storeId = req.params.storeId;

      const employees = await employeeService.getEmployeesByStore(storeId, accountId);

      successResponse(res, employees, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ storeId: z.string().uuid() }))
    ]
  );
}
