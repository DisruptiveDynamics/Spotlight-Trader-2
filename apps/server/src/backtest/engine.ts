/**
 * Deterministic backtest harness
 * Uses the SAME evaluator as live trading
 */

import { ruleEvaluator } from '../rules/evaluator';
import type { Rule } from '@shared/types/rules';
import type { Bar } from '../market/eventBus';
import { getHistory } from '../history/service';

export interface BacktestInput {
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | 'D';
  start: string; // ISO date
  end: string; // ISO date
  rules: Rule[];
}

export interface BacktestTrigger {
  ruleId: string;
  seq: number;
  direction: 'long' | 'short';
  confidence: number;
  ts: number;
  price: number;
}

export interface BacktestResult {
  bars: number;
  triggers: BacktestTrigger[];
  winrate?: number;
  metrics: {
    avgHoldBars: number;
    triggersPerDay: number;
    regimeBreakdown: Record<string, number>;
  };
}

/**
 * Run deterministic backtest
 */
export async function runBacktest(input: BacktestInput): Promise<BacktestResult> {
  const { symbol, timeframe, start, end, rules } = input;

  // Fetch historical bars (simplified to 1m for now)
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const limit = Math.min(Math.floor((endMs - startMs) / 60000), 50000);

  const bars = await getHistory({
    symbol,
    timeframe: '1m',
    limit,
    before: endMs,
  });

  if (bars.length === 0) {
    throw new Error('No bars found for the specified time range');
  }

  const triggers: BacktestTrigger[] = [];

  // Evaluate each bar with each rule
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;

    for (const rule of rules) {
      const result = ruleEvaluator.evaluate(rule, bar, bars.slice(0, i + 1));

      if (result.passed) {
        triggers.push({
          ruleId: rule.id,
          seq: i,
          direction: (result.signal as 'long' | 'short') || 'long',
          confidence: result.confidence || 1.0,
          ts: bar.bar_start,
          price: bar.ohlcv.c,
        });
      }
    }
  }

  // Calculate metrics
  const metrics = calculateMetrics(bars, triggers);

  return {
    bars: bars.length,
    triggers,
    metrics,
  };
}

/**
 * Calculate backtest metrics
 */
function calculateMetrics(
  bars: Bar[],
  triggers: BacktestTrigger[]
): BacktestResult['metrics'] {
  if (triggers.length === 0) {
    return {
      avgHoldBars: 0,
      triggersPerDay: 0,
      regimeBreakdown: {},
    };
  }

  // Calculate average hold bars (simplified - assumes next trigger is exit)
  let totalHoldBars = 0;
  for (let i = 0; i < triggers.length - 1; i++) {
    const holdBars = triggers[i + 1]!.seq - triggers[i]!.seq;
    totalHoldBars += holdBars;
  }
  const avgHoldBars =
    triggers.length > 1 ? totalHoldBars / (triggers.length - 1) : 0;

  // Calculate triggers per day
  const firstTs = bars[0]!.bar_start;
  const lastTs = bars[bars.length - 1]!.bar_start;
  const daysRange = (lastTs - firstTs) / (1000 * 60 * 60 * 24);
  const triggersPerDay = daysRange > 0 ? triggers.length / daysRange : 0;

  // Regime breakdown (by hour of day)
  const regimeBreakdown: Record<string, number> = {};
  for (const trigger of triggers) {
    const hour = new Date(trigger.ts).getHours();
    const key = `${hour}:00`;
    regimeBreakdown[key] = (regimeBreakdown[key] || 0) + 1;
  }

  return {
    avgHoldBars: Math.round(avgHoldBars * 10) / 10,
    triggersPerDay: Math.round(triggersPerDay * 10) / 10,
    regimeBreakdown,
  };
}

/**
 * Get backtest presets for common strategies
 */
export function getBacktestPresets() {
  return [
    {
      id: 'intraday-breakout',
      name: 'Intraday Breakout',
      description: 'LTP breakout on 1-minute bars',
      symbol: 'SPY',
      timeframe: '1m' as const,
      rules: ['ltp-breakout'], // Rule IDs
    },
    {
      id: 'ema-cross',
      name: 'EMA 20/50 Cross',
      description: 'Golden/Death cross on 5-minute bars',
      symbol: 'QQQ',
      timeframe: '5m' as const,
      rules: ['ema-20-50-cross'],
    },
    {
      id: 'vwap-reclaim',
      name: 'VWAP Reclaim',
      description: 'Price reclaims VWAP on 15-minute bars',
      symbol: 'SPY',
      timeframe: '15m' as const,
      rules: ['vwap-reclaim'],
    },
  ];
}
