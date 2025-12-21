import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createMockRequest,
  createMockResponse,
  findRoute,
  executeRoute
} from '../../__tests__/helpers/mock-router';
import { registerHealthRoutes } from '../health';

// Mock dependencies
vi.mock('../../../config/database', () => ({
  getActiveDatabase: vi.fn(() => 'cloud'),
  isOnline: vi.fn(() => true)
}));

vi.mock('../../../config/env', () => ({
  config: {
    supabase: {
      url: 'https://test.supabase.co',
      anonKey: 'test-key'
    },
    server: {
      nodeEnv: 'test'
    },
    edge: {
      nodeId: 'edge-1',
      dbPath: ':memory:'
    },
    features: {
      offlineRefundsEnabled: true
    }
  }
}));

describe('Health Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerHealthRoutes(router);
  });

  describe('GET /health', () => {
    it('should register the route', () => {
      const route = findRoute(router.routes, 'GET', '/health');
      expect(route).toBeDefined();
    });

    it('should return health status', async () => {
      const route = findRoute(router.routes, 'GET', '/health')!;
      const req = createMockRequest({ method: 'GET', url: '/health' });
      const res = createMockResponse();

      await executeRoute(route, req, res);

      expect(res.body).toEqual({
        success: true,
        data: expect.objectContaining({
          status: 'ok',
          timestamp: expect.any(String),
          uptime: expect.any(Number)
        })
      });
    });
  });

  describe('GET /ready', () => {
    it('should register the route', () => {
      const route = findRoute(router.routes, 'GET', '/ready');
      expect(route).toBeDefined();
    });

    it('should return readiness status', async () => {
      const route = findRoute(router.routes, 'GET', '/ready')!;
      const req = createMockRequest({ method: 'GET', url: '/ready' });
      const res = createMockResponse();

      await executeRoute(route, req, res);

      expect(res.body).toEqual({
        success: true,
        data: expect.objectContaining({
          status: 'ready',
          database: 'cloud',
          online: true
        })
      });
    });
  });

  describe('GET /api/v1/status', () => {
    it('should register the route', () => {
      const route = findRoute(router.routes, 'GET', '/api/v1/status');
      expect(route).toBeDefined();
    });

    it('should return detailed status information', async () => {
      const route = findRoute(router.routes, 'GET', '/api/v1/status')!;
      const req = createMockRequest({ method: 'GET', url: '/api/v1/status' });
      const res = createMockResponse();

      await executeRoute(route, req, res);

      expect(res.body).toEqual({
        success: true,
        data: expect.objectContaining({
          version: '1.0.0',
          environment: 'test',
          supabase: {
            host: 'test.supabase.co',
            configured: true
          },
          edge: {
            nodeId: 'edge-1',
            dbPath: ':memory:'
          },
          features: {
            offlineRefundsEnabled: true
          },
          online: true,
          activeDatabase: 'cloud'
        })
      });
    });
  });

  describe('Route Registration', () => {
    it('should register all health routes', () => {
      expect(router.routes).toHaveLength(3);
      expect(router.get).toHaveBeenCalledTimes(3);
    });

    it('should not use authentication middleware', () => {
      for (const route of router.routes) {
        expect(route.middlewares).toHaveLength(0);
      }
    });
  });
});
