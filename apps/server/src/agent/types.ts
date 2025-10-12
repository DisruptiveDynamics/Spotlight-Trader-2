import type { Request, Response } from 'express';

export type ChartPoint = { t: number; o: number; h: number; l: number; c: number; v?: number };
export type ChartSnapshot = { symbol: string; timeframe: string; points: ChartPoint[]; lastSeq?: number };

export type JournalEntry = {
  id: string;
  ts: number;
  text: string;
  tags?: string[];
  meta?: Record<string, unknown>;
};

export type MetricEvent =
  | { type: 'latency'; rtt: number; sseReconnects?: number; source?: string }
  | { type: 'market'; status: 'open' | 'closed' | 'pre' | 'halted' }
  | { type: 'custom'; key: string; value: unknown };

export type ChartEvent =
  | { type: 'chart:update'; snapshot: ChartSnapshot }
  | { type: 'chart:append'; symbol: string; timeframe: string; point: ChartPoint };

export type JournalEvent = { type: 'journal:append'; entry: JournalEntry };

export type AppEvent = MetricEvent | ChartEvent | JournalEvent;

export type CoachMessage = {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  title: string;
  body?: string;
  tags?: string[];
  data?: Record<string, unknown>;
};

export type Toolbelt = {
  getSnapshot(): {
    charts: Record<string, ChartSnapshot>;
    metrics: { latencyRTT?: number; sseReconnects?: number; market?: string };
    journalTail: JournalEntry[];
  };
  listCoachMessages(since?: number): CoachMessage[];
  pushEvent(ev: AppEvent): void;
};
