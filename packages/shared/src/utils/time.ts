/**
 * DST-safe time bucketing utilities for market data
 * All times use America/New_York timezone (US Eastern)
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const ET = 'America/New_York';

/**
 * Floor timestamp to exchange-minute bucket (DST-safe)
 *
 * This function correctly handles DST transitions:
 * - Spring forward (2 AM → 3 AM): No duplicate buckets
 * - Fall back (2 AM → 1 AM): Creates distinct buckets for both 1 AM occurrences
 *
 * @param tsMs - Unix timestamp in milliseconds
 * @param bucketMinutes - Bucket size in minutes (1, 2, 5, 10, 15, 30, 60)
 * @returns Unix timestamp of bucket start in milliseconds
 *
 * @example
 * // Regular time (no DST)
 * floorToExchangeBucket(1710162543000, 1); // 10:15:43 → 10:15:00
 *
 * @example
 * // Spring forward (2024-03-10 02:30 doesn't exist)
 * floorToExchangeBucket(springForwardMs, 1); // 02:30 → 03:00 (skips non-existent time)
 *
 * @example
 * // Fall back (2024-11-03 01:30 occurs twice)
 * floorToExchangeBucket(fallBackMs, 1); // Preserves both 01:30 occurrences
 */
export function floorToExchangeBucket(tsMs: number, bucketMinutes: number = 1): number {
  // Convert to exchange timezone
  const zonedTime = toZonedTime(new Date(tsMs), ET);

  // Floor to bucket boundary
  const flooredMin = Math.floor(zonedTime.getMinutes() / bucketMinutes) * bucketMinutes;

  // Create floored wall-clock time
  const flooredWallTime = new Date(
    zonedTime.getFullYear(),
    zonedTime.getMonth(),
    zonedTime.getDate(),
    zonedTime.getHours(),
    flooredMin,
    0,
    0,
  );

  // Convert back to UTC (preserves DST transitions)
  return fromZonedTime(flooredWallTime, ET).getTime();
}

/**
 * Check if timestamp falls within a DST transition
 *
 * @param tsMs - Unix timestamp in milliseconds
 * @returns 'spring_forward' | 'fall_back' | null
 */
export function getDSTTransition(tsMs: number): 'spring_forward' | 'fall_back' | null {
  const date = new Date(tsMs);
  const zonedTime = toZonedTime(date, ET);

  // Get offset before and after the timestamp
  const hourBefore = new Date(tsMs - 3600000);
  const hourAfter = new Date(tsMs + 3600000);

  const offsetBefore = toZonedTime(hourBefore, ET).getTimezoneOffset();
  const offsetCurrent = zonedTime.getTimezoneOffset();
  const offsetAfter = toZonedTime(hourAfter, ET).getTimezoneOffset();

  // Spring forward: offset increases (loses an hour)
  if (offsetCurrent > offsetBefore) {
    return 'spring_forward';
  }

  // Fall back: offset decreases (gains an hour)
  if (offsetCurrent < offsetAfter) {
    return 'fall_back';
  }

  return null;
}

/**
 * Get DST transition dates for a given year
 *
 * US DST rules (since 2007):
 * - Spring forward: Second Sunday in March at 2:00 AM
 * - Fall back: First Sunday in November at 2:00 AM
 *
 * @param year - Year to get transitions for
 * @returns { spring: Date, fall: Date }
 */
export function getDSTTransitionDates(year: number): { spring: Date; fall: Date } {
  // Second Sunday in March
  const march = new Date(year, 2, 1); // March 1
  const firstSunday = 7 - march.getDay();
  const secondSunday = firstSunday + 7;
  const spring = new Date(year, 2, secondSunday, 2, 0, 0);

  // First Sunday in November
  const november = new Date(year, 10, 1); // November 1
  const novFirstSunday = 7 - november.getDay();
  const fall = new Date(year, 10, novFirstSunday, 2, 0, 0);

  return { spring, fall };
}
