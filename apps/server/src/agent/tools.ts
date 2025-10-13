/**
 * Spotlight Trader — Agent Tools (safe, opt-in)
 * - No side effects
 * - No server mounts, no ports
 * - If you don't import this, nothing in your app changes.
 */

import { ringBuffer } from "../cache/ring.js";
import { getMarketSource, getMarketReason } from "../market/bootstrap.js";

export type GetChartParams = {
  symbol: string;
  timeframe: "1m" | "5m" | "1h" | "1d";
  limit?: number;
};

export type GetRulesParams = {
  version?: string; // optional selector, defaults to "active"
};

export type GetMarketStatusParams = Record<string, never>;

export const ToolSchemas = [
  {
    name: "getChart",
    description: "Return OHLCV for a symbol/timeframe (latest first or last—your handler decides).",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "e.g., ES, NQ, AAPL" },
        timeframe: { type: "string", enum: ["1m", "5m", "1h", "1d"] },
        limit: { type: "integer", minimum: 10, maximum: 2000, default: 300 },
      },
      required: ["symbol", "timeframe"],
    },
  },
  {
    name: "getRules",
    description: "Return the active rulebook or a specific version (read-only).",
    parameters: {
      type: "object",
      properties: {
        version: { type: "string", description: "Explicit rulebook version; defaults to active." },
      },
    },
  },
  {
    name: "getMarketStatus",
    description: "Return exchange open/closed and latency metrics for HUD.",
    parameters: { type: "object", properties: {} },
  },
] as const;

/**
 * Handlers (safe defaults)
 * - You can wire these to your real data sources later.
 * - Return shapes are intentionally small and documented.
 */
export const ToolHandlers = {
  /** Expected return:
   * { symbol, timeframe, bars: [{t:number, o:number, h:number, l:number, c:number, v:number}], source?:string }
   */
  async getChart(args: GetChartParams) {
    const { symbol, timeframe, limit = 300 } = args;
    
    // [FIX] Wire to real market data from ring buffer
    const recentBars = ringBuffer.getRecent(symbol.toUpperCase(), limit);
    
    // Transform to expected format (CachedBar uses flat properties, not nested ohlcv)
    const bars = recentBars.map(bar => ({
      t: bar.bar_start,
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    }));
    
    return {
      symbol: symbol.toUpperCase(),
      timeframe,
      bars,
      source: getMarketSource(),
    };
  },

  /** Expected return:
   * { version:string, rules: Array<{id:string, name:string, expr:string, enabled:boolean}>, meta?:any }
   */
  async getRules(args: GetRulesParams) {
    const version = args.version ?? "active";
    // TODO: Load from your existing rules store when ready
    return {
      version,
      rules: [], // <-- populate when wired
      meta: { note: "placeholder; wire me to your rules store" },
    };
  },

  /** Expected return:
   * { status:"open"|"closed"|"unknown", latency:{ rtt:number|null, sseReconnects:number|null }, updatedAt:number }
   */
  async getMarketStatus(_args: GetMarketStatusParams) {
    // [FIX] Connect to actual market service
    const source = getMarketSource();
    const reason = getMarketReason();
    
    // Determine status based on market source (MarketSource = "polygon" | "sim")
    let status: "open" | "closed" | "unknown" = "unknown";
    if (source === "polygon") {
      status = "open"; // If we're getting polygon data, market is active
    } else if (source === "sim") {
      status = reason.includes("overnight") ? "closed" : "unknown";
    }
    
    return {
      status,
      latency: { rtt: null, sseReconnects: null },
      updatedAt: Date.now(),
      source,
      reason,
    };
  },
};
