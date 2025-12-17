import type { ApiRequest, ApiResponse, Middleware } from '../../types/api';

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultOptions: CorsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Idempotency-Key'],
  exposedHeaders: ['X-Request-ID'],
  credentials: true,
  maxAge: 86400
};

function resolveOrigin(configuredOrigin: CorsOptions['origin'], requestOrigin: string): string {
  if (typeof configuredOrigin === 'string') {
    return configuredOrigin;
  }
  if (Array.isArray(configuredOrigin)) {
    return configuredOrigin.includes(requestOrigin) ? requestOrigin : configuredOrigin[0];
  }
  if (typeof configuredOrigin === 'function') {
    return configuredOrigin(requestOrigin) ? requestOrigin : '';
  }
  return '*';
}

function setCommonHeaders(res: ApiResponse, opts: CorsOptions, allowOrigin: string): void {
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  if (opts.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (opts.exposedHeaders?.length) {
    res.setHeader('Access-Control-Expose-Headers', opts.exposedHeaders.join(', '));
  }
}

function handlePreflight(res: ApiResponse, opts: CorsOptions): void {
  res.setHeader('Access-Control-Allow-Methods', opts.methods?.join(', ') ?? '');
  res.setHeader('Access-Control-Allow-Headers', opts.allowedHeaders?.join(', ') ?? '');
  if (opts.maxAge) {
    res.setHeader('Access-Control-Max-Age', opts.maxAge.toString());
  }
  res.writeHead(204);
  res.end();
}

export function cors(options: CorsOptions = {}): Middleware {
  const opts = { ...defaultOptions, ...options };

  return async (_req: ApiRequest, res: ApiResponse, next: () => Promise<void>) => {
    const requestOrigin = _req.headers.origin ?? '*';
    const allowOrigin = resolveOrigin(opts.origin, requestOrigin);

    setCommonHeaders(res, opts, allowOrigin);

    if (_req.method === 'OPTIONS') {
      handlePreflight(res, opts);
      return;
    }

    await next();
  };
}
