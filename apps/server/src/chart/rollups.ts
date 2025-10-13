// Deterministic roll-up engine: 1m → 2m/5m/10m/15m/30m/1h
// Ensures single source of truth and TradingView/TOS-level consistency

import { TIMEFRAME_TO_BUCKET_MIN, type Timeframe } from '@shared/types/market';
import type { Bar } from '@shared/types';

interface Bar1m {
  symbol: string;
  seq: number;
  bar_start: number;
  bar_end: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface RolledBar {
  symbol: string;
  timeframe: Timeframe;
  seq: number;
  bar_start: number;
  bar_end: number;
  ohlcv: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
}

// Floor timestamp to k-minute bucket (exchange time aware)
function floorToKMinute(tsMs: number, k: number): number {
  // Use simple UTC floor for now (exchange time handled upstream)
  const d = new Date(tsMs);
  const flooredMin = Math.floor(d.getUTCMinutes() / k) * k;
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    flooredMin,
    0,
    0
  ).getTime();
}

// Rollup from 1m bars - initial backfill for history
export function rollupFrom1m(bars1m: Bar1m[], timeframe: Timeframe): RolledBar[] {
  const k = TIMEFRAME_TO_BUCKET_MIN[timeframe];
  const kMs = k * 60000;

  if (bars1m.length === 0) return [];

  // Group 1m bars by k-minute bucket
  const buckets = new Map<number, Bar1m[]>();

  for (const bar of bars1m) {
    const bucketStart = floorToKMinute(bar.bar_start, k);
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(bar);
  }

  // Aggregate each bucket into a single rolled bar
  const rolled: RolledBar[] = [];
  let seq = 0;

  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  for (const [bucketStart, barsInBucket] of sortedBuckets) {
    if (barsInBucket.length === 0) continue;

    seq++;

    const first = barsInBucket[0]!;
    const last = barsInBucket[barsInBucket.length - 1]!;

    rolled.push({
      symbol: first.symbol,
      timeframe,
      seq,
      bar_start: bucketStart,
      bar_end: bucketStart + kMs,
      ohlcv: {
        o: first.o,
        h: Math.max(...barsInBucket.map((b) => b.h)),
        l: Math.min(...barsInBucket.map((b) => b.l)),
        c: last.c,
        v: barsInBucket.reduce((sum, b) => sum + b.v, 0),
      },
    });
  }

  return rolled;
}

// Incremental rollup: apply a new closed 1m bar to an existing higher-TF state
// Returns the updated/new rolled bar if the bucket closed, or null if still accumulating
export function apply1mCloseToRollup(
  symbol: string,
  timeframe: Timeframe,
  closed1mBar: Bar1m,
  currentRolledBar: RolledBar | null
): RolledBar | null {
  const k = TIMEFRAME_TO_BUCKET_MIN[timeframe];
  const kMs = k * 60000;
  const bucketStart = floorToKMinute(closed1mBar.bar_start, k);
  const bucketEnd = bucketStart + kMs;

  // If no current rolled bar, start a new one
  if (!currentRolledBar) {
    return {
      symbol,
      timeframe,
      seq: 1, // Caller should manage seq properly
      bar_start: bucketStart,
      bar_end: bucketEnd,
      ohlcv: {
        o: closed1mBar.o,
        h: closed1mBar.h,
        l: closed1mBar.l,
        c: closed1mBar.c,
        v: closed1mBar.v,
      },
    };
  }

  // If the 1m bar belongs to the same bucket, update the rolled bar
  if (closed1mBar.bar_start >= currentRolledBar.bar_start && closed1mBar.bar_start < currentRolledBar.bar_end) {
    return {
      ...currentRolledBar,
      ohlcv: {
        o: currentRolledBar.ohlcv.o, // Keep original open
        h: Math.max(currentRolledBar.ohlcv.h, closed1mBar.h),
        l: Math.min(currentRolledBar.ohlcv.l, closed1mBar.l),
        c: closed1mBar.c, // Latest close
        v: currentRolledBar.ohlcv.v + closed1mBar.v,
      },
    };
  }

  // If the 1m bar is in a new bucket, the current rolled bar is complete
  // Return null to signal the current bar is done, caller should emit and start new
  return null;
}
