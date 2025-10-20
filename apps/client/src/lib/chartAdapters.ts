import type { CandlestickData, Time } from "lightweight-charts";

export function toSec(ms: number): Time {
  return Math.floor(ms / 1000) as Time;
}

export function toCandleData(b: {
  bar_start?: number;
  bar_end: number;
  ohlcv: { o: number; h: number; l: number; c: number };
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
