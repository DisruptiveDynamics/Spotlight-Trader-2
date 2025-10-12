import type { Bar } from '@spotlight/shared';

export type TelemetryEventType =
  | 'bar:new'
  | 'bar:update'
  | 'tick'
  | 'indicator:vwap'
  | 'indicator:ema'
  | 'indicator:rsi'
  | 'indicator:atr'
  | 'session:levels'
  | 'volatility:bucket'
  | 'breadth:update'
  | 'timeframe:changed'
  | 'symbol:changed';

export interface TelemetryEvent<T = unknown> {
  type: TelemetryEventType;
  symbol: string;
  timeframe: string;
  timestamp: number;
  data: T;
}

export interface BarNewEvent {
  bar: Bar;
}

export interface BarUpdateEvent {
  ohlcv: {
    o?: number;
    h?: number;
    l?: number;
    c?: number;
    v?: number;
  };
}

export interface TickEvent {
  price: number;
  size: number;
  conditions?: number[];
}

export interface VwapIndicator {
  value: number;
  mode: 'session' | 'anchored';
  anchorMs?: number;
}

export interface EmaIndicator {
  period: number;
  value: number;
}

export interface RsiIndicator {
  period: number;
  value: number;
}

export interface AtrIndicator {
  period: number;
  value: number;
}

export interface SessionLevels {
  high: number;
  low: number;
  open: number;
}

export type VolatilityBucket = 'low' | 'medium' | 'high';

export interface VolatilityEvent {
  bucket: VolatilityBucket;
  atrPercentile: number;
  currentAtr: number;
}

export interface BreadthEvent {
  advances: number;
  declines: number;
  advanceDeclineRatio: number;
  newHighs?: number;
  newLows?: number;
}

export interface TimeframeChangedEvent {
  oldTimeframe: string;
  newTimeframe: string;
}

export interface SymbolChangedEvent {
  oldSymbol: string;
  newSymbol: string;
}

export type TelemetrySubscription = {
  symbol: string;
  timeframe: string;
  handler: (event: TelemetryEvent) => void;
};
