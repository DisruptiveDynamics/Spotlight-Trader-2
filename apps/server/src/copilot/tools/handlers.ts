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
import { bars1m } from '@server/services/bars1m';
import { sessionVWAP } from '@server/services/sessionVWAP';

export async function getChartSnapshot(
  params: GetChartSnapshotParams
): Promise<ChartSnapshot> {
  const lookback = params.lookback || 100;
  const recentBars = bars1m.getRecentBars(params.symbol, lookback);

  if (recentBars.length === 0) {
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

  // Calculate session high/low/open
  const sessionHigh = Math.max(...recentBars.map(b => b.high));
  const sessionLow = Math.min(...recentBars.map(b => b.low));
  const sessionOpen = recentBars[0]?.open ?? 0;

  // Calculate basic EMA
  const indicators: ChartSnapshot['indicators'] = {};
  const closes = recentBars.map(b => b.close);
  const ema9 = calculateEMA(closes, 9);
  const lastEma = ema9[ema9.length - 1];
  if (lastEma !== undefined) {
    indicators.emas = [{ period: 9, value: lastEma }];
  }

  // Get VWAP if available
  const vwap = sessionVWAP.getLastVWAP(params.symbol);
  if (vwap !== null) {
    indicators.vwap = { value: vwap, mode: 'session' };
  }

  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    bars: [], // Will be populated by actual Bar type conversion if needed
    indicators,
    session: { high: sessionHigh, low: sessionLow, open: sessionOpen },
    volatility: 'medium',
    regime: 'chop',
  };
}

function calculateEMA(values: number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val === undefined) continue;
    
    if (i === 0) {
      ema.push(val);
    } else {
      const prevEma = ema[i - 1];
      if (prevEma !== undefined) {
        ema.push((val - prevEma) * multiplier + prevEma);
      }
    }
  }
  
  return ema;
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
    userId: 'default-user',
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
    userId: 'default-user',
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
  return rulesSentinel.evaluate(params.context);
}

export async function logJournalEvent(
  params: LogJournalEventParams
): Promise<JournalEventResult> {
  const id = nanoid();

  await db.insert(journalEvents).values({
    id,
    userId: 'default-user',
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
