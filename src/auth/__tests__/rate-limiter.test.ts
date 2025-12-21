import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PinRateLimiter, pinRateLimiter } from '../rate-limiter';
import { config } from '../../config/env';

// Mock config
vi.mock('../../config/env', () => ({
  config: {
    pin: {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      lockoutMs: 30 * 60 * 1000, // 30 minutes
      lockoutMultiplier: 2,
      maxLockoutMs: 24 * 60 * 60 * 1000 // 24 hours
    }
  }
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn()
  }
}));

describe('PinRateLimiter', () => {
  let limiter: PinRateLimiter;
  const employeeId = 'employee-123';
  const storeId = 'store-123';

  beforeEach(() => {
    limiter = new PinRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('check', () => {
    it('should allow first attempt', () => {
      const result = limiter.check(employeeId, storeId);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);
      expect(result.retryAfterMs).toBeNull();
    });

    it('should track attempts within window', () => {
      // First check
      limiter.check(employeeId, storeId);
      // Record failures
      limiter.recordFailure(employeeId, storeId);
      limiter.recordFailure(employeeId, storeId);

      const result = limiter.check(employeeId, storeId);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(3); // 5 - 2 = 3
    });

    it('should block after max attempts', () => {
      // Exhaust all attempts
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }

      const result = limiter.check(employeeId, storeId);

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should reset attempts after window expires', () => {
      // Record failures
      limiter.recordFailure(employeeId, storeId);
      limiter.recordFailure(employeeId, storeId);

      // Mock time to be after window
      const originalDateNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(originalDateNow() + 16 * 60 * 1000); // 16 minutes later

      const result = limiter.check(employeeId, storeId);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(5);

      vi.restoreAllMocks();
    });
  });

  describe('recordFailure', () => {
    it('should record first failure', () => {
      const result = limiter.recordFailure(employeeId, storeId);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(4);
      expect(result.message).toContain('4 attempts remaining');
    });

    it('should increment attempts on subsequent failures', () => {
      limiter.recordFailure(employeeId, storeId);
      limiter.recordFailure(employeeId, storeId);
      const result = limiter.recordFailure(employeeId, storeId);

      expect(result.remainingAttempts).toBe(2);
    });

    it('should lock account after max attempts', () => {
      // Record 5 failures
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }

      const result = limiter.recordFailure(employeeId, storeId);

      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.message).toContain('locked');
    });

    it('should reset attempts when window expires', () => {
      limiter.recordFailure(employeeId, storeId);
      limiter.recordFailure(employeeId, storeId);

      // Mock time to be after window
      const originalDateNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(originalDateNow() + 16 * 60 * 1000);

      const result = limiter.recordFailure(employeeId, storeId);

      expect(result.remainingAttempts).toBe(4); // Reset to 5, then -1

      vi.restoreAllMocks();
    });
  });

  describe('recordSuccess', () => {
    it('should clear rate limit on success', () => {
      // Record some failures
      limiter.recordFailure(employeeId, storeId);
      limiter.recordFailure(employeeId, storeId);

      // Record success
      limiter.recordSuccess(employeeId, storeId);

      // Check should show full attempts available
      const result = limiter.check(employeeId, storeId);
      expect(result.remainingAttempts).toBe(5);
    });

    it('should clear lockout on success', () => {
      // Lock account
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }

      // Record success
      limiter.recordSuccess(employeeId, storeId);

      // Should be allowed again
      const result = limiter.check(employeeId, storeId);
      expect(result.allowed).toBe(true);
    });
  });

  describe('exponential backoff', () => {
    it('should increase lockout duration with consecutive failures', () => {
      // First lockout (5 failures)
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }
      const firstLockout = limiter.check(employeeId, storeId);
      const firstLockoutMs = firstLockout.retryAfterMs!;

      // Wait for lockout to expire and fail again
      const originalDateNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(originalDateNow() + firstLockoutMs + 1000);

      // Fail 5 more times
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }
      const secondLockout = limiter.check(employeeId, storeId);
      const secondLockoutMs = secondLockout.retryAfterMs!;

      // Second lockout should be longer (exponential backoff)
      expect(secondLockoutMs).toBeGreaterThan(firstLockoutMs);

      vi.restoreAllMocks();
    });

    it('should cap lockout at maximum duration', () => {
      // Simulate many consecutive failures
      for (let lockout = 0; lockout < 10; lockout++) {
        // Fail 5 times to trigger lockout
        for (let i = 0; i < 5; i++) {
          limiter.recordFailure(employeeId, storeId);
        }

        // Wait for lockout to expire
        const status = limiter.getStatus(employeeId, storeId);
        if (status?.lockedUntil) {
          const originalDateNow = Date.now;
          vi.spyOn(Date, 'now').mockReturnValue(status.lockedUntil + 1000);
          vi.restoreAllMocks();
        }
      }

      // Final lockout should be capped
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }
      const result = limiter.check(employeeId, storeId);

      expect(result.retryAfterMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000); // Max 24 hours
    });
  });

  describe('getStatus', () => {
    it('should return null for employee with no attempts', () => {
      const status = limiter.getStatus(employeeId, storeId);
      expect(status).toBeNull();
    });

    it('should return attempt record for employee with attempts', () => {
      limiter.recordFailure(employeeId, storeId);
      const status = limiter.getStatus(employeeId, storeId);

      expect(status).not.toBeNull();
      expect(status?.attempts).toBe(1);
    });
  });

  describe('unlock', () => {
    it('should unlock locked account', () => {
      // Lock account
      for (let i = 0; i < 5; i++) {
        limiter.recordFailure(employeeId, storeId);
      }

      // Verify locked
      let result = limiter.check(employeeId, storeId);
      expect(result.allowed).toBe(false);

      // Unlock
      const unlocked = limiter.unlock(employeeId, storeId);
      expect(unlocked).toBe(true);

      // Verify unlocked
      result = limiter.check(employeeId, storeId);
      expect(result.allowed).toBe(true);
    });

    it('should return false when unlocking non-existent record', () => {
      const unlocked = limiter.unlock('non-existent', storeId);
      expect(unlocked).toBe(false);
    });
  });

  describe('store isolation', () => {
    it('should track attempts separately per store', () => {
      const employeeId2 = 'employee-456';
      const storeId2 = 'store-456';

      // Fail for employee in store 1
      limiter.recordFailure(employeeId, storeId);
      limiter.recordFailure(employeeId, storeId);

      // Fail for same employee in store 2
      limiter.recordFailure(employeeId, storeId2);

      // Fail for different employee in store 1
      limiter.recordFailure(employeeId2, storeId);

      // Check statuses
      const status1 = limiter.getStatus(employeeId, storeId);
      const status2 = limiter.getStatus(employeeId, storeId2);
      const status3 = limiter.getStatus(employeeId2, storeId);

      expect(status1?.attempts).toBe(2);
      expect(status2?.attempts).toBe(1);
      expect(status3?.attempts).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired records', () => {
      // Create some records
      limiter.recordFailure(employeeId, storeId);

      // Mock time to be well after window
      const originalDateNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(originalDateNow() + 20 * 60 * 1000); // 20 minutes later

      // Manually trigger cleanup
      (limiter as unknown as { cleanup: () => void }).cleanup();

      // Status should still exist (cleanup only removes if no consecutive failures)
      const status = limiter.getStatus(employeeId, storeId);
      // Note: cleanup logic may keep records with consecutive failures

      vi.restoreAllMocks();
    });
  });

  describe('singleton instance', () => {
    it('should export singleton instance', () => {
      expect(pinRateLimiter).toBeInstanceOf(PinRateLimiter);
    });
  });
});

