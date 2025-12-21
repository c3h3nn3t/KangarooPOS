import bcrypt from 'bcrypt';
import { supabase } from '../config/database';
import { db } from '../db';
import type { ApiRequest, ApiResponse, Middleware } from '../types/api';
import type { Employee, UserRole } from '../types/database';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

const PIN_SALT_ROUNDS = 10;

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req: ApiRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Authentication middleware
 * Verifies JWT token and sets user context
 */
export function authenticate(): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('Missing or invalid authorization token');
    }

    try {
      // Verify token with Supabase
      const {
        data: { user },
        error
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedError('Invalid or expired token');
      }

      // Get user details from database
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, account_id, email, name, role, is_active, avatar_url, created_at, updated_at')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        logger.warn({ userId: user.id, error: userError }, 'User not found in database');
        throw new UnauthorizedError('User not found');
      }

      if (!userData.is_active) {
        throw new ForbiddenError('User account is inactive');
      }

      // Set user context on request
      req.userId = userData.id;
      req.accountId = userData.account_id;
      req.userRole = userData.role;
      req.user = userData as import('../types/database').User;

      await next();
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
        throw error;
      }
      logger.error({ error }, 'Authentication error');
      throw new UnauthorizedError('Authentication failed');
    }
  };
}

/**
 * Optional authentication middleware
 * Sets user context if token is present, but doesn't require it
 */
export function optionalAuth(): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    const token = extractToken(req);

    if (!token) {
      await next();
      return;
    }

    try {
      const {
        data: { user },
        error
      } = await supabase.auth.getUser(token);

      if (!error && user) {
        const { data: userData } = await supabase
          .from('users')
          .select(
            'id, account_id, email, name, role, is_active, avatar_url, created_at, updated_at'
          )
          .eq('id', user.id)
          .single();

        if (userData && userData.is_active) {
          req.userId = userData.id;
          req.accountId = userData.account_id;
          req.userRole = userData.role;
          req.user = userData as import('../types/database').User;
        }
      }
    } catch (error) {
      // Silently fail for optional auth
      logger.debug({ error }, 'Optional auth failed');
    }

    await next();
  };
}

/**
 * Role-based access control middleware
 * Requires user to have one of the specified roles
 */
export function requireRole(...allowedRoles: UserRole[]): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    if (!req.userRole) {
      throw new UnauthorizedError('Authentication required');
    }

    // Role hierarchy: owner > admin > manager > cashier/kitchen
    const roleHierarchy: Record<UserRole, number> = {
      owner: 4,
      admin: 3,
      manager: 2,
      cashier: 1,
      kitchen: 1
    };

    const userRoleLevel = roleHierarchy[req.userRole];
    const hasAccess = allowedRoles.some((role) => {
      const requiredLevel = roleHierarchy[role];
      // User can access if their role level is >= required level
      return userRoleLevel >= requiredLevel;
    });

    if (!hasAccess) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.userRole}`
      );
    }

    await next();
  };
}

/**
 * PIN-based authentication for POS devices
 * Used for offline employee authentication
 */
export function authenticatePin(): Middleware {
  return async (req: ApiRequest, _res: ApiResponse, next: () => Promise<void>) => {
    const { pin, employee_id, store_id } = req.body as {
      pin?: string;
      employee_id?: string;
      store_id?: string;
    };

    if (!pin || !employee_id) {
      throw new UnauthorizedError('PIN and employee ID required');
    }

    // Try cloud first, fall back to edge for offline support
    let employee: Employee | null = null;

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, account_id, store_id, name, role, is_active, pin_hash')
        .eq('id', employee_id)
        .single();

      if (!error && data) {
        employee = data as Employee;
      }
    } catch {
      logger.debug('Cloud auth failed, trying edge database');
    }

    // Fallback to edge database for offline authentication
    if (!employee) {
      const edgeResult = await db.selectOne<Employee>('employees', employee_id);
      if (edgeResult.data) {
        employee = edgeResult.data;
      }
    }

    if (!employee) {
      throw new UnauthorizedError('Invalid employee ID');
    }

    if (!employee.is_active) {
      throw new ForbiddenError('Employee account is inactive');
    }

    if (!employee.pin_hash) {
      throw new UnauthorizedError('Employee PIN not configured');
    }

    // Verify PIN hash
    const isValid = await bcrypt.compare(pin, employee.pin_hash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid PIN');
    }

    // Validate store_id belongs to the employee's account if provided
    let validatedStoreId = employee.store_id;
    if (store_id && store_id !== employee.store_id) {
      // Verify the store belongs to the same account
      let storeValid = false;
      try {
        const { data: store } = await supabase
          .from('stores')
          .select('id, account_id')
          .eq('id', store_id)
          .eq('account_id', employee.account_id)
          .single();

        if (store) {
          storeValid = true;
          validatedStoreId = store_id;
        }
      } catch {
        // Fallback to edge database
        const edgeResult = await db.selectOne<{ id: string; account_id: string }>('stores', store_id);
        if (edgeResult.data && edgeResult.data.account_id === employee.account_id) {
          storeValid = true;
          validatedStoreId = store_id;
        }
      }

      if (!storeValid) {
        throw new ForbiddenError('Access denied to the specified store');
      }
    }

    // Set employee context
    req.userId = employee.id;
    req.accountId = employee.account_id;
    req.userRole = employee.role;
    req.employeeId = employee.id;
    req.storeId = validatedStoreId || undefined;

    await next();
  };
}

/**
 * Hash a PIN for storage
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_SALT_ROUNDS);
}

/**
 * Verify a PIN against a hash
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
