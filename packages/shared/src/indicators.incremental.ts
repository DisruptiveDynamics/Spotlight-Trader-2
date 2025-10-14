/**
 * Incremental Indicator Utilities
 * High-performance single-value updates for real-time streaming data
 * 
 * These utilities maintain state and compute next indicator values without
 * recalculating entire history, enabling sub-millisecond updates.
 */

import type { Candle } from "./indicators";

/**
 * EMA State - maintains running EMA value
 */
export interface EMAState {
  value: number;
  period: number;
  multiplier: number;
  warmupCount: number;
  warmupSum: number;
}

/**
 * Initialize EMA state from scratch or from existing history
 * 
 * @param period - EMA period
 * @param initialValue - Optional starting EMA value (skip warmup)
 * @returns EMA state object
 */
export function initEMA(period: number, initialValue?: number): EMAState {
  const multiplier = 2 / (period + 1);
  
  if (initialValue !== undefined) {
    return {
      value: initialValue,
      period,
      multiplier,
      warmupCount: period,
      warmupSum: 0,
    };
  }
  
  return {
    value: NaN,
    period,
    multiplier,
    warmupCount: 0,
    warmupSum: 0,
  };
}

/**
 * Compute next EMA value incrementally
 * 
 * @param state - Current EMA state (mutated in place)
 * @param price - New price value
 * @returns Updated EMA value
 * 
 * Performance: O(1) time, O(1) space
 */
export function nextEma(state: EMAState, price: number): number {
  if (state.warmupCount < state.period) {
    state.warmupSum += price;
    state.warmupCount++;
    
    if (state.warmupCount === state.period) {
      state.value = state.warmupSum / state.period;
      return state.value;
    }
    
    return NaN;
  }
  
  state.value = (price - state.value) * state.multiplier + state.value;
  return state.value;
}

/**
 * VWAP State - maintains cumulative price-volume components
 */
export interface VWAPState {
  cumulativePV: number;
  cumulativeVolume: number;
  value: number;
}

/**
 * Initialize VWAP state
 * 
 * @param initialPV - Optional initial price-volume sum
 * @param initialVolume - Optional initial volume sum
 * @returns VWAP state object
 */
export function initVWAP(initialPV: number = 0, initialVolume: number = 0): VWAPState {
  return {
    cumulativePV: initialPV,
    cumulativeVolume: initialVolume,
    value: initialVolume > 0 ? initialPV / initialVolume : NaN,
  };
}

/**
 * Compute next VWAP value incrementally using typical price
 * 
 * @param state - Current VWAP state (mutated in place)
 * @param high - Bar high price
 * @param low - Bar low price
 * @param close - Bar close price
 * @param volume - Bar volume
 * @returns Updated VWAP value
 * 
 * Typical Price = (High + Low + Close) / 3
 * VWAP = Cumulative(Typical Price × Volume) / Cumulative(Volume)
 * 
 * Performance: O(1) time, O(1) space
 */
export function nextVwap(
  state: VWAPState,
  high: number,
  low: number,
  close: number,
  volume: number,
): number {
  const typicalPrice = (high + low + close) / 3;
  state.cumulativePV += typicalPrice * volume;
  state.cumulativeVolume += volume;
  
  state.value = state.cumulativeVolume > 0 ? state.cumulativePV / state.cumulativeVolume : NaN;
  return state.value;
}

/**
 * Reset VWAP state (e.g., at session start)
 * 
 * @param state - VWAP state to reset
 */
export function resetVwap(state: VWAPState): void {
  state.cumulativePV = 0;
  state.cumulativeVolume = 0;
  state.value = NaN;
}

/**
 * Ring Buffer - fixed-size circular buffer for rolling calculations
 */
