import type { CandlestickData, HistogramData, Time, UTCTimestamp } from "lightweight-charts";

export function toSec(ms: number): Time {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export function toCandleData(b: {
  bar_start?: number;
  bar_end: number;
  ohlcv: { o: number; h: number; l: number; c: number; v?: number };
}): CandlestickData {
  const start = b.bar_start ?? b.bar_end - 60_000;
  return {
    time: toSec(start),
    open: b.ohlcv.o,
    high: b.ohlcv.h,
    low: b.ohlcv.l,
    close: b.ohlcv.c,
  };
}

export function toVolumeData(b: {
  bar_start?: number;
  bar_end: number;
  ohlcv: { o: number; h: number; l: number; c: number; v?: number };
}): HistogramData {
  const start = b.bar_start ?? b.bar_end - 60_000;
  const value = Number.isFinite(b.ohlcv.v) ? (b.ohlcv.v as number) : 0;
  const color = b.ohlcv.c >= b.ohlcv.o ? "#16A34A" : "#DC2626";
  return {
    time: toSec(start),
    value,
    color,
  };
}
