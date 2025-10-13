import { z } from "zod";
import { getChartSnapshot } from "../copilot/tools/handlers";
import { db } from "../db";
import { rules, journalEvents, signals } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { retrieveTopK } from "../memory/store";
import { bars1m } from "../chart/bars1m";
import { getSessionVWAPForSymbol } from "../indicators/vwap";

const symbolSchema = z.string().min(1).max(10);
const timeframeSchema = z.enum(["1m", "2m", "5m", "10m", "15m", "30m", "1h"]);

// 5-second TTL cache for micro-tools and snapshots
const ttlCache = <T>(ttlMs: number) => {
  const m = new Map<string, { v: T; t: number }>();
  return async (key: string, fn: () => Promise<T>) => {
    const now = Date.now();
    const hit = m.get(key);
    if (hit && now - hit.t < ttlMs) {
      return hit.v;
    }
    const v = await fn();
    m.set(key, { v, t: now });
    return v;
  };
};

const cache5s = ttlCache<any>(5000);

// Timeout wrapper for tools
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(onTimeout());
      }
    }, ms);
    p.then((v) => {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        resolve(onTimeout());
      }
    });
  });
}

export const voiceTools = {
  async get_chart_snapshot(input: unknown, userId: string) {
    const params = z
      .object({
        symbol: symbolSchema,
        timeframe: timeframeSchema.default("1m"),
        barCount: z.number().int().min(1).max(100).optional().default(20),
      })
      .parse(input);

    // Clamp bar count defensively (cap at 100, default 20)
    const barCount = Math.max(1, Math.min(params.barCount ?? 20, 100));

    const exec = async () =>
      cache5s(`snap:${params.symbol}:${params.timeframe}:${barCount}`, async () => {
        return getChartSnapshot({
          symbol: params.symbol,
          timeframe: params.timeframe,
          barCount,
        });
      });

    return withTimeout(exec(), 2000, () => ({
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: [],
      indicators: {},
      session: { high: 0, low: 0, open: 0 },
      volatility: "medium",
      regime: "chop",
      stale: true,
    }));
  },

  async get_last_price(input: unknown, userId: string) {
    const { symbol } = z.object({ symbol: symbolSchema }).parse(input);

    const exec = async () =>
      cache5s(`price:${symbol}`, async () => {
        const b = bars1m.peekLast(symbol);
        if (!b) throw new Error(`No data for ${symbol}`);
        const price = b.c;
        return { symbol, value: price, ts: b.bar_end };
      });

    return withTimeout(exec(), 1200, () => ({
      symbol,
      value: null,
      ts: null,
      stale: true,
    }));
  },

  async get_last_vwap(input: unknown, userId: string) {
    const { symbol } = z.object({ symbol: symbolSchema }).parse(input);

    const exec = async () =>
      cache5s(`vwap:${symbol}`, async () => {
        const vwap = getSessionVWAPForSymbol(symbol);
        if (vwap == null) throw new Error("VWAP not available");
        const b = bars1m.peekLast(symbol);
        return { symbol, value: vwap, ts: b?.bar_end ?? Date.now() };
      });

    return withTimeout(exec(), 1200, () => ({
      symbol,
      value: null,
      ts: null,
      stale: true,
    }));
  },

  async get_last_ema(input: unknown, userId: string) {
    const { symbol, period } = z
      .object({
        symbol: symbolSchema,
        period: z.number().int().refine((p) => [9, 21, 50, 200].includes(p), {
          message: "EMA period must be 9, 21, 50, or 200",
        }),
      })
      .parse(input);

    const exec = async () =>
      cache5s(`ema:${symbol}:${period}`, async () => {
        const b = bars1m.peekLast(symbol);
        if (!b) throw new Error(`No data for ${symbol}`);

        const field = `ema${period}` as keyof typeof b;
        const val = b[field];
        if (val == null) throw new Error(`EMA ${period} not available on latest bar`);

        return { symbol, value: val, ts: b.bar_end, period };
      });

    return withTimeout(exec(), 1200, () => ({
      symbol,
      value: null,
      ts: null,
      period,
      stale: true,
    }));
  },

  async get_market_regime(input: unknown, userId: string) {
    const params = z
      .object({
        symbol: symbolSchema,
        timeframe: timeframeSchema.default("5m"),
      })
      .parse(input);

    const snapshot = await getChartSnapshot({
      symbol: params.symbol,
      timeframe: params.timeframe,
      barCount: 100,
    });

    return {
      symbol: params.symbol,
      regime: snapshot.regime,
      volatility: snapshot.volatility,
      indicators: snapshot.indicators,
      session: snapshot.session,
    };
  },

  async get_recent_journal(input: unknown, userId: string) {
    const params = z
      .object({
        limit: z.number().int().min(1).max(50).optional().default(10),
      })
      .parse(input);

    const events = await db
      .select()
      .from(journalEvents)
      .where(eq(journalEvents.userId, userId))
      .orderBy(desc(journalEvents.timestamp))
      .limit(params.limit);

    return {
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        symbol: e.symbol,
        timeframe: e.timeframe,
        timestamp: e.timestamp,
        reasoning: e.reasoning,
        decision: e.decision,
        proposal: e.proposal,
      })),
    };
  },

  async get_active_rules(input: unknown, userId: string) {
    const params = z
      .object({
        limit: z.number().int().min(1).max(50).optional().default(20),
      })
      .parse(input);

    const userRulesData = await db
      .select()
      .from(rules)
      .where(eq(rules.ownerUserId, userId))
      .limit(params.limit);

    return {
      count: userRulesData.length,
      rules: userRulesData.map((r) => ({
        id: r.id,
        version: r.latestVersion,
      })),
    };
  },

  async get_recent_signals(input: unknown, userId: string) {
    const params = z
      .object({
        limit: z.number().int().min(1).max(50).optional().default(10),
        symbol: symbolSchema.optional(),
      })
      .parse(input);

    const signalsData = await db
      .select()
      .from(signals)
      .where(eq(signals.userId, userId))
      .orderBy(desc(signals.ts))
      .limit(params.limit);

    return {
      count: signalsData.length,
      signals: signalsData.map((s) => ({
        id: s.id,
        symbol: s.symbol,
        timeframe: s.timeframe,
        ruleId: s.ruleId,
        confidence: s.confidence,
        timestamp: s.ts,
        context: s.ctx,
      })),
    };
  },

  async search_playbook(input: unknown, userId: string) {
    const params = z
      .object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional().default(5),
      })
      .parse(input);

    const results = await retrieveTopK(userId, params.query, params.limit, 10, 0.1, false);

    const playbookEntries = results.filter((r) => r.kind === "playbook");

    return {
      count: playbookEntries.length,
      entries: playbookEntries.map((r: any) => ({
        content: r.text,
        score: r.score,
        createdAt: r.createdAt,
      })),
    };
  },

  async search_glossary(input: unknown, userId: string) {
    const params = z
      .object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional().default(5),
      })
      .parse(input);

    const results = await retrieveTopK(userId, params.query, params.limit, 10, 0.1, false);

    const glossaryEntries = results.filter((r) => r.kind === "glossary");

    return {
      count: glossaryEntries.length,
      entries: glossaryEntries.map((r: any) => ({
        content: r.text,
        score: r.score,
        createdAt: r.createdAt,
      })),
    };
  },
};

