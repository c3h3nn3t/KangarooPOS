import { db } from '../db';
import type { DatabaseAdapter } from '../db/types';

/**
 * Base service class that all services should extend
 * Provides common database access and utility methods
 */
export abstract class BaseService {
  protected db: DatabaseAdapter;

  constructor(databaseAdapter?: DatabaseAdapter) {
    this.db = databaseAdapter || db;
  }

  /**
   * Get the account ID from the request context
   * This should be set by auth middleware
   */
  protected getAccountId(req: { accountId?: string }): string {
    if (!req.accountId) {
      throw new Error('Account ID not found in request context');
    }
    return req.accountId;
  }

  /**
   * Get the user ID from the request context
   * This should be set by auth middleware
   */
  protected getUserId(req: { userId?: string }): string | null {
    return req.userId || null;
  }

  /**
   * Get the store ID from the request context
   * This should be set by auth middleware or route params
   */
  protected getStoreId(req: { storeId?: string; params?: { storeId?: string } }): string | null {
    return req.storeId || req.params?.storeId || null;
  }
}
