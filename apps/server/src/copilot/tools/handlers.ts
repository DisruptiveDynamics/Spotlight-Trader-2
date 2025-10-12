import type {
  GetChartSnapshotParams,
  ChartSnapshot,
  SubscribeMarketStreamParams,
  SubscribeMarketStreamResult,
  ProposeCalloutParams,
  CalloutResult,
  ProposeEntryExitParams,
  EntryExitProposal,
  EvaluateRulesParams,
  RulesEvaluation,
  LogJournalEventParams,
  JournalEventResult,
  SummarizeSessionParams,
  SessionSummary,
  GetPatternSummaryParams,
  PatternSummary,
  GetRecommendedRiskBoxParams,
  RiskBox,
  GenerateTradePlanParams,
  TradePlan,
} from './types';
import { patternMemory } from '../patterns/lookup';
import { rulesSentinel } from '../sentinel';
import { nanoid } from 'nanoid';
import { db } from '@server/db';
import { callouts, journalEvents } from '@server/db/schema';
import { copilotBroadcaster } from '../broadcaster';
import { perfMonitor } from '../performance';
import { ringBuffer } from '@server/cache/ring';

export async function getChartSnapshot(
  params: GetChartSnapshotParams
): Promise<ChartSnapshot> {
  const barCount = params.barCount || 50;
  
  console.log(`[CHART_SNAPSHOT] Request:`, {
    symbol: params.symbol,
    timeframe: params.timeframe,
    barCount,
  });
  
  const cachedBars = ringBuffer.getRecent(params.symbol, barCount);
  
  console.log(`[CHART_SNAPSHOT] Ring buffer returned ${cachedBars.length} bars for ${params.symbol}`);
  
  if (cachedBars.length === 0) {
    console.log(`[CHART_SNAPSHOT] No bars found, returning empty snapshot`);
    return {
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: [],
      indicators: {},
      session: { high: 0, low: 0, open: 0 },
      volatility: 'medium',
      regime: 'chop',
    };
  }

  // Convert to flat Bar format (shared type)
  const bars = cachedBars.map((bar) => ({
    symbol: params.symbol,
    timestamp: bar.bar_start,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    seq: bar.seq,
    bar_start: bar.bar_start,
    bar_end: bar.bar_end,
  }));

  // Calculate session stats (intraday session high/low/open)
  const sessionHigh = Math.max(...cachedBars.map((b) => b.high));
  const sessionLow = Math.min(...cachedBars.map((b) => b.low));
  const sessionOpen = cachedBars[0]?.open || 0;

  // Calculate VWAP for indicators
  let sumPV = 0;
  let sumV = 0;
  
  for (const bar of cachedBars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    sumPV += typicalPrice * bar.volume;
    sumV += bar.volume;
  }

  const currentVWAP = sumV > 0 ? sumPV / sumV : 0;

  // Calculate volatility based on price range
  const avgRange = cachedBars.reduce((sum, b) => sum + (b.high - b.low), 0) / cachedBars.length;
  const avgPrice = cachedBars.reduce((sum, b) => sum + b.close, 0) / cachedBars.length;
  const rangePercent = (avgRange / avgPrice) * 100;
  
  const volatility = rangePercent > 1.5 ? 'high' : rangePercent > 0.7 ? 'medium' : 'low';

  // Detect regime: trend vs chop based on EMA crossovers and price action
  const closes = cachedBars.map((b) => b.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  
  const currentClose = closes[closes.length - 1] || 0;
  const currentEMA9 = ema9[ema9.length - 1] || 0;
  const currentEMA21 = ema21[ema21.length - 1] || 0;
  
  let regime: 'trend-up' | 'trend-down' | 'chop' = 'chop';
  if (currentEMA9 > currentEMA21 && currentClose > currentEMA9) {
    regime = 'trend-up';
  } else if (currentEMA9 < currentEMA21 && currentClose < currentEMA9) {
    regime = 'trend-down';
  }

  const indicators: ChartSnapshot['indicators'] = {};
  
  if (currentVWAP > 0) {
    indicators.vwap = { value: currentVWAP, mode: 'session' as const };
  }
  
  if (currentEMA9 > 0 && currentEMA21 > 0) {
    indicators.emas = [
      { period: 9, value: currentEMA9 },
      { period: 21, value: currentEMA21 },
    ];
  }

  const snapshot = {
    symbol: params.symbol,
    timeframe: params.timeframe,
    bars,
    indicators,
    session: { 
      high: sessionHigh, 
      low: sessionLow, 
      open: sessionOpen 
    },
    volatility,
    regime,
  };

  console.log(`[CHART_SNAPSHOT] Response for ${params.symbol}:`, {
    barCount: bars.length,
    currentPrice: currentClose,
    session: { high: sessionHigh, low: sessionLow, open: sessionOpen },
    vwap: currentVWAP,
    regime,
    volatility,
  });

  return snapshot;
}

// Helper: Calculate Exponential Moving Average
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0 || prices.length < period) return [];
  
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  
  // Start with SMA
  const firstPrices = prices.slice(0, period);
  let ema = firstPrices.reduce((sum, p) => sum + p, 0) / period;
  emaArray.push(ema);
  
  // Calculate EMA for remaining prices
  for (let i = period; i < prices.length; i++) {
    ema = prices[i]! * k + ema * (1 - k);
    emaArray.push(ema);
  }
  
  return emaArray;
}