export class RingBuffer {
  private buffer: number[];
  private head: number = 0;
  private size: number = 0;
  public readonly capacity: number;
  
  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }
  
  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }
  
  isFull(): boolean {
    return this.size === this.capacity;
  }
  
  getSize(): number {
    return this.size;
  }
  
  get(index: number): number {
    if (index < 0 || index >= this.size) {
      throw new Error(`Index ${index} out of bounds [0, ${this.size})`);
    }
    const actualIndex = (this.head - this.size + index + this.capacity) % this.capacity;
    return this.buffer[actualIndex];
  }
  
  getSum(): number {
    let sum = 0;
    for (let i = 0; i < this.size; i++) {
      sum += this.get(i);
    }
    return sum;
  }
  
  getMean(): number {
    return this.size > 0 ? this.getSum() / this.size : NaN;
  }
  
  getStdDev(mean?: number): number {
    if (this.size === 0) return NaN;
    
    const avg = mean ?? this.getMean();
    let variance = 0;
    
    for (let i = 0; i < this.size; i++) {
      const diff = this.get(i) - avg;
      variance += diff * diff;
    }
    
    return Math.sqrt(variance / this.size);
  }
}

/**
 * Bollinger Bands State - maintains rolling SMA and standard deviation
 */
export interface BollingerState {
  ringBuffer: RingBuffer;
  period: number;
  stdDevMultiplier: number;
  mid: number;
  upper: number;
  lower: number;
}

/**
 * Initialize Bollinger Bands state
 * 
 * @param period - Rolling window period (default 20)
 * @param stdDevMultiplier - Standard deviation multiplier (default 2)
 * @returns Bollinger state object
 */
export function initBollinger(period: number = 20, stdDevMultiplier: number = 2): BollingerState {
  return {
    ringBuffer: new RingBuffer(period),
    period,
    stdDevMultiplier,
    mid: NaN,
    upper: NaN,
    lower: NaN,
  };
}

/**
 * Compute next Bollinger Bands incrementally
 * 
 * @param state - Current Bollinger state (mutated in place)
 * @param price - New price value
 * @returns Updated Bollinger Bands { mid, upper, lower }
 * 
 * Mid Band = SMA(period)
 * Upper Band = Mid + (stdDev × multiplier)
 * Lower Band = Mid - (stdDev × multiplier)
 * 
 * Performance: O(n) where n = period (for std dev calculation)
 * Note: Can be optimized to O(1) with running variance if needed
 */
export function nextBollinger(
  state: BollingerState,
  price: number,
): { mid: number; upper: number; lower: number } {
  state.ringBuffer.push(price);
  
  if (!state.ringBuffer.isFull()) {
    state.mid = NaN;
    state.upper = NaN;
    state.lower = NaN;
    return { mid: state.mid, upper: state.upper, lower: state.lower };
  }
  
  state.mid = state.ringBuffer.getMean();
  const stdDev = state.ringBuffer.getStdDev(state.mid);
  
  state.upper = state.mid + state.stdDevMultiplier * stdDev;
  state.lower = state.mid - state.stdDevMultiplier * stdDev;
  
  return { mid: state.mid, upper: state.upper, lower: state.lower };
}

/**
 * Batch initialize EMA state from historical candles
 * Useful for bootstrapping real-time updates from existing history
 * 
 * @param candles - Historical candles
 * @param period - EMA period
 * @returns Initialized EMA state ready for incremental updates
 */
export function initEmaFromHistory(candles: Candle[], period: number): EMAState {
  const state = initEMA(period);
  
  for (const candle of candles) {
    nextEma(state, candle.ohlcv.c);
  }
  
  return state;
}

/**
 * Batch initialize VWAP state from historical candles
 * 
 * @param candles - Historical candles
 * @returns Initialized VWAP state ready for incremental updates
 */
export function initVwapFromHistory(candles: Candle[]): VWAPState {
  const state = initVWAP();
  
  for (const candle of candles) {
    nextVwap(state, candle.ohlcv.h, candle.ohlcv.l, candle.ohlcv.c, candle.ohlcv.v);
  }
  
  return state;
}

/**
 * Batch initialize Bollinger state from historical candles
 * 
 * @param candles - Historical candles
 * @param period - Rolling window period
 * @param stdDevMultiplier - Standard deviation multiplier
 * @returns Initialized Bollinger state ready for incremental updates
 */
export function initBollingerFromHistory(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2,
): BollingerState {
  const state = initBollinger(period, stdDevMultiplier);
  
  for (const candle of candles) {
    nextBollinger(state, candle.ohlcv.c);
  }
  
  return state;
}
