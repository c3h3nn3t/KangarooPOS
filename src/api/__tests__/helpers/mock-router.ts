import { vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Router, RouteHandler, Middleware } from '../../router';

// Mock request helper
export interface MockRequest extends Partial<IncomingMessage> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
  accountId?: string;
  userId?: string;
  employeeId?: string;
  storeId?: string;
  role?: string;
  requestId?: string;
}

// Mock response helper
export interface MockResponse extends Partial<ServerResponse> {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  json: (data: unknown) => void;
  status: (code: number) => MockResponse;
  setHeader: (name: string, value: string) => void;
  end: (data?: string) => void;
  headersSent: boolean;
}

export function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/json',
      ...overrides.headers
    },
    body: undefined,
    query: {},
    params: {},
    accountId: 'test-account-id',
    userId: 'test-user-id',
    employeeId: 'test-employee-id',
    storeId: 'test-store-id',
    role: 'admin',
    requestId: 'test-request-id',
    ...overrides
  };
}

export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    json: vi.fn((data: unknown) => {
      res.body = data;
      res.headers['content-type'] = 'application/json';
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name.toLowerCase()] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) {
        try {
          res.body = JSON.parse(data);
        } catch {
          res.body = data;
        }
      }
      res.headersSent = true;
    }),
    writeHead: vi.fn((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
          res.headers[key.toLowerCase()] = value;
        });
      }
      return res;
    })
  } as MockResponse;

  return res;
}

// Route collector for testing route registration
export interface CollectedRoute {
  method: string;
  path: string;
  handler: RouteHandler;
  middlewares: Middleware[];
}

export function createMockRouter(): Router & { routes: CollectedRoute[] } {
  const routes: CollectedRoute[] = [];

  const router = {
    routes,
    get: vi.fn((path: string, handler: RouteHandler, middlewares: Middleware[] = []) => {
      routes.push({ method: 'GET', path, handler, middlewares });
    }),
    post: vi.fn((path: string, handler: RouteHandler, middlewares: Middleware[] = []) => {
      routes.push({ method: 'POST', path, handler, middlewares });
    }),
    put: vi.fn((path: string, handler: RouteHandler, middlewares: Middleware[] = []) => {
      routes.push({ method: 'PUT', path, handler, middlewares });
    }),
    patch: vi.fn((path: string, handler: RouteHandler, middlewares: Middleware[] = []) => {
      routes.push({ method: 'PATCH', path, handler, middlewares });
    }),
    delete: vi.fn((path: string, handler: RouteHandler, middlewares: Middleware[] = []) => {
      routes.push({ method: 'DELETE', path, handler, middlewares });
    }),
    use: vi.fn(),
    handleRequest: vi.fn()
  } as unknown as Router & { routes: CollectedRoute[] };

  return router;
}

// Helper to find a route by method and path
export function findRoute(
  routes: CollectedRoute[],
  method: string,
  path: string
): CollectedRoute | undefined {
  return routes.find(
    (r) => r.method === method && r.path === path
  );
}

// Helper to execute a route handler with mock request/response
export async function executeRoute(
  route: CollectedRoute,
  req: MockRequest,
  res: MockResponse
): Promise<void> {
  // Execute middlewares first
  for (const middleware of route.middlewares) {
    let nextCalled = false;
    await middleware(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });
    if (!nextCalled) {
      return; // Middleware blocked the request
    }
  }

  // Execute handler
  await route.handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
}

// Test data generators
export const TEST_IDS = {
  ACCOUNT_ID: '00000000-0000-0000-0000-000000000001',
  STORE_ID: '00000000-0000-0000-0000-000000000002',
  USER_ID: '00000000-0000-0000-0000-000000000003',
  EMPLOYEE_ID: '00000000-0000-0000-0000-000000000004',
  ORDER_ID: '00000000-0000-0000-0000-000000000005',
  PRODUCT_ID: '00000000-0000-0000-0000-000000000006',
  CUSTOMER_ID: '00000000-0000-0000-0000-000000000007',
  PAYMENT_ID: '00000000-0000-0000-0000-000000000008',
  SHIFT_ID: '00000000-0000-0000-0000-000000000009',
  ITEM_ID: '00000000-0000-0000-0000-000000000010'
};

// Mock authenticated request
export function createAuthenticatedRequest(
  overrides: Partial<MockRequest> = {}
): MockRequest {
  return createMockRequest({
    accountId: TEST_IDS.ACCOUNT_ID,
    userId: TEST_IDS.USER_ID,
    employeeId: TEST_IDS.EMPLOYEE_ID,
    storeId: TEST_IDS.STORE_ID,
    role: 'admin',
    headers: {
      authorization: 'Bearer test-token',
      'x-account-id': TEST_IDS.ACCOUNT_ID,
      ...overrides.headers
    },
    ...overrides
  });
}

// Mock JSON body request
export function createJsonRequest(
  method: string,
  body: unknown,
  overrides: Partial<MockRequest> = {}
): MockRequest {
  return createAuthenticatedRequest({
    method,
    body,
    headers: {
      'content-type': 'application/json',
      ...overrides.headers
    },
    ...overrides
  });
}
