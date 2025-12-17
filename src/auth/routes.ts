import { z } from 'zod';
import { validateBody } from '../api/middleware/validation';
import { successResponse } from '../api/response';
import type { Router } from '../api/router';
import { supabase } from '../config/database';
import type { ApiRequest, ApiResponse } from '../types/api';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { authenticate, optionalAuth } from './middleware';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  account_id: z.string().uuid().optional()
});

const refreshSchema = z.object({
  refresh_token: z.string()
});

/**
 * Register authentication routes
 */
export function registerAuthRoutes(router: Router): void {
  /**
   * POST /api/v1/auth/login
   * Login with email and password
   */
  router.post(
    '/api/v1/auth/login',
    async (req: ApiRequest, res: ApiResponse) => {
      // Validate body
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError('Invalid request body', result.error.errors);
      }
      const { email, password } = result.data;

      try {
        const {
          data: { user, session },
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error || !user || !session) {
          throw new ValidationError('Invalid email or password');
        }

        // Get user details from database
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, account_id, email, name, role, is_active')
          .eq('id', user.id)
          .single();

        if (userError || !userData || !userData.is_active) {
          throw new ValidationError('User account not found or inactive');
        }

        successResponse(
          res,
          {
            user: {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              role: userData.role,
              account_id: userData.account_id
            },
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
              expires_in: session.expires_in
            }
          },
          200,
          { requestId: req.requestId }
        );
      } catch (error) {
        logger.error({ error, email }, 'Login failed');
        throw error;
      }
    },
    [validateBody(loginSchema)]
  );

  /**
   * POST /api/v1/auth/register
   * Register a new user (typically for account owners)
   */
  router.post(
    '/api/v1/auth/register',
    async (req: ApiRequest, res: ApiResponse) => {
      // Validate body first
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError('Invalid request body', result.error.errors);
      }
      const { email, password, name, account_id } = result.data;

      try {
        // Create auth user
        const {
          data: { user, session },
          error: signUpError
        } = await supabase.auth.signUp({
          email,
          password
        });

        if (signUpError || !user) {
          throw new ValidationError(
            `Registration failed: ${signUpError?.message || 'Unknown error'}`
          );
        }

        // Create user record in database
        // If account_id is provided, use it; otherwise create new account
        let finalAccountId = account_id;

        if (!finalAccountId) {
          // Create a new account for this user
          const { data: account, error: accountError } = await supabase
            .from('accounts')
            .insert({
              name: `${name}'s Business`,
              slug: email
                .split('@')[0]
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-'),
              owner_id: user.id,
              timezone: 'UTC',
              currency: 'USD',
              locale: 'en-US',
              is_active: true,
              settings: {}
            })
            .select('id')
            .single();

          if (accountError || !account) {
            throw new ValidationError('Failed to create account');
          }

          finalAccountId = account.id;
        }

        // Create user record
        const { data: userData, error: userError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            account_id: finalAccountId,
            email,
            name,
            role: 'owner',
            is_active: true
          })
          .select('id, account_id, email, name, role')
          .single();

        if (userError || !userData) {
          throw new ValidationError('Failed to create user record');
        }

        successResponse(
          res,
          {
            user: userData,
            session: session
              ? {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                  expires_at: session.expires_at,
                  expires_in: session.expires_in
                }
              : null
          },
          201,
          { requestId: req.requestId }
        );
      } catch (error) {
        logger.error({ error, email }, 'Registration failed');
        throw error;
      }
    },
    [validateBody(registerSchema), optionalAuth()]
  );

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token using refresh token
   */
  router.post(
    '/api/v1/auth/refresh',
    async (req: ApiRequest, res: ApiResponse) => {
      // Validate body
      const result = refreshSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError('Invalid request body', result.error.errors);
      }
      const { refresh_token } = result.data;

      try {
        const {
          data: { session, user },
          error
        } = await supabase.auth.refreshSession({
          refresh_token
        });

        if (error || !session || !user) {
          throw new ValidationError('Invalid or expired refresh token');
        }

        successResponse(
          res,
          {
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
              expires_in: session.expires_in
            }
          },
          200,
          { requestId: req.requestId }
        );
      } catch (error) {
        logger.error({ error }, 'Token refresh failed');
        throw error;
      }
    },
    [validateBody(refreshSchema)]
  );

  /**
   * POST /api/v1/auth/logout
   * Logout and invalidate session
   */
  router.post(
    '/api/v1/auth/logout',
    async (req: ApiRequest, res: ApiResponse) => {
      try {
        const token = req.headers.authorization?.substring(7);
        if (token) {
          await supabase.auth.signOut();
        }

        successResponse(res, { message: 'Logged out successfully' }, 200, {
          requestId: req.requestId
        });
      } catch (error) {
        logger.error({ error }, 'Logout failed');
        // Don't throw error on logout failure
        successResponse(res, { message: 'Logged out' }, 200, {
          requestId: req.requestId
        });
      }
    },
    [authenticate()]
  );

  /**
   * GET /api/v1/auth/me
   * Get current user information
   */
  router.get(
    '/api/v1/auth/me',
    async (req: ApiRequest, res: ApiResponse) => {
      if (!req.user) {
        throw new ValidationError('User not found');
      }

      successResponse(
        res,
        {
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
            account_id: req.user.account_id
          }
        },
        200,
        { requestId: req.requestId }
      );
    },
    [authenticate()]
  );
}
