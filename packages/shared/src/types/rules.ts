export interface Rule {
  id: string;
  name: string;
  description: string;
  version: number;
  expression: string;
  parameters?: Record<string, number | string>;
  risk?: {
    rMultiple: number;
    maxLossPct: number;
  };
  createdAt: number;
  updatedAt?: number;
}

export interface EvaluatedRule {
  id: string;
  name: string;
  passed: boolean;
  confidence: number;
  signal?: "long" | "short" | "flat";
  explanation?: string;
  barSeq: number;
  timestamp: number;
}

export interface Signal {
  id: string;
  userId: string;
  symbol: string;
  timeframe: string;
  ruleId: string;
  ruleVersion: string;
  direction: "long" | "short" | "flat";
  confidence: number;
  ctx: Record<string, unknown>;
  ts: Date;
}

export interface SignalExplanation {
  id: string;
  signalId: string;
  text: string;
  tokens: string;
  model: string;
}

export interface RuleContext {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  sma20?: number;
  sma50?: number;
  rsi?: number;
  atr?: number;
  [key: string]: number | undefined;
}
