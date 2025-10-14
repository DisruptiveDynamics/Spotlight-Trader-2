import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import type { Timeframe } from "../state/chartState";
import { HISTORY_URL } from "../config";

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
  limit: number = 500,
): Promise<HistoryCandle[]> {
  const response = await fetch(
    `${HISTORY_URL}?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`,
    {
      credentials: "include", // Include cookies for authentication
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Invalid history response format");
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
  tz: string = "America/New_York",
): number {
  const date = toZonedTime(msEnd, tz);

  // Set to 9:30 AM ET on the same day
  const sessionStart = setMilliseconds(setSeconds(setMinutes(setHours(date, 9), 30), 0), 0);

  return fromZonedTime(sessionStart, tz).getTime();
}

/**
 * Check if a timestamp is within market hours (9:30 AM - 4:00 PM ET)
 */
export function isMarketHours(msTimestamp: number, tz: string = "America/New_York"): boolean {
  const time = toZonedTime(msTimestamp, tz);
  const hour = time.getHours();
  const minute = time.getMinutes();

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
export function isPremarket(msTimestamp: number, tz: string = "America/New_York"): boolean {
  const time = toZonedTime(msTimestamp, tz);
  const hour = time.getHours();
  const minute = time.getMinutes();

  return hour < 9 || (hour === 9 && minute < 30);
}

/**
 * Check if timestamp is after hours (after 4:00 PM ET)
 */
export function isAfterHours(msTimestamp: number, tz: string = "America/New_York"): boolean {
  const time = toZonedTime(msTimestamp, tz);
  return time.getHours() >= 16;
}
