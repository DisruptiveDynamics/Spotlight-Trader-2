/**
 * DST-safe time bucketing tests
 * Verifies correct behavior during spring forward and fall back transitions
 */

import { describe, it, expect } from 'vitest';

import { floorToExchangeBucket, getDSTTransition, getDSTTransitionDates } from './time.js';

describe('floorToExchangeBucket', () => {
  describe('Regular time (no DST)', () => {
    it('should floor to 1-minute bucket', () => {
      // 2024-01-15 10:15:43 ET (no DST)
      const ts = new Date('2024-01-15T15:15:43Z').getTime(); // UTC
      const floored = floorToExchangeBucket(ts, 1);
      const result = new Date(floored);

      // Should floor to 10:15:00 ET
      expect(result.getUTCHours()).toBe(15); // 10 AM ET = 3 PM UTC
      expect(result.getUTCMinutes()).toBe(15);
      expect(result.getUTCSeconds()).toBe(0);
    });

    it('should floor to 5-minute bucket', () => {
      // 2024-01-15 10:17:30 ET
      const ts = new Date('2024-01-15T15:17:30Z').getTime();
      const floored = floorToExchangeBucket(ts, 5);
      const result = new Date(floored);

      // Should floor to 10:15:00 ET
      expect(result.getUTCMinutes()).toBe(15);
      expect(result.getUTCSeconds()).toBe(0);
    });

    it('should handle exact bucket boundary', () => {
      // 2024-01-15 10:15:00 ET (exactly on boundary)
      const ts = new Date('2024-01-15T15:15:00Z').getTime();
      const floored = floorToExchangeBucket(ts, 1);

      // Should return same timestamp
      expect(floored).toBe(ts);
    });
  });

  describe('Spring forward (DST starts)', () => {
    it('should skip non-existent 2 AM hour on spring forward', () => {
      // 2024 Spring forward: March 10, 2024 at 2:00 AM → 3:00 AM
      // 2024-03-10 02:30:00 ET does not exist

      // Timestamp just before spring forward (01:59:00 ET)
      const beforeTransition = new Date('2024-03-10T06:59:00Z').getTime();
      const floored1 = floorToExchangeBucket(beforeTransition, 1);
      const result1 = new Date(floored1);

      // Should be 01:59:00 ET
      expect(result1.getUTCHours()).toBe(6);
      expect(result1.getUTCMinutes()).toBe(59);

      // Timestamp during non-existent hour (02:30:00 ET, interpreted as 03:30:00 ET)
      const duringTransition = new Date('2024-03-10T07:30:00Z').getTime();
      const floored2 = floorToExchangeBucket(duringTransition, 1);
      const result2 = new Date(floored2);

      // Should floor to 03:30:00 ET (skips 02:xx:xx)
      expect(result2.getUTCHours()).toBe(7); // 3 AM ET after spring forward
      expect(result2.getUTCMinutes()).toBe(30);
    });

    it('should handle 5-minute buckets during spring forward', () => {
      // 2024-03-10 02:07:00 ET (non-existent, becomes 03:07:00 ET)
      const ts = new Date('2024-03-10T07:07:00Z').getTime();
      const floored = floorToExchangeBucket(ts, 5);
      const result = new Date(floored);

      // Should floor to 03:05:00 ET
      expect(result.getUTCHours()).toBe(7);
      expect(result.getUTCMinutes()).toBe(5);
    });
  });

  describe('Fall back (DST ends)', () => {
    it('should create distinct buckets for both 1 AM occurrences', () => {
      // 2024 Fall back: November 3, 2024 at 2:00 AM → 1:00 AM
      // The 1:00-1:59 hour occurs twice

      // First 01:30 ET (before fall back, still in DST)
      const first130 = new Date('2024-11-03T05:30:00Z').getTime(); // 01:30 EDT
      const floored1 = floorToExchangeBucket(first130, 1);

      // Second 01:30 ET (after fall back, now in EST)
      const second130 = new Date('2024-11-03T06:30:00Z').getTime(); // 01:30 EST
      const floored2 = floorToExchangeBucket(second130, 1);

      // Both should floor to their respective 01:30:00, but have different UTC times
      expect(floored1).not.toBe(floored2);
      expect(floored2 - floored1).toBe(3600000); // 1 hour difference in UTC
    });

    it('should handle 5-minute buckets during fall back', () => {
      // First 01:17 ET (in DST)
      const ts1 = new Date('2024-11-03T05:17:00Z').getTime();
      const floored1 = floorToExchangeBucket(ts1, 5);

      // Should floor to 01:15 EDT
      const result1 = new Date(floored1);
      expect(result1.getUTCHours()).toBe(5);
      expect(result1.getUTCMinutes()).toBe(15);

      // Second 01:17 ET (in EST, after fall back)
      const ts2 = new Date('2024-11-03T06:17:00Z').getTime();
      const floored2 = floorToExchangeBucket(ts2, 5);

      // Should floor to 01:15 EST
      const result2 = new Date(floored2);
      expect(result2.getUTCHours()).toBe(6);
      expect(result2.getUTCMinutes()).toBe(15);

      // Buckets should be 1 hour apart in UTC
      expect(floored2 - floored1).toBe(3600000);
    });
  });

  describe('Market hours (9:30 AM - 4:00 PM ET)', () => {
    it('should correctly bucket market open', () => {
      // 2024-01-15 09:30:00 ET
      const marketOpen = new Date('2024-01-15T14:30:00Z').getTime();
      const floored = floorToExchangeBucket(marketOpen, 1);

      expect(floored).toBe(marketOpen); // Exactly on boundary
    });

    it('should correctly bucket market close', () => {
      // 2024-01-15 16:00:00 ET
      const marketClose = new Date('2024-01-15T21:00:00Z').getTime();
      const floored = floorToExchangeBucket(marketClose, 1);

      expect(floored).toBe(marketClose); // Exactly on boundary
    });

    it('should handle intraday buckets', () => {
      // 2024-01-15 13:45:37 ET
      const intraday = new Date('2024-01-15T18:45:37Z').getTime();
      const floored = floorToExchangeBucket(intraday, 1);
      const result = new Date(floored);

      // Should floor to 13:45:00 ET
      expect(result.getUTCHours()).toBe(18);
      expect(result.getUTCMinutes()).toBe(45);
      expect(result.getUTCSeconds()).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle midnight', () => {
      // 2024-01-15 00:00:00 ET
      const midnight = new Date('2024-01-15T05:00:00Z').getTime();
      const floored = floorToExchangeBucket(midnight, 1);

      expect(floored).toBe(midnight);
    });

    it('should handle different bucket sizes', () => {
      // 2024-01-15 10:23:00 ET
      const ts = new Date('2024-01-15T15:23:00Z').getTime();

      const floored1 = floorToExchangeBucket(ts, 1);
      const floored5 = floorToExchangeBucket(ts, 5);
      const floored15 = floorToExchangeBucket(ts, 15);
      const floored30 = floorToExchangeBucket(ts, 30);

      const result1 = new Date(floored1);
      const result5 = new Date(floored5);
      const result15 = new Date(floored15);
      const result30 = new Date(floored30);

      expect(result1.getUTCMinutes()).toBe(23);
      expect(result5.getUTCMinutes()).toBe(20);
      expect(result15.getUTCMinutes()).toBe(15);
      expect(result30.getUTCMinutes()).toBe(0);
    });
  });
});

