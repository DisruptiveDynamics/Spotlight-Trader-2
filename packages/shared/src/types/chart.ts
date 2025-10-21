/**
 * Type-safe chart rendering and visualization structures
 */

import type { Ohlcv } from '../indicators';

export interface ChartTooltipData {
  x: number;
  y: number;
  time: number;
  price: number;
  ohlcv?: Ohlcv;
  indicators?: Record<string, number>;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface BarWithIndicators {
  timestamp: number;
  ohlcv: Ohlcv;
  indicators?: {
    ema9?: number;
    ema20?: number;
    vwap?: number;
    volume_ma?: number;
  };
}

export interface VwapConfig {
  mode: 'session' | 'anchored' | 'rolling';
  anchorTime?: number;
  period?: number;
}

export interface ChartDataPoint {
  time: number;
  value: number;
}
