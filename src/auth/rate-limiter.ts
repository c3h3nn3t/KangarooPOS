/**
 * PIN Authentication Rate Limiter
 *
 * Provides protection against brute force attacks on PIN authentication:
 * - Tracks failed attempts per employee
 * - Implements lockout after max attempts
 * - Exponential backoff for repeated failures
 * - Configurable limits and timeouts
 */

import { config } from '../config/env';
import { logger } from '../utils/logger';

interface AttemptRecord {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil: number | null;
  consecutiveFailures: number;
}

// Configuration
const PIN_MAX_ATTEMPTS = config.pin?.maxAttempts ?? 5;
const PIN_WINDOW_MS = config.pin?.windowMs ?? 15 * 60 * 1000; // 15 minutes
const PIN_LOCKOUT_MS = config.pin?.lockoutMs ?? 30 * 60 * 1000; // 30 minutes
const PIN_LOCKOUT_MULTIPLIER = config.pin?.lockoutMultiplier ?? 2;
const PIN_MAX_LOCKOUT_MS = config.pin?.maxLockoutMs ?? 24 * 60 * 60 * 1000; // 24 hours

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs: number | null;
  message: string;
}

export class PinRateLimiter {
  private attempts: Map<string, AttemptRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired records every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get a unique key for tracking attempts
   */
  private getKey(employeeId: string, storeId?: string): string {
    // Include store ID to prevent attacks across stores
    return storeId ? `${employeeId}:${storeId}` : employeeId;
  }

  /**
   * Check if an attempt should be allowed
   */
  check(employeeId: string, storeId?: string): RateLimitResult {
    const key = this.getKey(employeeId, storeId);
    const now = Date.now();
    const record = this.attempts.get(key);

    // No previous attempts
    if (!record) {
      return {
        allowed: true,
        remainingAttempts: PIN_MAX_ATTEMPTS,
        retryAfterMs: null,
        message: 'OK'
      };
    }

    // Check if locked out
    if (record.lockedUntil && record.lockedUntil > now) {
      const retryAfterMs = record.lockedUntil - now;
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs,
        message: `Account locked. Try again in ${Math.ceil(retryAfterMs / 1000 / 60)} minutes.`
      };
    }

    // Check if window has expired (reset attempts)
    if (record.lastAttempt < now - PIN_WINDOW_MS) {
      // Window expired, but keep consecutive failures for extended lockout
      return {
        allowed: true,
        remainingAttempts: PIN_MAX_ATTEMPTS,
        retryAfterMs: null,
        message: 'OK'
      };
    }

    // Check remaining attempts
    const remainingAttempts = Math.max(0, PIN_MAX_ATTEMPTS - record.attempts);

