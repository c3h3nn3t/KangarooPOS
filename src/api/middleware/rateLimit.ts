import type { ApiRequest, ApiResponse, Middleware } from '../../types/api';
import { AppError } from '../../utils/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: ApiRequest) => string;
  skip?: (req: ApiRequest) => boolean;
}

const defaultOptions: RateLimitOptions = {
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }
};

// In-memory store (replace with Redis in production for distributed systems)
const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60000);

export function rateLimit(options: Partial<RateLimitOptions> = {}): Middleware {
  const opts = { ...defaultOptions, ...options };

  return async (req: ApiRequest, res: ApiResponse, next: () => Promise<void>) => {
    if (opts.skip?.(req)) {
      await next();
      return;
    }

    const key = opts.keyGenerator?.(req) ?? 'unknown';
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + opts.windowMs
      };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, opts.maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', opts.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetSeconds.toString());

    if (entry.count > opts.maxRequests) {
      res.setHeader('Retry-After', resetSeconds.toString());
      throw new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
    }

    await next();
  };
}