export async function subscribeMarketStream(
  params: SubscribeMarketStreamParams
): Promise<SubscribeMarketStreamResult> {
  const subscriptionId = nanoid();
  const streamUrl = `/api/telemetry/stream?symbol=${params.symbol}&timeframe=${params.timeframe}`;
  
  return {
    subscriptionId,
    streamUrl,
  };
}

export async function proposeCallout(
  params: ProposeCalloutParams
): Promise<CalloutResult> {
  const startTime = Date.now();
  const id = nanoid();
  const qualityGrade = params.context.qualityGrade || 'B';
  const urgency = params.context.urgency || 'now';

  await db.insert(callouts).values({
    id,
    userId: 'demo-user',
    symbol: params.context.symbol,
    timeframe: params.context.timeframe,
    kind: params.kind,
    setupTag: params.context.setupTag,
    rationale: [params.context.rationale],
    qualityGrade,
    urgency,
    rulesPass: true,
  });

  const calloutEvent = {
    id,
    userId: 'demo-user',
    kind: params.kind,
    setupTag: params.context.setupTag,
    rationale: params.context.rationale,
    qualityGrade,
    urgency,
    timestamp: Date.now(),
  };

  copilotBroadcaster.broadcastCallout(calloutEvent);
  perfMonitor.recordLatency('callout-broadcast', startTime);

  return calloutEvent;
}

export async function proposeEntryExit(
  params: ProposeEntryExitParams
): Promise<EntryExitProposal> {
  const id = nanoid();
  const riskPerShare = Math.abs(params.price - params.stop);
  const target1R = (params.target1 - params.price) / riskPerShare;
  const target2R = params.target2 ? (params.target2 - params.price) / riskPerShare : undefined;

  const rulesResult = rulesSentinel.evaluate({
    symbol: params.symbol,
    timeframe: params.timeframe,
  });

  return {
    id,
    type: params.type,
    symbol: params.symbol,
    timeframe: params.timeframe,
    price: params.price,
    stop: params.stop,
    target1: params.target1,
    target2: params.target2,
    rMultiples: {
      target1: target1R,
      target2: target2R,
    },
    rationale: params.rationale,
    rulesPass: rulesResult.pass,
    rulesReasons: rulesResult.rules.filter((r) => !r.pass).map((r) => r.reason || r.name),
    timestamp: Date.now(),
  };
}

export async function evaluateRules(
  params: EvaluateRulesParams
): Promise<RulesEvaluation> {
  if (!params.context) {
    throw new Error('Missing required context parameter');
  }
  return rulesSentinel.evaluate(params.context);
}

