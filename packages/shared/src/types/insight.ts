export interface InsightBar {
  time: number; // Unix timestamp in seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface InsightOverlays {
  ema?: Record<number, number>; // period -> value at current bar
  vwap?: number;
  boll?: {
    mid: number;
    upper: number;
    lower: number;
  };
}

export interface InsightSignal {
  rule: string;
  direction: 'long' | 'short';
  confidence: number;
  ts: number;
}

export interface InsightContext {
  symbol: string;
  timeframe: string;
  bars: InsightBar[]; // Recent visible bars (typically last 100)
  overlays: InsightOverlays;
  activeSignals?: InsightSignal[];
  lastPrompt?: string;
}

export interface InsightRequest {
  context: InsightContext;
  question: string;
}

export interface InsightResponse {
  text: string;
  voiceUrl?: string;
  timestamp: number;
}

export interface InsightJournalEntry {
  type: 'insight';
  symbol: string;
  timeframe: string;
  question: string;
  response: string;
  timestamp: number;
}
