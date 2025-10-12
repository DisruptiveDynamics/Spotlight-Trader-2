import { BaseTrigger, TriggerCondition, TriggerEvent } from './base';
import { vwapSessionBatch, type Candle } from '@shared/indicators';
import { nanoid } from 'nanoid';

export class VwapReclaimTrigger extends BaseTrigger {
  private sessionStartMs: number;
  private bars: Candle[] = [];

  constructor(symbol: string, timeframe: string, sessionStartMs: number) {
    super(symbol, timeframe, 'vwap_reclaim');
    this.sessionStartMs = sessionStartMs;
    this.requiredConfirmations = 2;
    this.cooldownMs = 300000; // 5 min cooldown
  }

  updateBars(bars: Candle[]): void {
    this.bars = bars;
  }

  checkConditions(): TriggerCondition[] {
    if (this.bars.length < 3) {
      return [{ name: 'insufficient_data', evaluate: () => false }];
    }

    const vwapValues = vwapSessionBatch(this.bars, this.sessionStartMs);
    const recentBars = this.bars.slice(-3);
    const recentVwap = vwapValues.slice(-3);

    const condition1: TriggerCondition = {
      name: 'two_closes_above_vwap',
      evaluate: () => {
        if (recentVwap.some((v: number) => isNaN(v))) return false;
        
        const close1 = recentBars[1]?.ohlcv.c || 0;
        const close2 = recentBars[2]?.ohlcv.c || 0;
        const vwap1 = recentVwap[1] || 0;
        const vwap2 = recentVwap[2] || 0;

        return close1 > vwap1 && close2 > vwap2;
      },
    };

    const condition2: TriggerCondition = {
      name: 'volume_confirmation',
      evaluate: () => {
        const avgVol = recentBars.slice(0, -1).reduce((sum, b) => sum + (b?.ohlcv.v || 0), 0) / 2;
        const lastVol = recentBars[2]?.ohlcv.v || 0;
        
        return lastVol > avgVol * 1.2;
      },
    };

    const condition3: TriggerCondition = {
      name: 'price_structure',
      evaluate: () => {
        const low0 = recentBars[0]?.ohlcv.l || 0;
        const low1 = recentBars[1]?.ohlcv.l || 0;
        const vwap1 = recentVwap[1] || 0;

        return low0 < vwap1 && low1 > vwap1;
      },
    };

    return [condition1, condition2, condition3];
  }

  createEvent(): TriggerEvent {
    const lastBar = this.bars[this.bars.length - 1];
    const vwapValues = vwapSessionBatch(this.bars, this.sessionStartMs);
    const currentVwap = vwapValues[vwapValues.length - 1] || 0;

    return {
      triggerId: nanoid(),
      symbol: this.symbol,
      timeframe: this.timeframe,
      setup: this.setup,
      entryZone: {
        low: currentVwap,
        high: currentVwap * 1.002,
      },
      stop: currentVwap * 0.996,
      confidence: 0.72,
      timestamp: lastBar?.t || Date.now(),
    };
  }
}

export class VwapRejectTrigger extends BaseTrigger {
  private sessionStartMs: number;
  private bars: Candle[] = [];

  constructor(symbol: string, timeframe: string, sessionStartMs: number) {
    super(symbol, timeframe, 'vwap_reject');
    this.sessionStartMs = sessionStartMs;
    this.requiredConfirmations = 2;
    this.cooldownMs = 300000; // 5 min cooldown
  }

  updateBars(bars: Candle[]): void {
    this.bars = bars;
  }

  checkConditions(): TriggerCondition[] {
    if (this.bars.length < 3) {
      return [{ name: 'insufficient_data', evaluate: () => false }];
    }

    const vwapValues = vwapSessionBatch(this.bars, this.sessionStartMs);
    const recentBars = this.bars.slice(-3);
    const recentVwap = vwapValues.slice(-3);

    const condition1: TriggerCondition = {
      name: 'two_closes_below_vwap',
      evaluate: () => {
        if (recentVwap.some((v: number) => isNaN(v))) return false;
        
        const close1 = recentBars[1]?.ohlcv.c || 0;
        const close2 = recentBars[2]?.ohlcv.c || 0;
        const vwap1 = recentVwap[1] || 0;
        const vwap2 = recentVwap[2] || 0;

        return close1 < vwap1 && close2 < vwap2;
      },
    };

    const condition2: TriggerCondition = {
      name: 'volume_confirmation',
      evaluate: () => {
        const avgVol = recentBars.slice(0, -1).reduce((sum, b) => sum + (b?.ohlcv.v || 0), 0) / 2;
        const lastVol = recentBars[2]?.ohlcv.v || 0;
        
        return lastVol > avgVol * 1.2;
      },
    };

    const condition3: TriggerCondition = {
      name: 'price_structure',
      evaluate: () => {
        const high0 = recentBars[0]?.ohlcv.h || 0;
        const high1 = recentBars[1]?.ohlcv.h || 0;
        const vwap1 = recentVwap[1] || 0;

        return high0 > vwap1 && high1 < vwap1;
      },
    };

    return [condition1, condition2, condition3];
  }

  createEvent(): TriggerEvent {
    const lastBar = this.bars[this.bars.length - 1];
    const vwapValues = vwapSessionBatch(this.bars, this.sessionStartMs);
    const currentVwap = vwapValues[vwapValues.length - 1] || 0;

    return {
      triggerId: nanoid(),
      symbol: this.symbol,
      timeframe: this.timeframe,
      setup: this.setup,
      entryZone: {
        low: currentVwap * 0.998,
        high: currentVwap,
      },
      stop: currentVwap * 1.004,
      confidence: 0.68,
      timestamp: lastBar?.t || Date.now(),
    };
  }
}