describe('getDSTTransition', () => {
  it('should detect spring forward transition', () => {
    // During spring forward hour (2024-03-10 02:30 ET doesn't exist)
    const springTs = new Date('2024-03-10T07:00:00Z').getTime();
    const transition = getDSTTransition(springTs);

    expect(transition).toBe('spring_forward');
  });

  it('should detect fall back transition', () => {
    // During fall back hour (2024-11-03 01:30 ET occurs twice)
    const fallTs = new Date('2024-11-03T05:30:00Z').getTime();
    const transition = getDSTTransition(fallTs);

    // Should detect transition (first or second occurrence)
    expect(['spring_forward', 'fall_back', null]).toContain(transition);
  });

  it('should return null for regular time', () => {
    // Regular January time (no transition)
    const regularTs = new Date('2024-01-15T15:00:00Z').getTime();
    const transition = getDSTTransition(regularTs);

    expect(transition).toBe(null);
  });
});

describe('getDSTTransitionDates', () => {
  it('should return correct 2024 DST dates', () => {
    const { spring, fall } = getDSTTransitionDates(2024);

    // Spring forward: March 10, 2024
    expect(spring.getMonth()).toBe(2); // March (0-indexed)
    expect(spring.getDate()).toBe(10);
    expect(spring.getHours()).toBe(2);

    // Fall back: November 3, 2024
    expect(fall.getMonth()).toBe(10); // November (0-indexed)
    expect(fall.getDate()).toBe(3);
    expect(fall.getHours()).toBe(2);
  });

  it('should return correct 2025 DST dates', () => {
    const { spring, fall } = getDSTTransitionDates(2025);

    // Spring forward: March 9, 2025 (second Sunday)
    expect(spring.getMonth()).toBe(2);
    expect(spring.getDate()).toBe(9);

    // Fall back: November 2, 2025 (first Sunday)
    expect(fall.getMonth()).toBe(10);
    expect(fall.getDate()).toBe(2);
  });
});
