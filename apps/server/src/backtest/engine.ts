/**
 * Deterministic backtest harness
 * Uses the SAME evaluator as live trading
 */

import { ruleEvaluator } from '../rules/evaluator';
import type { Rule, RuleContext } from '@shared/types/rules';
import type { Bar } from '../market/eventBus';
import { getHistory } from '../history/service';

/**
 * Custom error for backtest validation failures
 */
export class BacktestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BacktestValidationError';
  }
}

export interface BacktestInput {
  symbol: string;
  timeframe: '1m'; // Only 1m supported for now
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
 * Convert Bar to RuleContext (same as live engine)
 */
function barToContext(bar: Bar): RuleContext {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

/**
 * Run deterministic backtest
 * Uses the SAME evaluation logic as live trading
 */
export async function runBacktest(input: BacktestInput): Promise<BacktestResult> {
  const { symbol, start, end, rules } = input;

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  // Fetch historical bars (only 1m supported, enforced by type)
  const limit = Math.min(Math.floor((endMs - startMs) / 60000), 50000);

  if (limit < 1) {
    throw new BacktestValidationError(
      'Time range too short. Minimum range is 1 minute for 1m timeframe.'
    );
  }

  const bars = await getHistory({
    symbol,
    timeframe: '1m',
    limit,
    before: endMs,
  });

  if (bars.length === 0) {
    throw new BacktestValidationError(
      `No historical data available for ${symbol}. Try a different symbol or time range.`
    );
  }

  // Filter to exact time range and sort chronologically (deterministic)
  const filteredBars = bars
    .filter((b) => b.bar_start >= startMs && b.bar_start <= endMs)
    .sort((a, b) => a.bar_start - b.bar_start);

  if (filteredBars.length === 0) {
    throw new BacktestValidationError(
      `No bars found in the specified time range (${start} to ${end}). Try expanding the time window.`
    );
  }

  const triggers: BacktestTrigger[] = [];

  // Evaluate each bar with each rule (deterministic replay)
  for (let i = 0; i < filteredBars.length; i++) {
    const bar = filteredBars[i]!;
    const context = barToContext(bar);

    for (const rule of rules) {
      const result = ruleEvaluator.evaluate(rule, context, bar.seq);

      // Only trigger if rule passed and has a valid signal
      if (result.passed && result.signal && result.signal !== 'flat') {
        triggers.push({
          ruleId: rule.id,
          seq: bar.seq,
          direction: result.signal as 'long' | 'short',
          confidence: result.confidence,
          ts: bar.bar_start,
          price: bar.close,
        });
      }
    }
  }

  // Calculate metrics
  const metrics = calculateMetrics(filteredBars, triggers);

  return {
    bars: filteredBars.length,
    triggers,
    metrics,
  };
}

/**
 * Calculate backtest metrics
 */
function calculateMetrics(bars: Bar[], triggers: BacktestTrigger[]): BacktestResult['metrics'] {
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
  const avgHoldBars = triggers.length > 1 ? totalHoldBars / (triggers.length - 1) : 0;

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
 * Note: Only 1m timeframe is currently supported
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
      id: 'vwap-reclaim',
      name: 'VWAP Reclaim',
      description: 'Price reclaims VWAP on 1-minute bars',
      symbol: 'SPY',
      timeframe: '1m' as const,
      rules: ['vwap-reclaim'],
    },
    // TODO: Add 5m and 15m presets when aggregation is implemented
    // {
    //   id: 'ema-cross',
    //   name: 'EMA 20/50 Cross',
    //   description: 'Golden/Death cross on 5-minute bars',
    //   symbol: 'QQQ',
    //   timeframe: '5m' as const,
    //   rules: ['ema-20-50-cross'],
    // },
  ];
}