export const toolSchemas = [
  {
    type: "function" as const,
    name: "get_chart_snapshot",
    description:
      "Get current market data snapshot with bars, indicators, and session stats for a symbol",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol (e.g., SPY, QQQ)" },
        timeframe: {
          type: "string",
          enum: ["1m", "2m", "5m", "10m", "15m", "30m", "1h"],
          description: "Chart timeframe (default: 5m)",
        },
        barCount: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Number of bars to retrieve (default: 50)",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_market_regime",
    description: "Get current market regime (trend/chop) and volatility for a symbol",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol" },
        timeframe: {
          type: "string",
          enum: ["1m", "2m", "5m", "10m", "15m", "30m", "1h"],
          description: "Timeframe for regime detection",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recent_journal",
    description: "Get recent journal entries and trading notes",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max entries to return" },
        eventType: {
          type: "string",
          enum: ["entry", "exit", "note", "insight", "mistake"],
          description: "Filter by event type",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_active_rules",
    description: "Get active trading rules and alerts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max rules to return" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recent_signals",
    description: "Get recent trading signals and alerts",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max signals to return" },
        symbol: { type: "string", description: "Filter by symbol" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_playbook",
    description: "Search trading playbook for strategies and setups",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Max results" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "search_glossary",
    description: "Search trading glossary for definitions and terms",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Max results" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];
