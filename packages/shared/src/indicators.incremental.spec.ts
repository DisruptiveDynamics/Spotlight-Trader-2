/**
 * Incremental Indicators Tests
 * Validate incremental calculations match batch calculations
 */

import { describe, it, expect } from "vitest";

import type { Candle } from "./indicators";
import { emaBatch, vwapSessionBatch, bollingerBatch } from "./indicators";
import {
  initEMA,
  nextEma,
  initVWAP,
  nextVwap,
  initBollinger,
  nextBollinger,
  initEmaFromHistory,
  initVwapFromHistory,
  initBollingerFromHistory,
  RingBuffer,
} from "./indicators.incremental";

const _FLOAT_TOLERANCE = 0.0001;

/**
 * Generate deterministic test candles
 */
function generateTestCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  
  for (let i = 0; i < count; i++) {
    const t = 1000000 + i * 60000;
    const variation = Math.sin(i * 0.5) * 2;
    const open = price;
    const high = price + Math.abs(variation) + 0.5;
    const low = price - Math.abs(variation) - 0.5;
    const close = price + variation;
    const volume = 1000 + Math.floor(Math.abs(variation) * 100);
    
    candles.push({
      t,
      ohlcv: {
        o: open,
        h: high,
        l: low,
        c: close,
        v: volume,
      },
    });
    
    price = close;
  }
  
  return candles;
}

describe("RingBuffer", () => {
  it("should push and retrieve values in FIFO order", () => {
    const buffer = new RingBuffer(3);
    
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    
    expect(buffer.getSize()).toBe(3);
    expect(buffer.isFull()).toBe(true);
    expect(buffer.get(0)).toBe(1);
    expect(buffer.get(1)).toBe(2);
    expect(buffer.get(2)).toBe(3);
  });
  
  it("should overwrite oldest values when full", () => {
    const buffer = new RingBuffer(3);
    
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);
    
    expect(buffer.getSize()).toBe(3);
    expect(buffer.get(0)).toBe(2);
    expect(buffer.get(1)).toBe(3);
    expect(buffer.get(2)).toBe(4);
  });
  
  it("should calculate sum correctly", () => {
    const buffer = new RingBuffer(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    
    expect(buffer.getSum()).toBe(6);
  });
  
  it("should calculate mean correctly", () => {
    const buffer = new RingBuffer(3);
    buffer.push(2);
    buffer.push(4);
    buffer.push(6);
    
    expect(buffer.getMean()).toBe(4);
  });
  
  it("should calculate standard deviation correctly", () => {
    const buffer = new RingBuffer(3);
    buffer.push(2);
    buffer.push(4);
    buffer.push(6);
    
    const stdDev = buffer.getStdDev();
    const expected = Math.sqrt(((2-4)**2 + (4-4)**2 + (6-4)**2) / 3);
    
    expect(stdDev).toBeCloseTo(expected, 4);
  });
});

describe("EMA Incremental", () => {
  it("should match batch EMA calculation", () => {
    const candles = generateTestCandles(50);
    const period = 9;
    
    const batchResult = emaBatch(candles, period);
    
    const state = initEMA(period);
    const incrementalResult: number[] = [];
    
    for (const candle of candles) {
      const value = nextEma(state, candle.ohlcv.c);
      incrementalResult.push(value);
    }
    
    expect(incrementalResult.length).toBe(batchResult.length);
    
    for (let i = 0; i < batchResult.length; i++) {
      const batch = batchResult[i] ?? NaN;
      const incremental = incrementalResult[i] ?? NaN;
      
      if (isNaN(batch) && isNaN(incremental)) {
        continue;
      }
      
      expect(incremental).toBeCloseTo(batch, 4);
    }
  });
  
  it("should handle warmup period correctly", () => {
    const candles = generateTestCandles(20);
    const period = 9;
    
    const state = initEMA(period);
    
    for (let i = 0; i < period - 1; i++) {
      const value = nextEma(state, candles[i]!.ohlcv.c);
      expect(isNaN(value)).toBe(true);
    }
    
    const firstValidValue = nextEma(state, candles[period - 1]!.ohlcv.c);
    expect(isNaN(firstValidValue)).toBe(false);
  });
  
  it("should initialize from history correctly", () => {
    const candles = generateTestCandles(30);
    const period = 9;
    const splitIndex = 20;
    
    const historyCandles = candles.slice(0, splitIndex);
    const newCandles = candles.slice(splitIndex);
    
    const batchResult = emaBatch(candles, period);
    
    const state = initEmaFromHistory(historyCandles, period);
    const incrementalValues: number[] = historyCandles.map(() => NaN);
    incrementalValues[splitIndex - 1] = state.value;
    
    for (const candle of newCandles) {
      incrementalValues.push(nextEma(state, candle.ohlcv.c));
    }
    
    for (let i = splitIndex; i < batchResult.length; i++) {
      expect(incrementalValues[i]).toBeCloseTo(batchResult[i]!, 4);
    }
  });
});

