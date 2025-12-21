import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createMockRequest,
  createMockResponse,
  createJsonRequest,
  createAuthenticatedRequest,
  findRoute,
  TEST_IDS
} from '../../api/__tests__/helpers/mock-router';
import { registerAuthRoutes } from '../routes';

// Mock Supabase
const mockSupabaseAuth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn()
};

const mockSupabaseFrom = vi.fn();

vi.mock('../../config/database', () => ({
  supabase: {
    auth: mockSupabaseAuth,
    from: () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    })
  }
}));

vi.mock('../../db', () => ({
  db: {
    update: vi.fn().mockResolvedValue({ data: {}, error: null })
  }
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  authenticatePin: () => vi.fn((req, _res, next) => {
    req.employeeId = TEST_IDS.EMPLOYEE_ID;
    req.accountId = TEST_IDS.ACCOUNT_ID;
    req.userRole = 'cashier';
    req.storeId = TEST_IDS.STORE_ID;
    next();
  }),
  optionalAuth: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next()),
  hashPin: vi.fn().mockResolvedValue('hashed-pin')
}));

describe('Auth Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerAuthRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all auth routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('POST /api/v1/auth/login');
      expect(paths).toContain('POST /api/v1/auth/register');
      expect(paths).toContain('POST /api/v1/auth/refresh');
      expect(paths).toContain('POST /api/v1/auth/logout');
      expect(paths).toContain('GET /api/v1/auth/me');
      expect(paths).toContain('POST /api/v1/auth/pin/login');
      expect(paths).toContain('POST /api/v1/auth/employees/:id/pin');
      expect(paths).toContain('DELETE /api/v1/auth/employees/:id/pin');
      expect(paths).toContain('GET /api/v1/auth/employees');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should validate login credentials', async () => {
      const route = findRoute(router.routes, 'POST', '/api/v1/auth/login')!;
      const req = createJsonRequest('POST', {
        email: 'invalid-email',
        password: '123'
      });
      const res = createMockResponse();

      await expect(route.handler(req as any, res as any)).rejects.toThrow();
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should validate registration data', async () => {
      const route = findRoute(router.routes, 'POST', '/api/v1/auth/register')!;
      const req = createJsonRequest('POST', {
        email: 'invalid',
        password: '123',
        name: ''
      });
      const res = createMockResponse();

      await expect(route.handler(req as any, res as any)).rejects.toThrow();
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should validate refresh token', async () => {
      const route = findRoute(router.routes, 'POST', '/api/v1/auth/refresh')!;
      const req = createJsonRequest('POST', {});
      const res = createMockResponse();

      await expect(route.handler(req as any, res as any)).rejects.toThrow();
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should handle logout request', async () => {
      const route = findRoute(router.routes, 'POST', '/api/v1/auth/logout')!;
      const req = createAuthenticatedRequest({
        method: 'POST',
        headers: { authorization: 'Bearer test-token' }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({
        success: true,
        data: expect.objectContaining({ message: expect.any(String) }),
        meta: expect.any(Object)
      });
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user info', async () => {
      const route = findRoute(router.routes, 'GET', '/api/v1/auth/me')!;
      const req = createAuthenticatedRequest({
        method: 'GET'
      });
      // Add user to request
      (req as any).user = {
        id: TEST_IDS.USER_ID,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        account_id: TEST_IDS.ACCOUNT_ID
      };
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({
        success: true,
        data: {
          user: expect.objectContaining({
            id: TEST_IDS.USER_ID,
            email: 'test@example.com'
          })
        },
        meta: expect.any(Object)
      });
    });

    it('should throw error if user not found', async () => {
      const route = findRoute(router.routes, 'GET', '/api/v1/auth/me')!;
      const req = createAuthenticatedRequest({ method: 'GET' });
      (req as any).user = null;
      const res = createMockResponse();

      await expect(route.handler(req as any, res as any)).rejects.toThrow('User not found');
    });
  });

  describe('PIN Authentication', () => {
    describe('POST /api/v1/auth/pin/login', () => {
      it('should authenticate with PIN', async () => {
        const route = findRoute(router.routes, 'POST', '/api/v1/auth/pin/login')!;
        const req = createJsonRequest('POST', {
          employee_id: TEST_IDS.EMPLOYEE_ID,
          pin: '1234',
          store_id: TEST_IDS.STORE_ID
        });
        const res = createMockResponse();

        // The authenticatePin middleware sets these
        (req as any).employeeId = TEST_IDS.EMPLOYEE_ID;
        (req as any).accountId = TEST_IDS.ACCOUNT_ID;
        (req as any).userRole = 'cashier';
        (req as any).storeId = TEST_IDS.STORE_ID;

        await route.handler(req as any, res as any);

        expect(res.body).toEqual({
          success: true,
          data: expect.objectContaining({
            employee: expect.objectContaining({
              id: TEST_IDS.EMPLOYEE_ID,
              account_id: TEST_IDS.ACCOUNT_ID,
              role: 'cashier'
            }),
            message: 'PIN authentication successful'
          }),
          meta: expect.any(Object)
        });
      });
    });

    describe('POST /api/v1/auth/employees/:id/pin', () => {
      it('should validate PIN format', async () => {
        const route = findRoute(router.routes, 'POST', '/api/v1/auth/employees/:id/pin')!;
        const req = createJsonRequest(
          'POST',
          { pin: 'abc' }, // Invalid - not digits
          { params: { id: TEST_IDS.EMPLOYEE_ID } }
        );
        const res = createMockResponse();

        await expect(route.handler(req as any, res as any)).rejects.toThrow();
      });
    });
  });

  describe('GET /api/v1/auth/employees', () => {
    it('should require store_id parameter', async () => {
      const route = findRoute(router.routes, 'GET', '/api/v1/auth/employees')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await expect(route.handler(req as any, res as any)).rejects.toThrow(
        'store_id query parameter is required'
      );
    });
  });
});
