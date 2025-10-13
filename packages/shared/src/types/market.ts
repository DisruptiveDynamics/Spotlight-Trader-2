// Market data types for Spotlight Trader
// Shared between client and server for consistent timeframe handling

export type Timeframe = "1m" | "2m" | "5m" | "10m" | "15m" | "30m" | "1h";

// Map timeframe strings to bucket size in minutes
// Used for deterministic bar aggregation from 1m base
export const TIMEFRAME_TO_BUCKET_MIN = {
  "1m": 1,
  "2m": 2,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "1h": 60,
} as const;

// Chart data point (OHLCV with timestamp)
export interface ChartPoint {
  t: number; // timestamp (ms)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

// Chart snapshot for voice AI and client consumption
export interface ChartSnapshot {
  symbol: string;
  timeframe: Timeframe;
  points: ChartPoint[];
  lastSeq?: number;
  vwap?: number; // Session VWAP (consistent with tape)
}

// Timeframe switch request/response
export interface TimeframeSwitchRequest {
  symbol: string;
  timeframe: Timeframe;
}

export interface TimeframeSwitchResponse {
  ok: boolean;
  symbol: string;
  timeframe: Timeframe;
  barsCount?: number;
  error?: string;
}
