import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type {
  ApiRequest,
  ApiResponse,
  HttpMethod,
  Middleware,
  RouteDefinition,
  RouteHandler
} from '../types/api';
import { isAppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
  middleware: Middleware[];
}

export class Router {
  private routes: Map<string, RouteDefinition[]> = new Map();
  private globalMiddleware: Middleware[] = [];

  use(middleware: Middleware): void {
    this.globalMiddleware.push(middleware);
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    handler: RouteHandler,
    middleware: Middleware[] = []
  ): void {
    const key = method;
    if (!this.routes.has(key)) {
      this.routes.set(key, []);
    }
    this.routes.get(key)?.push({ method, path, handler, middleware });
  }

  get(path: string, handler: RouteHandler, middleware?: Middleware[]): void {
    this.addRoute('GET', path, handler, middleware);
  }

  post(path: string, handler: RouteHandler, middleware?: Middleware[]): void {
    this.addRoute('POST', path, handler, middleware);
  }

  put(path: string, handler: RouteHandler, middleware?: Middleware[]): void {
    this.addRoute('PUT', path, handler, middleware);
  }

  patch(path: string, handler: RouteHandler, middleware?: Middleware[]): void {
    this.addRoute('PATCH', path, handler, middleware);
  }

  delete(path: string, handler: RouteHandler, middleware?: Middleware[]): void {
    this.addRoute('DELETE', path, handler, middleware);
  }

  private matchRoute(method: HttpMethod, pathname: string): RouteMatch | null {
    const routes = this.routes.get(method) || [];

    for (const route of routes) {
      const params = this.matchPath(route.path, pathname);
      if (params !== null) {
        return {
          handler: route.handler,
          params,
          middleware: route.middleware || []
        };
      }
    }
    return null;
  }

  private matchPath(routePath: string, requestPath: string): Record<string, string> | null {
    const routeParts = routePath.split('/').filter(Boolean);
    const requestParts = requestPath.split('/').filter(Boolean);

    if (routeParts.length !== requestParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i];
      const requestPart = requestParts[i];

      if (routePart.startsWith(':')) {
        params[routePart.slice(1)] = requestPart;
      } else if (routePart !== requestPart) {
        return null;
      }
    }

    return params;
  }

  private parseQuery(searchParams: URLSearchParams): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of searchParams.entries()) {
      if (query[key]) {
        if (Array.isArray(query[key])) {
          (query[key] as string[]).push(value);
        } else {
          query[key] = [query[key] as string, value];
        }
      } else {
        query[key] = value;
      }
    }
    return query;
  }

  private async parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (!body) {
          resolve(undefined);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
      req.on('error', reject);
    });
  }

  private enhanceResponse(res: ServerResponse): ApiResponse {
    const enhanced = res as ApiResponse;

    enhanced.json = (data: unknown, statusCode = 200) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    enhanced.error = (error) => {
      res.writeHead(error.statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: {
            message: error.message,
            code: error.code,
            details: error.details
          }
        })
      );
    };

    return enhanced;
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const requestId = uuidv4();
    const method = (req.method || 'GET') as HttpMethod;
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    const apiReq = req as ApiRequest;
    apiReq.requestId = requestId;
    apiReq.startTime = startTime;
    apiReq.query = this.parseQuery(url.searchParams);
    apiReq.params = {};

    const apiRes = this.enhanceResponse(res);

    try {
      // Parse body for methods that have one
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        apiReq.body = await this.parseBody(req);
      }

      // Match route
      const match = this.matchRoute(method, url.pathname);

      if (!match) {
        apiRes.error({
          message: 'Not found',
          code: 'NOT_FOUND',
          statusCode: 404
        });
        return;
      }

      apiReq.params = match.params;

      // Build middleware chain
      const allMiddleware = [...this.globalMiddleware, ...match.middleware];
      let middlewareIndex = 0;

      const next = async (): Promise<void> => {
        if (middlewareIndex < allMiddleware.length) {
          const middleware = allMiddleware[middlewareIndex++];
          await middleware(apiReq, apiRes, next);
        } else {
          await match.handler(apiReq, apiRes);
        }
      };

      await next();
    } catch (error) {
      this.handleError(error, apiReq, apiRes);
    } finally {
      const duration = Date.now() - startTime;
      logger.info({
        requestId,
        method,
        path: url.pathname,
        statusCode: res.statusCode,
        duration
      });
    }
  }

  private handleError(error: unknown, req: ApiRequest, res: ApiResponse): void {
    if (isAppError(error)) {
      res.error({
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      });
      return;
    }

    logger.error({ error, requestId: req.requestId }, 'Unhandled error');

    res.error({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      statusCode: 500
    });
  }
}

export const router = new Router();