export async function logJournalEvent(
  params: LogJournalEventParams
): Promise<JournalEventResult> {
  if (!params.payload) {
    throw new Error('Missing required payload parameter');
  }
  
  if (!params.payload.symbol || !params.payload.timeframe) {
    throw new Error('Missing required fields: symbol and timeframe');
  }

  const id = nanoid();

  await db.insert(journalEvents).values({
    id,
    userId: 'demo-user',
    type: params.type,
    symbol: params.payload.symbol,
    timeframe: params.payload.timeframe,
    indicators: params.payload.indicators || null,
    proposal: params.payload.proposal || null,
    decision: params.payload.decision || null,
    mae: params.payload.mae || null,
    mfe: params.payload.mfe || null,
    realizedR: params.payload.realizedR || null,
    rulesRef: params.payload.rulesRef || null,
    qualityGrade: params.payload.qualityGrade || null,
    reasoning: params.payload.reasoning,
  });

  return {
    id,
    timestamp: Date.now(),
  };
}

export async function summarizeSession(
  params: SummarizeSessionParams
): Promise<SessionSummary> {
  return {
    period: typeof params.range === 'string' ? params.range : 'custom',
    expectancyBySetup: [],
    ruleViolations: [],
    plInR: 0,
    winRate: 0,
    focusList: ['SPY', 'QQQ', 'NVDA'],
    markdown: '## Session Summary\n\nNo trades yet.',
  };
}

export async function getPatternSummary(
  params: GetPatternSummaryParams
): Promise<PatternSummary> {
  const stats = await patternMemory.getPatternStats(params.symbol, params.timeframe);

  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    stats: stats.map((s) => ({
      setup: s.setup,
      winRate: s.winRate,
      evR: s.evR,
      maeP50: s.maeP50,
      timeToT1P50: s.timeToTarget,
      falseBreakRate: s.falseBreakRate,
      volumeZScores: s.volumeZScores,
      rangeZScores: s.rangeZScores,
      atrPercentile: s.atrPercentile,
      vwapBehaviors: s.vwapBehaviors,
    })),
  };
}

export async function getRecommendedRiskBox(
  params: GetRecommendedRiskBoxParams
): Promise<RiskBox> {
  const stats = await patternMemory.getPatternStats(params.symbol, params.timeframe, params.setup);
  
  const avgStats = stats.length > 0 ? stats[0] : null;
  const atr = 1.5;

  if (!avgStats) {
    return {
      stop: atr,
      target1: atr * 2,
      target2: atr * 3,
      expectedHoldBars: 10,
      atr,
      confidence: 'low',
    };
  }

  return {
    stop: avgStats.maeP50,
    target1: avgStats.mfeP50,
    target2: avgStats.mfeP80,
    expectedHoldBars: avgStats.timeToTarget,
    atr,
    confidence: avgStats.winRate > 0.6 ? 'high' : avgStats.winRate > 0.4 ? 'medium' : 'low',
  };
}

export async function generateTradePlan(
  params: GenerateTradePlanParams
): Promise<TradePlan> {
  const stats = await patternMemory.getPatternStats(params.symbol, params.timeframe);

  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    levels: {
      pdh: 580,
      pdl: 575,
      sessionVwap: 577.5,
      anchoredVwaps: [],
    },
    volumeProfile: {
      hvn: [577],
      lvn: [578.5],
    },
    atr: 1.5,
    gamePlan: [
      'Watch for VWAP reclaim with volume',
      'Target PDH breakout if SPY leads',
      'Use 9EMA as support on pullbacks',
    ],
  };
}

export const toolHandlers = {
  get_chart_snapshot: getChartSnapshot,
  subscribe_market_stream: subscribeMarketStream,
  propose_callout: proposeCallout,
  propose_entry_exit: proposeEntryExit,
  evaluate_rules: evaluateRules,
  log_journal_event: logJournalEvent,
  summarize_session: summarizeSession,
  get_pattern_summary: getPatternSummary,
  get_recommended_risk_box: getRecommendedRiskBox,
  generate_trade_plan: generateTradePlan,
};
