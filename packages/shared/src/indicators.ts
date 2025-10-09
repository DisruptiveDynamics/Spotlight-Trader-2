export interface Ohlcv {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Candle {
  t: number; // timestamp in ms
  ohlcv: Ohlcv;
}

/**
 * Calculate EMA (Exponential Moving Average) for a series of candles.
 *
 * @param candles - Array of candles with OHLC data
 * @param n - Period for EMA calculation
 * @returns Array of EMA values (NaN for warmup period)
 *
 * Warmup: First (n-1) values will be NaN, EMA starts from index n-1
 */
export function emaBatch(candles: Candle[], n: number): number[] {
  if (candles.length === 0 || n <= 0) return [];

  const result: number[] = new Array(candles.length);
  const multiplier = 2 / (n + 1);

  // Calculate SMA for first n candles as initial EMA
  let sum = 0;
  for (let i = 0; i < Math.min(n, candles.length); i++) {
    const candle = candles[i];
    if (!candle) continue;
    sum += candle.ohlcv.c;
    result[i] = NaN;
  }

  if (candles.length < n) return result;

  result[n - 1] = sum / n;

  // Calculate EMA for remaining candles
  for (let i = n; i < candles.length; i++) {
    const candle = candles[i];
    const prev = result[i - 1];
    if (!candle || prev === undefined) continue;
    result[i] = (candle.ohlcv.c - prev) * multiplier + prev;
  }

  return result;
}

export interface BollingerBands {
  mid: number;
  upper: number;
  lower: number;
}

/**
 * Calculate Bollinger Bands for a series of candles.
 *
 * @param candles - Array of candles with OHLC data
 * @param period - Period for SMA and standard deviation (default 20)
 * @param stdDev - Number of standard deviations (default 2)
 * @returns Array of Bollinger Band values (NaN for warmup period)
 *
 * Warmup: First (period-1) values will have NaN, bands start from index period-1
 */
export function bollingerBatch(
  candles: Candle[],
  period: number = 20,
  stdDev: number = 2
): BollingerBands[] {
  if (candles.length === 0 || period <= 0) return [];

  const result: BollingerBands[] = new Array(candles.length);

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result[i] = { mid: NaN, upper: NaN, lower: NaN };
      continue;
    }

    // Calculate SMA (middle band)
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const candle = candles[j];
      if (!candle) continue;
      sum += candle.ohlcv.c;
    }
    const sma = sum / period;

    // Calculate standard deviation
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const candle = candles[j];
      if (!candle) continue;
      const diff = candle.ohlcv.c - sma;
      variance += diff * diff;
    }
    const sd = Math.sqrt(variance / period);

    result[i] = {
      mid: sma,
      upper: sma + stdDev * sd,
      lower: sma - stdDev * sd,
    };
  }

  return result;
}

/**
 * Calculate session VWAP (Volume Weighted Average Price) from session start.
 *
 * @param candles - Array of candles with OHLC and volume data
 * @param sessionStartMs - Session start timestamp in milliseconds
 * @returns Array of VWAP values (NaN before session start)
 *
 * VWAP = Cumulative(Typical Price × Volume) / Cumulative(Volume)
 * Typical Price = (High + Low + Close) / 3
 */
export function vwapSessionBatch(candles: Candle[], sessionStartMs: number): number[] {
  if (candles.length === 0) return [];

  const result: number[] = new Array(candles.length);
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle) {
      result[i] = NaN;
      continue;
    }

    // Reset at session start
    const prevCandle = candles[i - 1];
    if (candle.t >= sessionStartMs && (i === 0 || (prevCandle && prevCandle.t < sessionStartMs))) {
      cumulativePV = 0;
      cumulativeVolume = 0;
    }

    if (candle.t < sessionStartMs) {
      result[i] = NaN;
      continue;
    }

    const typicalPrice = (candle.ohlcv.h + candle.ohlcv.l + candle.ohlcv.c) / 3;
    cumulativePV += typicalPrice * candle.ohlcv.v;
    cumulativeVolume += candle.ohlcv.v;

    result[i] = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : NaN;
  }

  return result;
}

/**
 * Calculate anchored VWAP from a specific anchor point.
 *
 * @param candles - Array of candles with OHLC and volume data
 * @param anchorMs - Anchor timestamp in milliseconds
 * @returns Array of VWAP values (NaN before anchor)
 *
 * VWAP resets at anchor point and continues cumulative calculation
 */
export function vwapAnchoredBatch(candles: Candle[], anchorMs: number): number[] {
  if (candles.length === 0) return [];

  const result: number[] = new Array(candles.length);
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  let started = false;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle) {
      result[i] = NaN;
      continue;
    }

    if (candle.t < anchorMs) {
      result[i] = NaN;
      continue;
    }

    if (!started) {
      cumulativePV = 0;
      cumulativeVolume = 0;
      started = true;
    }

    const typicalPrice = (candle.ohlcv.h + candle.ohlcv.l + candle.ohlcv.c) / 3;
    cumulativePV += typicalPrice * candle.ohlcv.v;
    cumulativeVolume += candle.ohlcv.v;

    result[i] = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : NaN;
  }

  return result;
}

/**
 * Calculate Simple Moving Average for volume.
 *
 * @param candles - Array of candles with volume data
 * @param period - Period for SMA calculation
 * @returns Array of volume SMA values (NaN for warmup period)
 */
export function volumeSmaBatch(candles: Candle[], period: number): number[] {
  if (candles.length === 0 || period <= 0) return [];

  const result: number[] = new Array(candles.length);

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result[i] = NaN;
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const candle = candles[j];
      if (!candle) continue;
      sum += candle.ohlcv.v;
    }
    result[i] = sum / period;
  }

  return result;
}
