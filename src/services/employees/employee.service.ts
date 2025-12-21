import bcrypt from 'bcrypt';
import type { SelectOptions } from '../../db/types';
import type { Employee, UserRole } from '../../types/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { BaseService } from '../base.service';

const PIN_SALT_ROUNDS = 10;

export interface CreateEmployeeInput {
  account_id: string;
  store_id?: string | null;
  user_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  pin?: string;
  hourly_rate_cents?: number | null;
  permissions?: Record<string, boolean>;
}

export interface UpdateEmployeeInput extends Partial<Omit<CreateEmployeeInput, 'account_id'>> {
  id: string;
  account_id: string;
  is_active?: boolean;
}

export interface SearchEmployeesInput {
  account_id: string;
  store_id?: string;
  role?: UserRole;
  query?: string;
  is_active?: boolean;
}

export interface SetPinInput {
  employee_id: string;
  account_id: string;
  new_pin: string;
  current_pin?: string;
}

export interface VerifyPinInput {
  employee_id: string;
  pin: string;
}

export class EmployeeService extends BaseService {
  /**
   * Validate PIN format (4-8 digits)
   */
  private validatePin(pin: string): void {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new ValidationError('PIN must be 4-8 digits');
    }
  }

  /**
   * Get employees for an account
   */
  async getEmployees(accountId: string, options?: SelectOptions): Promise<Employee[]> {
    const where = [
      { column: 'account_id', operator: '=' as const, value: accountId },
      ...(options?.where || [])
    ];

    const result = await this.db.select<Employee>('employees', {
      ...options,
      where,
      orderBy: [{ column: 'name', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to fetch employees: ${result.error}`);
    }

    // Remove sensitive data
    return result.data.map((emp) => ({
      ...emp,
      pin_hash: null
    })) as Employee[];
  }

  /**
   * Get a single employee by ID
   */
  async getEmployeeById(id: string, accountId: string): Promise<Employee> {
    const result = await this.db.selectOne<Employee>('employees', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Employee not found');
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Employee not found');
    }

    // Remove sensitive data
    return {
      ...result.data,
      pin_hash: null
    } as Employee;
  }

  /**
   * Get employee with PIN hash (for internal use only)
   */
  async getEmployeeWithPin(id: string, accountId: string): Promise<Employee> {
    const result = await this.db.selectOne<Employee>('employees', id);

    if (result.error || !result.data) {
      throw new NotFoundError('Employee not found');
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Employee not found');
    }

    return result.data;
  }

  /**
   * Search employees by name, email, or role
   */
  async searchEmployees(input: SearchEmployeesInput): Promise<Employee[]> {
    const where: Array<{
      column: string;
      operator: '=' | 'ilike';
      value: unknown;
    }> = [{ column: 'account_id', operator: '=' as const, value: input.account_id }];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    if (input.role) {
      where.push({ column: 'role', operator: '=' as const, value: input.role });
    }

    if (input.is_active !== undefined) {
      where.push({ column: 'is_active', operator: '=' as const, value: input.is_active });
    }

    if (input.query) {
      const searchTerm = `%${input.query}%`;
      where.push({ column: 'name', operator: 'ilike' as const, value: searchTerm });
    }

    const result = await this.db.select<Employee>('employees', {
      where,
      limit: 100,
      orderBy: [{ column: 'name', direction: 'asc' as const }]
    });

    if (result.error) {
      throw new Error(`Failed to search employees: ${result.error}`);
    }

    // Remove sensitive data
    return result.data.map((emp) => ({
      ...emp,
      pin_hash: null
    })) as Employee[];
  }

  /**
   * Get employees by store
   */
  async getEmployeesByStore(storeId: string, accountId: string): Promise<Employee[]> {
    return this.searchEmployees({
      account_id: accountId,
      store_id: storeId,
      is_active: true
    });
  }

  /**
   * Find employee by email
   */
  async findEmployeeByEmail(accountId: string, email: string): Promise<Employee | null> {
    const result = await this.db.select<Employee>('employees', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'email', operator: '=' as const, value: email.toLowerCase() }
      ],
      limit: 1
    });

    if (result.error || !result.data || result.data.length === 0) {
      return null;
    }

    return {
      ...result.data[0],
      pin_hash: null
    } as Employee;
  }

  /**
   * Create a new employee
   */
  async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
    // Check for duplicate email
    if (input.email) {
      const existing = await this.findEmployeeByEmail(input.account_id, input.email);
      if (existing) {
        throw new ValidationError('Employee with this email already exists');
      }
    }

    // Hash PIN if provided
    let pinHash: string | null = null;
    if (input.pin) {
      this.validatePin(input.pin);
      pinHash = await bcrypt.hash(input.pin, PIN_SALT_ROUNDS);
    }

    const employee: Partial<Employee> = {
      account_id: input.account_id,
      store_id: input.store_id || null,
      user_id: input.user_id || null,
      name: input.name.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      role: input.role,
      pin_hash: pinHash,
      hourly_rate_cents: input.hourly_rate_cents || null,
      permissions: input.permissions || {},
      is_active: true
    };

    const result = await this.db.insert<Employee>('employees', employee);

    if (result.error || !result.data) {
      throw new Error(`Failed to create employee: ${result.error || 'Unknown error'}`);
    }

    // Remove sensitive data
    return {
      ...result.data,
      pin_hash: null
    } as Employee;
  }

  /**
   * Update an employee
   */
  async updateEmployee(input: UpdateEmployeeInput): Promise<Employee> {
    const existing = await this.getEmployeeWithPin(input.id, input.account_id);

    // Check for duplicate email if changing
    if (input.email && input.email.toLowerCase() !== existing.email) {
      const duplicate = await this.findEmployeeByEmail(input.account_id, input.email);
      if (duplicate && duplicate.id !== input.id) {
        throw new ValidationError('Employee with this email already exists');
      }
    }

    const updates: Partial<Employee> = {};

    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.email !== undefined) updates.email = input.email?.trim().toLowerCase() || null;
    if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
    if (input.store_id !== undefined) updates.store_id = input.store_id || null;
    if (input.user_id !== undefined) updates.user_id = input.user_id || null;
    if (input.role !== undefined) updates.role = input.role;
    if (input.hourly_rate_cents !== undefined) updates.hourly_rate_cents = input.hourly_rate_cents;
    if (input.permissions !== undefined) updates.permissions = input.permissions;
    if (input.is_active !== undefined) updates.is_active = input.is_active;

    // Handle PIN update separately
    if (input.pin) {
      this.validatePin(input.pin);
      updates.pin_hash = await bcrypt.hash(input.pin, PIN_SALT_ROUNDS);
    }

    const result = await this.db.update<Employee>('employees', input.id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update employee: ${result.error || 'Unknown error'}`);
    }

    // Remove sensitive data
    return {
      ...result.data,
      pin_hash: null
    } as Employee;
  }

  /**
   * Deactivate an employee
   */
  async deactivateEmployee(id: string, accountId: string): Promise<Employee> {
    return this.updateEmployee({
      id,
      account_id: accountId,
      is_active: false
    });
  }

  /**
   * Reactivate an employee
   */
  async reactivateEmployee(id: string, accountId: string): Promise<Employee> {
    return this.updateEmployee({
      id,
      account_id: accountId,
      is_active: true
    });
  }

  /**
   * Set or update employee PIN
   */
  async setPin(input: SetPinInput): Promise<{ success: boolean }> {
    const employee = await this.getEmployeeWithPin(input.employee_id, input.account_id);

    // If employee has existing PIN, verify current PIN
    if (employee.pin_hash && input.current_pin) {
      const isValid = await bcrypt.compare(input.current_pin, employee.pin_hash);
      if (!isValid) {
        throw new ValidationError('Current PIN is incorrect');
      }
    }

    this.validatePin(input.new_pin);
    const pinHash = await bcrypt.hash(input.new_pin, PIN_SALT_ROUNDS);

    const result = await this.db.update<Employee>('employees', input.employee_id, {
      pin_hash: pinHash
    });

    if (result.error) {
      throw new Error(`Failed to set PIN: ${result.error}`);
    }

    return { success: true };
  }

  /**
   * Remove employee PIN
   */
  async removePin(employeeId: string, accountId: string): Promise<{ success: boolean }> {
    await this.getEmployeeById(employeeId, accountId);

    const result = await this.db.update<Employee>('employees', employeeId, {
      pin_hash: null
    });

    if (result.error) {
      throw new Error(`Failed to remove PIN: ${result.error}`);
    }

    return { success: true };
  }

  /**
   * Verify employee PIN
   */
  async verifyPin(input: VerifyPinInput): Promise<{ valid: boolean; employee?: Employee }> {
    const result = await this.db.selectOne<Employee>('employees', input.employee_id);

    if (result.error || !result.data) {
      return { valid: false };
    }

    if (!result.data.is_active) {
      return { valid: false };
    }

    if (!result.data.pin_hash) {
      return { valid: false };
    }

    const isValid = await bcrypt.compare(input.pin, result.data.pin_hash);

    if (!isValid) {
      return { valid: false };
    }

    return {
      valid: true,
      employee: {
        ...result.data,
        pin_hash: null
      } as Employee
    };
  }

  /**
   * Check if employee has PIN configured
   */
  async hasPinConfigured(employeeId: string, accountId: string): Promise<boolean> {
    const employee = await this.getEmployeeWithPin(employeeId, accountId);
    return !!employee.pin_hash;
  }

  /**
   * Update employee permissions
   */
  async updatePermissions(
    employeeId: string,
    accountId: string,
    permissions: Record<string, boolean>
  ): Promise<Employee> {
    const employee = await this.getEmployeeById(employeeId, accountId);

    const mergedPermissions = {
      ...employee.permissions,
      ...permissions
    };

    return this.updateEmployee({
      id: employeeId,
      account_id: accountId,
      permissions: mergedPermissions
    });
  }

  /**
   * Get employees without PIN (for admin notification)
   */
  async getEmployeesWithoutPin(accountId: string): Promise<Employee[]> {
    const allEmployees = await this.getEmployees(accountId, {
      where: [{ column: 'is_active', operator: '=' as const, value: true }]
    });

    // Need to check pin_hash separately since it's removed in getEmployees
    const employeesWithPinStatus = await Promise.all(
      allEmployees.map(async (emp) => {
        const hasPin = await this.hasPinConfigured(emp.id, accountId);
        return { ...emp, hasPin };
      })
    );

    return employeesWithPinStatus.filter((emp) => !emp.hasPin).map(({ hasPin: _, ...emp }) => emp);
  }

  /**
   * Assign employee to store
   */
  async assignToStore(
    employeeId: string,
    storeId: string | null,
    accountId: string
  ): Promise<Employee> {
    // Verify store belongs to account if storeId is provided
    if (storeId) {
      const storeResult = await this.db.selectOne<{ id: string; account_id: string }>(
        'stores',
        storeId
      );
      if (storeResult.error || !storeResult.data) {
        throw new NotFoundError('Store not found');
      }
      if (storeResult.data.account_id !== accountId) {
        throw new NotFoundError('Store not found');
      }
    }

    return this.updateEmployee({
      id: employeeId,
      account_id: accountId,
      store_id: storeId
    });
  }
}
