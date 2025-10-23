import type { CandlestickData, HistogramData, Time, UTCTimestamp } from "lightweight-charts";
import { getVolumeColor } from "@shared";

/**
 * Parse timeframe string to milliseconds
 * Examples: "1m" -> 60000, "5m" -> 300000, "1h" -> 3600000
 */
export function parseTimeframeMs(tf: string): number {
  const match = tf.match(/^(\d+)([mh])$/);
  if (!match) return 60000; // Default to 1 minute
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  return 60000;
}

export function toSec(ms: number): Time {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export function toCandleData(
  b: {
    bar_start?: number;
    bar_end: number;
    ohlcv: { o: number; h: number; l: number; c: number; v?: number };
    timeframe?: string;
  }
): CandlestickData {
  const timeframeMs = b.timeframe ? parseTimeframeMs(b.timeframe) : 60_000;
  const start = b.bar_start ?? b.bar_end - timeframeMs;
  return {
    time: toSec(start),
    open: b.ohlcv.o,
    high: b.ohlcv.h,
    low: b.ohlcv.l,
    close: b.ohlcv.c,
  };
}

export function toVolumeData(
  b: {
    bar_start?: number;
    bar_end: number;
    ohlcv: { o: number; h: number; l: number; c: number; v?: number };
    timeframe?: string;
  }
): HistogramData {
  const timeframeMs = b.timeframe ? parseTimeframeMs(b.timeframe) : 60_000;
  const start = b.bar_start ?? b.bar_end - timeframeMs;
  const value = Number.isFinite(b.ohlcv.v) ? (b.ohlcv.v as number) : 0;
  
  // Apply session-aware coloring (muted during extended hours)
  const color = getVolumeColor(b.ohlcv.c, b.ohlcv.o, start);
  
  return {
    time: toSec(start),
    value,
    color,
  };
}
