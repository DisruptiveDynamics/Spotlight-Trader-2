import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Timeframe } from '../state/chartState';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface HistoryCandle {
  time: number; // Unix timestamp in seconds (for lightweight-charts)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  msEnd: number; // Original bar_end timestamp in milliseconds
}

/**
 * Fetch historical candles from the server
 */
export async function fetchHistory(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 500
): Promise<HistoryCandle[]> {
  const response = await fetch(
    `/api/history?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('Invalid history response format');
  }

  return data.map((bar: any) => ({
    time: Math.floor(bar.bar_end / 1000),
    open: bar.ohlcv.o,
    high: bar.ohlcv.h,
    low: bar.ohlcv.l,
    close: bar.ohlcv.c,
    volume: bar.ohlcv.v,
    msEnd: bar.bar_end,
  }));
}

/**
 * Calculate the session start timestamp (9:30 AM ET) for a given date
 * Handles DST transitions automatically
 */
export function sessionStartMs(
  symbol: string,
  msEnd: number,
  tz: string = 'America/New_York'
): number {
  const date = dayjs(msEnd).tz(tz);
  
  // Set to 9:30 AM ET on the same day
  const sessionStart = date
    .hour(9)
    .minute(30)
    .second(0)
    .millisecond(0);

  return sessionStart.valueOf();
}

/**
 * Check if a timestamp is within market hours (9:30 AM - 4:00 PM ET)
 */
export function isMarketHours(
  msTimestamp: number,
  tz: string = 'America/New_York'
): boolean {
  const time = dayjs(msTimestamp).tz(tz);
  const hour = time.hour();
  const minute = time.minute();

  // Before 9:30 AM
  if (hour < 9 || (hour === 9 && minute < 30)) {
    return false;
  }

  // After 4:00 PM
  if (hour >= 16) {
    return false;
  }

  return true;
}

/**
 * Check if timestamp is in premarket (before 9:30 AM ET)
 */
export function isPremarket(
  msTimestamp: number,
  tz: string = 'America/New_York'
): boolean {
  const time = dayjs(msTimestamp).tz(tz);
  const hour = time.hour();
  const minute = time.minute();

  return hour < 9 || (hour === 9 && minute < 30);
}

/**
 * Check if timestamp is after hours (after 4:00 PM ET)
 */
export function isAfterHours(
  msTimestamp: number,
  tz: string = 'America/New_York'
): boolean {
  const time = dayjs(msTimestamp).tz(tz);
  return time.hour() >= 16;
}
