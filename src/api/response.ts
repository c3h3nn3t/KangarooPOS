import type { ApiResponse } from '../types/api';

/**
 * Standard API response format
 */
export interface ApiResponseData<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
    version?: string;
  };
}

/**
 * Create a successful API response
 */
export function successResponse<T>(
  res: ApiResponse,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): void {
  const response: ApiResponseData<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      ...meta
    }
  };
  res.json(response, statusCode);
}

/**
 * Create a paginated API response
 */
export function paginatedResponse<T>(
  res: ApiResponse,
  data: T[],
  total: number,
  page: number,
  limit: number,
  meta?: Record<string, unknown>
): void {
  const response: ApiResponseData<{
    items: T[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> = {
    success: true,
    data: {
      items: data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      ...meta
    }
  };
  res.json(response, 200);
}

/**
 * Create an error response (already handled by router.error, but for consistency)
 */
export function errorResponse(
  res: ApiResponse,
  message: string,
  code: string,
  statusCode: number,
  details?: unknown
): void {
  res.error({
    message,
    code,
    statusCode,
    details
  });
}
