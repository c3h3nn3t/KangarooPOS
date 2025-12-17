import type { z } from 'zod';
import type { ApiRequest, ApiResponse, Middleware } from '../../types/api';
import { ValidationError } from '../../utils/errors';

export function validateBody<T extends z.ZodTypeAny>(schema: T): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError('Invalid request body', result.error.errors);
    }
    req.body = result.data;
    await next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new ValidationError('Invalid query parameters', result.error.errors);
    }
    req.query = result.data;
    await next();
  };
}

export function validateParams<T extends z.ZodTypeAny>(schema: T): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      throw new ValidationError('Invalid path parameters', result.error.errors);
    }
    req.params = result.data;
    await next();
  };
}
