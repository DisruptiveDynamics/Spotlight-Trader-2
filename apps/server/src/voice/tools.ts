import { validateEnv } from "@shared/env";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { bars1m } from "../chart/bars1m";
import { copilotBroadcaster } from "../copilot/broadcaster";
import { getChartSnapshot } from "../copilot/tools/handlers";
import { watchSymbol, unwatchSymbol, listWatched } from "../copilot/tools/watchlist";
import { db } from "../db";
import { rules, journalEvents, signals, callouts } from "../db/schema";
import { getSessionVWAPForSymbol } from "../indicators/vwap";
import { retrieveTopK } from "../memory/store";

const env = validateEnv(process.env);

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
  async get_chart_snapshot(input: unknown, _userId: string) {
    const params = z
      .object({
        symbol: symbolSchema,
        timeframe: timeframeSchema.default("1m"),
        barCount: z.number().int().min(1).max(200).nullish().default(50),
      })
      .parse(input);

    // Clamp bar count defensively (cap at 200, default 50)
    const barCount = Math.max(1, Math.min(params.barCount ?? 50, 200));

    const exec = async () =>
      cache5s(`snap:${params.symbol}:${params.timeframe}:${barCount}`, async () => {
        return getChartSnapshot({
          symbol: params.symbol,
          timeframe: params.timeframe,
          barCount,
        });
      });

    return withTimeout(exec(), env.TOOL_TIMEOUT_MS, () => ({
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: [],
      indicators: {},
      session: { high: 0, low: 0, open: 0 },
      volatility: "medium",
      regime: "chop",
      stale: true,
      reason: "timeout_or_cold_buffer",
    }));
  },

  async get_last_price(input: unknown, _userId: string) {
    const { symbol } = z.object({ symbol: symbolSchema }).parse(input);

    const exec = async () =>
      cache5s(`price:${symbol}`, async () => {
        const b = bars1m.peekLast(symbol);
        if (!b) {
          return { symbol, value: null, ts: null, stale: true, reason: "empty_buffer" };
        }
        const price = b.c;
        return { symbol, value: price, ts: b.bar_end };
      });

    return withTimeout(exec(), env.TOOL_TIMEOUT_MS, () => ({
      symbol,
      value: null,
      ts: null,
      stale: true,
      reason: "timeout",
    }));
  },

  async get_last_vwap(input: unknown, _userId: string) {
    const { symbol } = z.object({ symbol: symbolSchema }).parse(input);

    const exec = async () =>
      cache5s(`vwap:${symbol}`, async () => {
        const vwap = getSessionVWAPForSymbol(symbol);
        if (vwap == null) {
          return { symbol, value: null, ts: null, stale: true, reason: "vwap_not_available" };
        }
        const b = bars1m.peekLast(symbol);
        return { symbol, value: vwap, ts: b?.bar_end ?? Date.now() };
      });

    return withTimeout(exec(), env.TOOL_TIMEOUT_MS, () => ({
      symbol,
      value: null,
      ts: null,
      stale: true,
      reason: "timeout",
    }));
  },

  async get_last_ema(input: unknown, _userId: string) {
    const { symbol, period } = z
      .object({
        symbol: symbolSchema,
        period: z
          .number()
          .int()
          .refine((p) => [9, 21, 50, 200].includes(p), {
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

  async get_market_regime(input: unknown, _userId: string) {
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
        limit: z.number().int().min(1).max(50).nullish().default(10),
      })
      .parse(input);

    const events = await db
      .select()
      .from(journalEvents)
      .where(eq(journalEvents.userId, userId))
      .orderBy(desc(journalEvents.timestamp))
      .limit(params.limit ?? 10);

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
        limit: z.number().int().min(1).max(50).nullish().default(20),
      })
      .parse(input);

    const userRulesData = await db
      .select()
      .from(rules)
      .where(eq(rules.ownerUserId, userId))
      .limit(params.limit ?? 20);

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
        limit: z.number().int().min(1).max(50).nullish().default(10),
        symbol: symbolSchema.nullish(),
      })
      .parse(input);

    const signalsData = await db
      .select()
      .from(signals)
      .where(eq(signals.userId, userId))
      .orderBy(desc(signals.ts))
      .limit(params.limit ?? 10);

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
        limit: z.number().int().min(1).max(20).nullish().default(5),
      })
      .parse(input);

    const results = await retrieveTopK(userId, params.query, params.limit ?? 5, 10, 0.1, false);

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
        limit: z.number().int().min(1).max(20).nullish().default(5),
      })
      .parse(input);

    const results = await retrieveTopK(userId, params.query, params.limit ?? 5, 10, 0.1, false);

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

  async get_memory(input: unknown, userId: string) {
    const params = z
      .object({
        query: z.string().min(1),
        kind: z.enum(["playbook", "glossary", "postmortem", "knowledge", "all"]).nullish().default("all"),
        limit: z.number().int().min(1).max(10).nullish().default(5),
      })
      .parse(input);

    const excludeKnowledge = params.kind !== "knowledge" && params.kind !== "all";
    const results = await retrieveTopK(userId, params.query, params.limit ?? 5, 10, 0.1, excludeKnowledge);

    const filteredResults = params.kind === "all" 
      ? results 
      : results.filter((r) => r.kind === params.kind);

    return {
      count: filteredResults.length,
      memories: filteredResults.map((r: any) => ({
        kind: r.kind,
        content: r.text,
        score: r.score,
        tags: r.tags || [],
        createdAt: r.createdAt,
      })),
    };
  },

  async get_recent_callouts(_input: unknown, userId: string) {
    const callouts = copilotBroadcaster.getRecentCallouts(userId);
    return {
      count: callouts.length,
      callouts: callouts.map((c) => ({
        id: c.id,
        kind: c.kind,
        setupTag: c.setupTag,
        rationale: c.rationale,
        qualityGrade: c.qualityGrade,
        urgency: c.urgency,
        timestamp: c.timestamp,
      })),
    };
  },

  async respond_to_callout(input: unknown, userId: string) {
    const params = z
      .object({
        calloutId: z.string(),
        action: z.enum(["accept", "reject"]),
        reason: z.string().nullish(),
      })
      .parse(input);

    const recentCallouts = copilotBroadcaster.getRecentCallouts(userId);
    const callout = recentCallouts.find((c) => c.id === params.calloutId);

    if (!callout) {
      return { success: false, error: "Callout not found in recent list" };
    }

    try {
      if (params.action === "accept") {
        await db.update(callouts).set({ accepted: true }).where(eq(callouts.id, params.calloutId));
      } else {
        await db
          .update(callouts)
          .set({ accepted: false, rejectedReason: params.reason || "Rejected via voice" })
          .where(eq(callouts.id, params.calloutId));
      }

      await db.insert(journalEvents).values({
        id: nanoid(),
        userId,
        type: "decision",
        symbol: callout.setupTag.split("_")[0] || callout.setupTag,
        timeframe: "5m",
        timestamp: new Date(),
        decision: params.action,
        reasoning: params.reason || `${params.action}ed via voice`,
      });

      copilotBroadcaster.removeCallout(userId, params.calloutId);

      return { success: true, action: params.action };
    } catch (err) {
      console.error("Failed to respond to callout:", err);
      return { success: false, error: "Database update failed" };
    }
  },

  async watch_symbol(input: unknown, _userId: string) {
    const params = z
      .object({
        symbol: symbolSchema,
        seedLimit: z.number().int().min(50).max(1000).nullish().default(500),
      })
      .parse(input);

    return watchSymbol({ symbol: params.symbol, seedLimit: params.seedLimit ?? 500 });
  },

  async unwatch_symbol(input: unknown, _userId: string) {
    const params = z.object({ symbol: symbolSchema }).parse(input);
    return unwatchSymbol({ symbol: params.symbol });
  },

  async list_watched(_input: unknown, _userId: string) {
    return listWatched();
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
  {
    type: "function" as const,
    name: "get_memory",
    description: "Search your knowledge base for relevant memories across playbook, glossary, postmortems, and uploaded knowledge. Use this to recall past conversations, lessons learned, and user preferences.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for in your memories" },
        kind: { 
          type: "string", 
          enum: ["playbook", "glossary", "postmortem", "knowledge", "all"],
          description: "Type of memory to search (default: all)" 
        },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Max results (default: 5)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_recent_callouts",
    description: "Get recent trading callouts and setup alerts from the copilot. Use this when the user asks 'what are you seeing' or wants to know about recent market opportunities.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "respond_to_callout",
    description: "Accept or reject a trading callout. Use this when the user decides to take or pass on a setup.",
    parameters: {
      type: "object",
      properties: {
        calloutId: { type: "string", description: "ID of the callout to respond to" },
        action: { type: "string", enum: ["accept", "reject"], description: "Accept or reject the callout" },
        reason: { type: "string", description: "Optional reason for the decision" },
      },
      required: ["calloutId", "action"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "watch_symbol",
    description: "Add a symbol to the proactive watchlist for real-time monitoring. This subscribes to live data and seeds historical bars for the AI coach to provide insights and alerts.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol to watch (e.g., AAPL, TSLA)" },
        seedLimit: { type: "integer", minimum: 50, maximum: 1000, description: "Number of historical bars to seed (default: 500)" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "unwatch_symbol",
    description: "Remove a symbol from the proactive watchlist. The subscription will remain active for a TTL period before expiring.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock symbol to unwatch" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "list_watched",
    description: "List all symbols currently on the proactive watchlist for monitoring.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
