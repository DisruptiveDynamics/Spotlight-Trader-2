import { BaseTrigger, TriggerCondition, TriggerEvent } from './base';
import { emaBatch, type Candle } from '@shared/indicators';
import { nanoid } from 'nanoid';

export class EmaPullbackTrigger extends BaseTrigger {
  private bars: Candle[] = [];

  constructor(symbol: string, timeframe: string) {
    super(symbol, timeframe, 'ema_pullback');
    this.requiredConfirmations = 2;
    this.cooldownMs = 300000; // 5 min cooldown
  }

  updateBars(bars: Candle[]): void {
    this.bars = bars;
  }

  checkConditions(): TriggerCondition[] {
    if (this.bars.length < 25) {
      return [{ name: 'insufficient_data', evaluate: () => false }];
    }

    const ema9 = emaBatch(this.bars, 9);
    const ema20 = emaBatch(this.bars, 20);
    
    const recentBars = this.bars.slice(-5);
    const recentEma9 = ema9.slice(-5);
    const recentEma20 = ema20.slice(-5);

    const condition1: TriggerCondition = {
      name: 'uptrend_9_above_20',
      evaluate: () => {
        if (recentEma9.some((v: number) => isNaN(v)) || recentEma20.some((v: number) => isNaN(v))) return false;
        
        return recentEma9.every((v9: number, i: number) => v9 > (recentEma20[i] || 0));
      },
    };

    const condition2: TriggerCondition = {
      name: 'pullback_to_9ema',
      evaluate: () => {
        const low1 = recentBars[3]?.ohlcv.l || 0;
        const low2 = recentBars[4]?.ohlcv.l || 0;
        const ema9_1 = recentEma9[3] || 0;
        const ema9_2 = recentEma9[4] || 0;

        const touchedEma = low1 <= ema9_1 * 1.003 || low2 <= ema9_2 * 1.003;
        const closeAboveEma = (recentBars[4]?.ohlcv.c || 0) > ema9_2;

        return touchedEma && closeAboveEma;
      },
    };

    const condition3: TriggerCondition = {
      name: 'shrinking_volume',
      evaluate: () => {
        const vol0 = recentBars[0]?.ohlcv.v || 0;
        const vol1 = recentBars[1]?.ohlcv.v || 0;
        const vol2 = recentBars[2]?.ohlcv.v || 0;
        const vol3 = recentBars[3]?.ohlcv.v || 0;

        const avgEarlyVol = (vol0 + vol1) / 2;
        const avgRecentVol = (vol2 + vol3) / 2;

        return avgRecentVol < avgEarlyVol * 0.8;
      },
    };

    return [condition1, condition2, condition3];
  }

  createEvent(): TriggerEvent {
    const lastBar = this.bars[this.bars.length - 1];
    const ema9 = emaBatch(this.bars, 9);
    const currentEma9 = ema9[ema9.length - 1] || 0;

    return {
      triggerId: nanoid(),
      symbol: this.symbol,
      timeframe: this.timeframe,
      setup: this.setup,
      entryZone: {
        low: currentEma9,
        high: currentEma9 * 1.005,
      },
      stop: currentEma9 * 0.992,
      confidence: 0.78,
      timestamp: lastBar?.t || Date.now(),
    };
  }
}