    if (remainingAttempts === 0) {
      // Apply lockout
      const lockoutMs = this.calculateLockoutDuration(record.consecutiveFailures);
      record.lockedUntil = now + lockoutMs;
      record.consecutiveFailures++;
      this.attempts.set(key, record);

      logger.warn(
        {
          employeeId,
          storeId,
          consecutiveFailures: record.consecutiveFailures,
          lockoutMs
        },
        'PIN authentication locked out'
      );

      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs: lockoutMs,
        message: `Too many failed attempts. Account locked for ${Math.ceil(lockoutMs / 1000 / 60)} minutes.`
      };
    }

    return {
      allowed: true,
      remainingAttempts,
      retryAfterMs: null,
      message: 'OK'
    };
  }

  /**
   * Record a failed attempt
   */
  recordFailure(employeeId: string, storeId?: string): RateLimitResult {
    const key = this.getKey(employeeId, storeId);
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      // First attempt
      this.attempts.set(key, {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now,
        lockedUntil: null,
        consecutiveFailures: 0
      });

      return {
        allowed: true,
        remainingAttempts: PIN_MAX_ATTEMPTS - 1,
        retryAfterMs: null,
        message: `Incorrect PIN. ${PIN_MAX_ATTEMPTS - 1} attempts remaining.`
      };
    }

    // Check if window has expired
    if (record.lastAttempt < now - PIN_WINDOW_MS) {
      // Reset attempts but keep consecutive failures
      record.attempts = 1;
      record.firstAttempt = now;
      record.lastAttempt = now;
      record.lockedUntil = null;
      this.attempts.set(key, record);

      return {
        allowed: true,
        remainingAttempts: PIN_MAX_ATTEMPTS - 1,
        retryAfterMs: null,
        message: `Incorrect PIN. ${PIN_MAX_ATTEMPTS - 1} attempts remaining.`
      };
    }

    // Increment attempts
    record.attempts++;
    record.lastAttempt = now;
    this.attempts.set(key, record);

    const remainingAttempts = Math.max(0, PIN_MAX_ATTEMPTS - record.attempts);

    if (remainingAttempts === 0) {
      // Apply lockout
      const lockoutMs = this.calculateLockoutDuration(record.consecutiveFailures);
      record.lockedUntil = now + lockoutMs;
      record.consecutiveFailures++;
      this.attempts.set(key, record);

      logger.warn(
        {
          employeeId,
          storeId,
          attempts: record.attempts,
          consecutiveFailures: record.consecutiveFailures,
          lockoutMs
        },
        'PIN authentication locked out after max attempts'
      );

      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterMs: lockoutMs,
        message: `Too many failed attempts. Account locked for ${Math.ceil(lockoutMs / 1000 / 60)} minutes.`
      };
    }

    return {
      allowed: true,
      remainingAttempts,
      retryAfterMs: null,
      message: `Incorrect PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
    };
  }

  /**
   * Record a successful attempt (reset failures)
   */
  recordSuccess(employeeId: string, storeId?: string): void {
    const key = this.getKey(employeeId, storeId);
    // Clear the record on success
    this.attempts.delete(key);

    logger.debug({ employeeId, storeId }, 'PIN authentication successful, cleared rate limit');
  }

  /**
   * Calculate lockout duration with exponential backoff
   */
  private calculateLockoutDuration(consecutiveFailures: number): number {
    // Exponential backoff: 30 min, 60 min, 120 min, etc.
    const baseMs = PIN_LOCKOUT_MS;
    const multiplier = Math.pow(PIN_LOCKOUT_MULTIPLIER, consecutiveFailures);
    return Math.min(baseMs * multiplier, PIN_MAX_LOCKOUT_MS);
  }

  /**
   * Clean up expired records
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, record] of this.attempts.entries()) {
      // Remove records that are:
      // 1. Not locked and past the window
      // 2. Locked but lockout has expired and past the window
      const windowExpired = record.lastAttempt < now - PIN_WINDOW_MS;
      const lockoutExpired = !record.lockedUntil || record.lockedUntil < now;

      if (windowExpired && lockoutExpired) {
        // Only remove if no consecutive failures, otherwise keep for exponential backoff tracking
        if (record.consecutiveFailures === 0) {
          expiredKeys.push(key);
        } else if (record.lastAttempt < now - PIN_MAX_LOCKOUT_MS) {
          // Remove very old records even with consecutive failures
          expiredKeys.push(key);
        }
      }
    }

    for (const key of expiredKeys) {
      this.attempts.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug({ count: expiredKeys.length }, 'Cleaned up expired rate limit records');
    }
  }

  /**
   * Get rate limit status for an employee (for admin/debug)
   */
  getStatus(employeeId: string, storeId?: string): AttemptRecord | null {
    const key = this.getKey(employeeId, storeId);
    return this.attempts.get(key) || null;
  }

  /**
   * Manually unlock an employee (admin function)
   */
  unlock(employeeId: string, storeId?: string): boolean {
    const key = this.getKey(employeeId, storeId);
    const record = this.attempts.get(key);

    if (record) {
      record.lockedUntil = null;
      record.attempts = 0;
      record.consecutiveFailures = 0;
      this.attempts.set(key, record);

      logger.info({ employeeId, storeId }, 'PIN rate limit manually unlocked');
      return true;
    }

    return false;
  }

  /**
   * Stop the cleanup interval (for testing/shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const pinRateLimiter = new PinRateLimiter();
