import { z } from "zod";
import { getChartSnapshot } from "../copilot/tools/handlers";
import { db } from "../db";
import { rules, journalEvents, signals } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { retrieveTopK } from "../memory/store";

const symbolSchema = z.string().min(1).max(10);
const timeframeSchema = z.enum(["1m", "2m", "5m", "10m", "15m", "30m", "1h"]);

export const voiceTools = {
  async get_chart_snapshot(input: unknown, userId: string) {
    const params = z
      .object({
        symbol: symbolSchema,
        timeframe: timeframeSchema.default("5m"),
        barCount: z.number().int().min(1).max(500).optional().default(50),
      })
      .parse(input);

    return getChartSnapshot({
      symbol: params.symbol,
      timeframe: params.timeframe,
      barCount: params.barCount,
    });
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
