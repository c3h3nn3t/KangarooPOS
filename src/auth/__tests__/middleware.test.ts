import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticate, optionalAuth, requireRole, authenticatePin, hashPin, verifyPin } from '../middleware';
import { UnauthorizedError, ForbiddenError } from '../../utils/errors';
import type { ApiRequest, ApiResponse } from '../../types/api';
import { supabase } from '../../config/database';
import { db } from '../../db';
import bcrypt from 'bcrypt';

// Mock dependencies
vi.mock('../../config/database', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn()
  }
}));

vi.mock('../../db', () => ({
  db: {
    selectOne: vi.fn()
  }
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn()
  }
}));

describe('Auth Middleware', () => {
  let mockRequest: Partial<ApiRequest>;
  let mockResponse: Partial<ApiResponse>;
  let mockNext: () => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      headers: {},
      body: {},
      query: {},
      params: {}
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn().mockResolvedValue(undefined);
  });

  describe('authenticate', () => {
    it('should authenticate user with valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };
      const mockUserData = {
        id: 'user-123',
        account_id: 'account-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin' as const,
        is_active: true,
        avatar_url: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: mockUser },
        error: null
      });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockUserData,
          error: null
        })
      });

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      const middleware = authenticate();
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockRequest.userId).toBe('user-123');
      expect(mockRequest.accountId).toBe('account-123');
      expect(mockRequest.userRole).toBe('admin');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when token is missing', async () => {
      mockRequest.headers = {};

      const middleware = authenticate();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when token is invalid', async () => {
      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      const middleware = authenticate();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError when user is inactive', async () => {
      const mockUser = { id: 'user-123' };
      const mockUserData = {
        id: 'user-123',
        account_id: 'account-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin' as const,
        is_active: false,
        avatar_url: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: mockUser },
        error: null
      });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockUserData,
          error: null
        })
      });

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      const middleware = authenticate();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('optionalAuth', () => {
    it('should set user context when token is present', async () => {
      const mockUser = { id: 'user-123' };
      const mockUserData = {
        id: 'user-123',
        account_id: 'account-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin' as const,
        is_active: true,
        avatar_url: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: mockUser },
        error: null
      });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockUserData,
          error: null
        })
      });

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      const middleware = optionalAuth();
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockRequest.userId).toBe('user-123');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user context when token is missing', async () => {
      mockRequest.headers = {};

      const middleware = optionalAuth();
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockRequest.userId).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', async () => {
      mockRequest.userRole = 'admin';

      const middleware = requireRole('admin', 'manager');
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow access when user role is higher than required', async () => {
      mockRequest.userRole = 'owner';

      const middleware = requireRole('admin', 'manager');
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when user is not authenticated', async () => {
      mockRequest.userRole = undefined;

      const middleware = requireRole('admin');
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError when user role is insufficient', async () => {
      mockRequest.userRole = 'cashier';

      const middleware = requireRole('admin', 'manager');
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('authenticatePin', () => {
    const mockEmployee = {
      id: 'employee-123',
      account_id: 'account-123',
      store_id: 'store-123',
      name: 'Test Employee',
      role: 'cashier' as const,
      is_active: true,
      pin_hash: 'hashed-pin'
    };

    it('should authenticate employee with valid PIN', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockEmployee,
          error: null
        })
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      mockRequest.body = {
        pin: '1234',
        employee_id: 'employee-123',
        store_id: 'store-123'
      };

      const middleware = authenticatePin();
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockRequest.userId).toBe('employee-123');
      expect(mockRequest.accountId).toBe('account-123');
      expect(mockRequest.employeeId).toBe('employee-123');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when PIN is missing', async () => {
      mockRequest.body = {
        employee_id: 'employee-123'
      };

      const middleware = authenticatePin();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when PIN is invalid', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockEmployee,
          error: null
        })
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      mockRequest.body = {
        pin: 'wrong-pin',
        employee_id: 'employee-123'
      };

      const middleware = authenticatePin();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should fallback to edge database when cloud fails', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Network error' }
        })
      });
      (db.selectOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockEmployee,
        error: null
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      mockRequest.body = {
        pin: '1234',
        employee_id: 'employee-123'
      };

      const middleware = authenticatePin();
      await middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext);

      expect(mockRequest.userId).toBe('employee-123');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ForbiddenError when employee is inactive', async () => {
      const inactiveEmployee = { ...mockEmployee, is_active: false };
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: inactiveEmployee,
          error: null
        })
      });

      mockRequest.body = {
        pin: '1234',
        employee_id: 'employee-123'
      };

      const middleware = authenticatePin();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError when PIN is not configured', async () => {
      const employeeWithoutPin = { ...mockEmployee, pin_hash: null };
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: employeeWithoutPin,
          error: null
        })
      });

      mockRequest.body = {
        pin: '1234',
        employee_id: 'employee-123'
      };

      const middleware = authenticatePin();
      await expect(
        middleware(mockRequest as ApiRequest, mockResponse as ApiResponse, mockNext)
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('hashPin and verifyPin', () => {
    it('should hash PIN correctly', async () => {
      const hashedPin = 'hashed-pin-value';
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue(hashedPin);

      const result = await hashPin('1234');

      expect(result).toBe(hashedPin);
      expect(bcrypt.hash).toHaveBeenCalledWith('1234', 10);
    });

    it('should verify PIN correctly', async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await verifyPin('1234', 'hashed-pin');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('1234', 'hashed-pin');
    });

    it('should return false for invalid PIN', async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await verifyPin('wrong-pin', 'hashed-pin');

      expect(result).toBe(false);
    });
  });
});

