import type { IncomingMessage, ServerResponse } from 'node:http';

import type { User, UserRole } from './database';

export interface ApiRequest extends IncomingMessage {
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  requestId: string;
  startTime: number;
  // Auth context (set by auth middleware)
  userId?: string;
  accountId?: string;
  userRole?: UserRole;
  user?: User;
  employeeId?: string;
  storeId?: string;
}

export interface ApiResponse extends ServerResponse {
  json: (data: unknown, statusCode?: number) => void;
  error: (error: ApiError) => void;
}

export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
  details?: unknown;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    requestId?: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
  requestId?: string;
}

export type ApiResponseBody<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

export type Middleware = (
  req: ApiRequest,
  res: ApiResponse,
  next: () => Promise<void>
) => Promise<void> | void;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
  middleware?: Middleware[];
}
