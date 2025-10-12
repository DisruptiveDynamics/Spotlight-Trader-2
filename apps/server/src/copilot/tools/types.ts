import type { Bar } from '@spotlight/shared';

export interface GetChartSnapshotParams {
  symbol: string;
  timeframe: string;
  barCount?: number; // Optional, matches voice tool schema parameter name
}

export interface ChartSnapshot {
  symbol: string;
  timeframe: string;
  bars: Bar[];
  indicators: {
    vwap?: { value: number; mode: 'session' | 'anchored' };
    avwaps?: Array<{ anchorMs: number; value: number }>;
    emas?: Array<{ period: number; value: number }>;
    rsi?: { period: number; value: number };
    atr?: { period: number; value: number };
  };
  session: {
    high: number;
    low: number;
    open: number;
  };
  volatility: 'low' | 'medium' | 'high';
  regime: 'trend-up' | 'trend-down' | 'chop' | 'news';
}

export interface SubscribeMarketStreamParams {
  symbol: string;
  timeframe: string;
}

export interface SubscribeMarketStreamResult {
  subscriptionId: string;
  streamUrl: string;
}

export interface ProposeCalloutParams {
  kind: 'watch' | 'entry' | 'exit' | 'note';
  context: {
    symbol: string;
    timeframe: string;
    setupTag: string;
    rationale: string;
    qualityGrade?: 'A' | 'B' | 'C';
    urgency?: 'now' | 'soon' | 'watch';
  };
}

export interface CalloutResult {
  id: string;
  kind: 'watch' | 'entry' | 'exit' | 'note';
  setupTag: string;
  rationale: string;
  qualityGrade: 'A' | 'B' | 'C';
  urgency: 'now' | 'soon' | 'watch';
  timestamp: number;
}

export interface ProposeEntryExitParams {
  type: 'entry' | 'exit';
  symbol: string;
  timeframe: string;
  price: number;
  stop: number;
  target1: number;
  target2?: number;
  rationale: string;
  rulesRef?: string;
}

export interface EntryExitProposal {
  id: string;
  type: 'entry' | 'exit';
  symbol: string;
  timeframe: string;
  price: number;
  stop: number;
  target1: number;
  target2?: number | undefined;
  rMultiples: {
    target1: number;
    target2?: number | undefined;
  };
  rationale: string;
  rulesPass: boolean;
  rulesReasons: string[];
  timestamp: number;
}

export interface EvaluateRulesParams {
  context: {
    symbol: string;
    timeframe: string;
    riskAmount?: number;
    setupQuality?: 'A' | 'B' | 'C';
    regime?: string;
    breadth?: { advances: number; declines: number };
  };
}

export interface RulesEvaluation {
  pass: boolean;
  version: string;
  rules: Array<{
    name: string;
    pass: boolean;
    reason?: string | undefined;
  }>;
  circuitBreaker: {
    active: boolean;
    reason?: string | undefined;
  };
}

export interface LogJournalEventParams {
  type: 'entry' | 'exit' | 'note' | 'decision';
  payload: {
    symbol: string;
    timeframe: string;
    indicators?: Record<string, unknown>;
    proposal?: unknown;
    decision?: 'accept' | 'reject' | 'modify';
    mae?: number;
    mfe?: number;
    realizedR?: number;
    rulesRef?: string;
    qualityGrade?: string;
    reasoning: string;
  };
}

export interface JournalEventResult {
  id: string;
  timestamp: number;
}

export interface SummarizeSessionParams {
  range: 'today' | 'week' | 'month' | { start: number; end: number };
}

export interface SessionSummary {
  period: string;
  expectancyBySetup: Array<{ setup: string; evR: number; winRate: number }>;
  ruleViolations: Array<{ rule: string; count: number }>;
  plInR: number;
  winRate: number;
  focusList: string[];
  markdown: string;
}

export interface GetPatternSummaryParams {
  symbol: string;
  timeframe: string;
}

export interface PatternSummary {
  symbol: string;
  timeframe: string;
  stats: Array<{
    setup: string;
    winRate: number;
    evR: number;
    maeP50: number;
    timeToT1P50: number;
    falseBreakRate: number;
    volumeZScores: Record<string, number>;
    rangeZScores: Record<string, number>;
    atrPercentile: number;
    vwapBehaviors: string[];
  }>;
}

export interface GetRecommendedRiskBoxParams {
  symbol: string;
  timeframe: string;
  setup: string;
}

export interface RiskBox {
  stop: number;
  target1: number;
  target2: number;
  expectedHoldBars: number;
  atr: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface GenerateTradePlanParams {
  symbol: string;
  timeframe: string;
}

export interface TradePlan {
  symbol: string;
  timeframe: string;
  levels: {
    pdh: number;
    pdl: number;
    sessionVwap?: number;
    anchoredVwaps?: Array<{ time: string; value: number }>;
  };
  volumeProfile: {
    hvn: number[];
    lvn: number[];
  };
  atr: number;
  gamePlan: string[];
}

export interface SetVoiceParams {
  voiceId: string;
}

export interface SpeakParams {
  text: string;
}

export interface VoiceControlResult {
  success: boolean;
  error?: string;
}

export type ToolHandler<TParams = unknown, TResult = unknown> = (
  params: TParams,
) => Promise<TResult>;

export interface ToolRegistry {
  get_chart_snapshot: ToolHandler<GetChartSnapshotParams, ChartSnapshot>;
  subscribe_market_stream: ToolHandler<SubscribeMarketStreamParams, SubscribeMarketStreamResult>;
  propose_callout: ToolHandler<ProposeCalloutParams, CalloutResult>;
  propose_entry_exit: ToolHandler<ProposeEntryExitParams, EntryExitProposal>;
  evaluate_rules: ToolHandler<EvaluateRulesParams, RulesEvaluation>;
  log_journal_event: ToolHandler<LogJournalEventParams, JournalEventResult>;
  summarize_session: ToolHandler<SummarizeSessionParams, SessionSummary>;
  get_pattern_summary: ToolHandler<GetPatternSummaryParams, PatternSummary>;
  get_recommended_risk_box: ToolHandler<GetRecommendedRiskBoxParams, RiskBox>;
  generate_trade_plan: ToolHandler<GenerateTradePlanParams, TradePlan>;
  set_voice: ToolHandler<SetVoiceParams, VoiceControlResult>;
  speak: ToolHandler<SpeakParams, VoiceControlResult>;
  mute: ToolHandler<void, VoiceControlResult>;
  unmute: ToolHandler<void, VoiceControlResult>;
}
