import { tool } from "@openai/agents/realtime";
import { z } from "zod";

import type { ToolBridge } from "./ToolBridge";

/**
 * Create SDK-compatible tools with execute functions that call the ToolBridge
 * The SDK handles function call lifecycle and result submission automatically
 */
export function createVoiceTools(toolBridge: ToolBridge) {
  return [
    tool({
      name: "get_chart_snapshot",
      description:
        "Get current market data snapshot with bars, indicators, and session stats for a symbol. Use for setup analysis and broader context.",
      parameters: z.object({
        symbol: z.string().describe("Stock symbol (e.g., SPY, QQQ)"),
        timeframe: z
          .enum(["1m", "2m", "5m", "10m", "15m", "30m", "1h"])
          .optional()
          .describe("Chart timeframe (default: 1m)"),
        barCount: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of bars to retrieve (default: 20, max: 100)"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_chart_snapshot", input, 5000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_market_regime",
      description: "Get current market regime (trend/chop) and volatility for a symbol",
      parameters: z.object({
        symbol: z.string().describe("Stock symbol"),
        timeframe: z
          .enum(["1m", "2m", "5m", "10m", "15m", "30m", "1h"])
          .optional()
          .describe("Timeframe for regime detection"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_market_regime", input, 3000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_recent_journal",
      description: "Get recent journal entries and trading notes",
      parameters: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Max entries to return"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_recent_journal", input, 3000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_active_rules",
      description: "Get active trading rules and alerts",
      parameters: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Max rules to return"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_active_rules", input, 2000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_recent_signals",
      description: "Get recent trading signals and alerts",
      parameters: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Max signals to return"),
        symbol: z.string().optional().describe("Filter by symbol"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_recent_signals", input, 2000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "search_playbook",
      description: "Search trading playbook for strategies and setups",
      parameters: z.object({
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(20).optional().describe("Max results"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("search_playbook", input, 3000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "search_glossary",
      description: "Search trading glossary for definitions and terms",
      parameters: z.object({
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(20).optional().describe("Max results"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("search_glossary", input, 3000);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_last_price",
      description:
        "Get the most recent traded price for a symbol. Use for simple price checks - extremely fast (<1s).",
      parameters: z.object({
        symbol: z.string().describe("Stock symbol (e.g., SPY, QQQ)"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_last_price", input, 800);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_last_vwap",
      description:
        "Get the most recent session VWAP for a symbol. Use for quick VWAP checks - extremely fast (<1s).",
      parameters: z.object({
        symbol: z.string().describe("Stock symbol (e.g., SPY, QQQ)"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_last_vwap", input, 800);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),

    tool({
      name: "get_last_ema",
      description:
        "Get the most recent EMA value for a symbol and period. Use for quick EMA checks - extremely fast (<1s).",
      parameters: z.object({
        symbol: z.string().describe("Stock symbol (e.g., SPY, QQQ)"),
        period: z.union([z.literal(9), z.literal(21), z.literal(50), z.literal(200)]).describe("EMA period"),
      }),
      execute: async (input) => {
        const result = await toolBridge.exec("get_last_ema", input, 1200);
        if (!result.ok) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.output;
      },
    }),
  ];
}