describe("VWAP Incremental", () => {
  it("should match batch VWAP calculation", () => {
    const candles = generateTestCandles(50);
    const sessionStartMs = candles[0]!.t;
    
    const batchResult = vwapSessionBatch(candles, sessionStartMs);
    
    const state = initVWAP();
    const incrementalResult: number[] = [];
    
    for (const candle of candles) {
      const value = nextVwap(
        state,
        candle.ohlcv.h,
        candle.ohlcv.l,
        candle.ohlcv.c,
        candle.ohlcv.v,
      );
      incrementalResult.push(value);
    }
    
    expect(incrementalResult.length).toBe(batchResult.length);
    
    for (let i = 0; i < batchResult.length; i++) {
      const batch = batchResult[i] ?? NaN;
      const incremental = incrementalResult[i] ?? NaN;
      
      if (isNaN(batch) && isNaN(incremental)) {
        continue;
      }
      
      expect(incremental).toBeCloseTo(batch, 4);
    }
  });
  
  it("should accumulate typical price and volume correctly", () => {
    const state = initVWAP();
    
    nextVwap(state, 110, 100, 105, 1000);
    
    const expectedTypicalPrice = (110 + 100 + 105) / 3;
    expect(state.cumulativePV).toBeCloseTo(expectedTypicalPrice * 1000, 4);
    expect(state.cumulativeVolume).toBe(1000);
    expect(state.value).toBeCloseTo(expectedTypicalPrice, 4);
  });
  
  it("should initialize from history correctly", () => {
    const candles = generateTestCandles(30);
    const splitIndex = 20;
    
    const historyCandles = candles.slice(0, splitIndex);
    const newCandles = candles.slice(splitIndex);
    
    const batchResult = vwapSessionBatch(candles, candles[0]!.t);
    
    const state = initVwapFromHistory(historyCandles);
    const incrementalValues: number[] = historyCandles.map(() => NaN);
    incrementalValues[splitIndex - 1] = state.value;
    
    for (const candle of newCandles) {
      incrementalValues.push(
        nextVwap(state, candle.ohlcv.h, candle.ohlcv.l, candle.ohlcv.c, candle.ohlcv.v),
      );
    }
    
    for (let i = splitIndex; i < batchResult.length; i++) {
      expect(incrementalValues[i]).toBeCloseTo(batchResult[i]!, 4);
    }
  });
});

describe("Bollinger Bands Incremental", () => {
  it("should match batch Bollinger calculation", () => {
    const candles = generateTestCandles(50);
    const period = 20;
    const stdDev = 2;
    
    const batchResult = bollingerBatch(candles, period, stdDev);
    
    const state = initBollinger(period, stdDev);
    const incrementalResult: { mid: number; upper: number; lower: number }[] = [];
    
    for (const candle of candles) {
      const value = nextBollinger(state, candle.ohlcv.c);
      incrementalResult.push(value);
    }
    
    expect(incrementalResult.length).toBe(batchResult.length);
    
    for (let i = 0; i < batchResult.length; i++) {
      const batch = batchResult[i]!;
      const incremental = incrementalResult[i]!;
      
      if (isNaN(batch.mid) && isNaN(incremental.mid)) {
        continue;
      }
      
      expect(incremental.mid).toBeCloseTo(batch.mid, 3);
      expect(incremental.upper).toBeCloseTo(batch.upper, 3);
      expect(incremental.lower).toBeCloseTo(batch.lower, 3);
    }
  });
  
  it("should handle warmup period correctly", () => {
    const candles = generateTestCandles(30);
    const period = 20;
    
    const state = initBollinger(period);
    
    for (let i = 0; i < period - 1; i++) {
      const value = nextBollinger(state, candles[i]!.ohlcv.c);
      expect(isNaN(value.mid)).toBe(true);
      expect(isNaN(value.upper)).toBe(true);
      expect(isNaN(value.lower)).toBe(true);
    }
    
    const firstValidValue = nextBollinger(state, candles[period - 1]!.ohlcv.c);
    expect(isNaN(firstValidValue.mid)).toBe(false);
    expect(isNaN(firstValidValue.upper)).toBe(false);
    expect(isNaN(firstValidValue.lower)).toBe(false);
  });
  
  it("should initialize from history correctly", () => {
    const candles = generateTestCandles(40);
    const period = 20;
    const stdDev = 2;
    const splitIndex = 30;
    
    const historyCandles = candles.slice(0, splitIndex);
    const newCandles = candles.slice(splitIndex);
    
    const batchResult = bollingerBatch(candles, period, stdDev);
    
    const state = initBollingerFromHistory(historyCandles, period, stdDev);
    const incrementalValues: { mid: number; upper: number; lower: number }[] = 
      historyCandles.map(() => ({ mid: NaN, upper: NaN, lower: NaN }));
    incrementalValues[splitIndex - 1] = { 
      mid: state.mid, 
      upper: state.upper, 
      lower: state.lower 
    };
    
    for (const candle of newCandles) {
      incrementalValues.push(nextBollinger(state, candle.ohlcv.c));
    }
    
    for (let i = splitIndex; i < batchResult.length; i++) {
      expect(incrementalValues[i]!.mid).toBeCloseTo(batchResult[i]!.mid, 3);
      expect(incrementalValues[i]!.upper).toBeCloseTo(batchResult[i]!.upper, 3);
      expect(incrementalValues[i]!.lower).toBeCloseTo(batchResult[i]!.lower, 3);
    }
  });
});

describe("Performance Comparison", () => {
  it("incremental updates should be faster than batch recalculation", () => {
    const candles = generateTestCandles(1000);
    const period = 20;
    
    const batchStart = performance.now();
    for (let i = 0; i < 100; i++) {
      bollingerBatch(candles, period);
    }
    const batchTime = performance.now() - batchStart;
    
    const state = initBollingerFromHistory(candles.slice(0, -100), period);
    const lastCandles = candles.slice(-100);
    
    const incrementalStart = performance.now();
    for (const candle of lastCandles) {
      nextBollinger(state, candle.ohlcv.c);
    }
    const incrementalTime = performance.now() - incrementalStart;
    
    console.log(`Batch: ${batchTime.toFixed(2)}ms, Incremental: ${incrementalTime.toFixed(2)}ms`);
    console.log(`Speedup: ${(batchTime / incrementalTime).toFixed(1)}x faster`);
    
    expect(incrementalTime).toBeLessThan(batchTime);
  });
});
