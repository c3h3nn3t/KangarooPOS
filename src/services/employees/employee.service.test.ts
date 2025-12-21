import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeService } from './employee.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { Employee } from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pin'),
    compare: vi.fn().mockImplementation((pin, hash) => Promise.resolve(pin === '1234'))
  }
}));

const mockDb: DatabaseAdapter = {
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isOnline: true,
  setOnlineStatus: vi.fn()
} as unknown as DatabaseAdapter;

describe('EmployeeService', () => {
  let service: EmployeeService;
  const accountId = 'account-123';
  const storeId = 'store-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmployeeService();
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('getEmployees', () => {
    it('should fetch employees and strip pin_hash', async () => {
      const mockEmployees: Employee[] = [
        {
          id: 'emp-1',
          account_id: accountId,
          store_id: storeId,
          name: 'John Cashier',
          email: 'john@example.com',
          role: 'cashier',
          pin_hash: 'secret-hash',
          is_active: true,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockEmployees, error: null });

      const result = await service.getEmployees(accountId);

      expect(result).toHaveLength(1);
      expect(result[0].pin_hash).toBeNull();
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getEmployees(accountId)).rejects.toThrow('Failed to fetch employees');
    });
  });

  describe('getEmployeeById', () => {
    it('should return employee without pin_hash', async () => {
      const mockEmployee: Employee = {
        id: 'emp-1',
        account_id: accountId,
        name: 'John Cashier',
        role: 'cashier',
        pin_hash: 'secret-hash',
        is_active: true,
        permissions: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockEmployee, error: null });

      const result = await service.getEmployeeById('emp-1', accountId);

      expect(result.id).toBe('emp-1');
      expect(result.pin_hash).toBeNull();
    });

    it('should throw NotFoundError when not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getEmployeeById('emp-1', accountId)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when belongs to different account', async () => {
      mockDb.selectOne.mockResolvedValue({
        data: { id: 'emp-1', account_id: 'other-account' },
        error: null
      });

      await expect(service.getEmployeeById('emp-1', accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('createEmployee', () => {
    it('should create employee without PIN', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null }); // No duplicate email
      mockDb.insert.mockResolvedValue({
        data: {
          id: 'emp-1',
          account_id: accountId,
          name: 'New Employee',
          role: 'cashier',
          pin_hash: null,
          is_active: true
        },
        error: null
      });

      const result = await service.createEmployee({
        account_id: accountId,
        name: 'New Employee',
        role: 'cashier'
      });

      expect(result.name).toBe('New Employee');
      expect(result.pin_hash).toBeNull();
    });

    it('should create employee with hashed PIN', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.insert.mockResolvedValue({
        data: {
          id: 'emp-1',
          account_id: accountId,
          name: 'New Employee',
          role: 'cashier',
          pin_hash: 'hashed-pin',
          is_active: true
        },
        error: null
      });

      const result = await service.createEmployee({
        account_id: accountId,
        name: 'New Employee',
        role: 'cashier',
        pin: '1234'
      });

      expect(mockDb.insert).toHaveBeenCalledWith('employees', expect.objectContaining({
        pin_hash: 'hashed-pin'
      }));
      expect(result.pin_hash).toBeNull(); // Stripped in response
    });

    it('should throw ValidationError for invalid PIN format', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });

      await expect(
        service.createEmployee({
          account_id: accountId,
          name: 'New Employee',
          role: 'cashier',
          pin: '12' // Too short
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for duplicate email', async () => {
      mockDb.select.mockResolvedValue({
        data: [{ id: 'emp-existing', email: 'existing@example.com' }],
        error: null
      });

      await expect(
        service.createEmployee({
          account_id: accountId,
          name: 'New Employee',
          email: 'existing@example.com',
          role: 'cashier'
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateEmployee', () => {
    it('should update employee details', async () => {
      const existing: Employee = {
        id: 'emp-1',
        account_id: accountId,
        name: 'Old Name',
        email: 'old@example.com',
        role: 'cashier',
        is_active: true,
        permissions: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: existing, error: null });
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.update.mockResolvedValue({
        data: { ...existing, name: 'New Name' },
        error: null
      });

      const result = await service.updateEmployee({
        id: 'emp-1',
        account_id: accountId,
        name: 'New Name'
      });

      expect(result.name).toBe('New Name');
    });
  });

  describe('deactivateEmployee', () => {
    it('should set is_active to false', async () => {
      const existing: Employee = {
        id: 'emp-1',
        account_id: accountId,
        name: 'Employee',
        role: 'cashier',
        is_active: true,
        permissions: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: existing, error: null });
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.update.mockResolvedValue({
        data: { ...existing, is_active: false },
        error: null
      });

      const result = await service.deactivateEmployee('emp-1', accountId);

      expect(result.is_active).toBe(false);
    });
  });

  describe('PIN Management', () => {
    describe('setPin', () => {
      it('should set new PIN', async () => {
        const existing: Employee = {
          id: 'emp-1',
          account_id: accountId,
          name: 'Employee',
          role: 'cashier',
          pin_hash: null,
          is_active: true,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: existing, error: null });
        mockDb.update.mockResolvedValue({ data: { ...existing, pin_hash: 'hashed-pin' }, error: null });

        const result = await service.setPin({
          employee_id: 'emp-1',
          account_id: accountId,
          new_pin: '5678'
        });

        expect(result.success).toBe(true);
      });

      it('should throw ValidationError for invalid PIN format', async () => {
        const existing: Employee = {
          id: 'emp-1',
          account_id: accountId,
          name: 'Employee',
          role: 'cashier',
          is_active: true,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: existing, error: null });

        await expect(
          service.setPin({
            employee_id: 'emp-1',
            account_id: accountId,
            new_pin: 'abc' // Not digits
          })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('removePin', () => {
      it('should remove PIN', async () => {
        const existing: Employee = {
          id: 'emp-1',
          account_id: accountId,
          name: 'Employee',
          role: 'cashier',
          pin_hash: 'some-hash',
          is_active: true,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: existing, error: null });
        mockDb.update.mockResolvedValue({ data: { ...existing, pin_hash: null }, error: null });

        const result = await service.removePin('emp-1', accountId);

        expect(result.success).toBe(true);
        expect(mockDb.update).toHaveBeenCalledWith('employees', 'emp-1', { pin_hash: null });
      });
    });

    describe('verifyPin', () => {
      it('should return valid:true for correct PIN', async () => {
        const existing: Employee = {
          id: 'emp-1',
          account_id: accountId,
          name: 'Employee',
          role: 'cashier',
          pin_hash: 'hashed-1234',
          is_active: true,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: existing, error: null });

        const result = await service.verifyPin({
          employee_id: 'emp-1',
          pin: '1234'
        });

        expect(result.valid).toBe(true);
        expect(result.employee?.pin_hash).toBeNull();
      });

      it('should return valid:false for incorrect PIN', async () => {
        const existing: Employee = {
          id: 'emp-1',
          account_id: accountId,
          name: 'Employee',
          role: 'cashier',
          pin_hash: 'hashed-1234',
          is_active: true,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: existing, error: null });

        const result = await service.verifyPin({
          employee_id: 'emp-1',
          pin: 'wrong'
        });

        expect(result.valid).toBe(false);
      });

      it('should return valid:false for inactive employee', async () => {
        const existing: Employee = {
          id: 'emp-1',
          account_id: accountId,
          name: 'Employee',
          role: 'cashier',
          pin_hash: 'hashed-1234',
          is_active: false,
          permissions: {},
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        mockDb.selectOne.mockResolvedValue({ data: existing, error: null });

        const result = await service.verifyPin({
          employee_id: 'emp-1',
          pin: '1234'
        });

        expect(result.valid).toBe(false);
      });
    });
  });

  describe('searchEmployees', () => {
    it('should search by store_id', async () => {
      mockDb.select.mockResolvedValue({
        data: [{ id: 'emp-1', name: 'Store Employee', store_id: storeId, pin_hash: 'hash' }],
        error: null
      });

      const result = await service.searchEmployees({
        account_id: accountId,
        store_id: storeId
      });

      expect(result).toHaveLength(1);
      expect(result[0].pin_hash).toBeNull();
    });

    it('should search by role', async () => {
      mockDb.select.mockResolvedValue({
        data: [{ id: 'emp-1', name: 'Manager', role: 'manager', pin_hash: null }],
        error: null
      });

      const result = await service.searchEmployees({
        account_id: accountId,
        role: 'manager'
      });

      expect(result).toHaveLength(1);
      expect(mockDb.select).toHaveBeenCalledWith('employees', expect.objectContaining({
        where: expect.arrayContaining([
          { column: 'role', operator: '=', value: 'manager' }
        ])
      }));
    });
  });

  describe('assignToStore', () => {
    it('should assign employee to store', async () => {
      const existing: Employee = {
        id: 'emp-1',
        account_id: accountId,
        store_id: null,
        name: 'Employee',
        role: 'cashier',
        is_active: true,
        permissions: {},
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne
        .mockResolvedValueOnce({ data: { id: storeId, account_id: accountId }, error: null }) // Store check
        .mockResolvedValueOnce({ data: existing, error: null }); // Employee check
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.update.mockResolvedValue({
        data: { ...existing, store_id: storeId },
        error: null
      });

      const result = await service.assignToStore('emp-1', storeId, accountId);

      expect(result.store_id).toBe(storeId);
    });

    it('should throw NotFoundError for invalid store', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(
        service.assignToStore('emp-1', 'invalid-store', accountId)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
