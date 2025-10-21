/**
 * Watchlist Tools
 * 
 * Provides copilot/voice tools for managing a proactive watchlist.
 * Symbols added to the watchlist are actively subscribed for real-time monitoring,
 * enabling the AI coach to provide proactive insights and alerts.
 */

import { subscribeSymbol, unsubscribeSymbol } from "@server/market/symbolManager";
import { z } from "zod";

// In-memory watchlist persists for server lifetime
const WATCHED_SYMBOLS = new Set<string>();

// Params schemas
const WatchSymbolParamsSchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  seedLimit: z.number().min(50).max(1000).optional().default(500),
});

const UnwatchSymbolParamsSchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
});

// Types
export type WatchSymbolParams = z.infer<typeof WatchSymbolParamsSchema>;
export type UnwatchSymbolParams = z.infer<typeof UnwatchSymbolParamsSchema>;

export interface WatchSymbolResult {
  success: boolean;
  symbol: string;
  seeded: number;
  already_watched: boolean;
  message: string;
}

export interface UnwatchSymbolResult {
  success: boolean;
  symbol: string;
  message: string;
}

export interface ListWatchedResult {
  symbols: string[];
  count: number;
}

/**
 * Add a symbol to the proactive watchlist
 * Subscribes to real-time data (T.* + AM.*) and seeds historical bars
 */
export async function watchSymbol(params: WatchSymbolParams): Promise<WatchSymbolResult> {
  try {
    const validated = WatchSymbolParamsSchema.parse(params);
    const { symbol, seedLimit } = validated;

    // Check if already watched
    const alreadyWatched = WATCHED_SYMBOLS.has(symbol);

    // Subscribe via SymbolManager (idempotent - won't double-subscribe)
    const subResult = await subscribeSymbol(symbol, { seedLimit });

    // Add to watchlist Set
    WATCHED_SYMBOLS.add(symbol);

    const seeded = subResult.seeded ?? 0;

    console.log(
      `👁️ Watchlist: Added ${symbol} ` +
      `(seeded ${seeded} bars, already_watched=${alreadyWatched})`
    );

    return {
      success: true,
      symbol,
      seeded,
      already_watched: alreadyWatched,
      message: alreadyWatched
        ? `${symbol} is already on the watchlist (${seeded} bars available)`
        : `${symbol} added to watchlist (seeded ${seeded} historical bars)`,
    };
  } catch (error) {
    const symbol = params?.symbol?.toUpperCase() ?? "UNKNOWN";
    console.error(`❌ Failed to watch symbol ${symbol}:`, error);
    
    return {
      success: false,
      symbol,
      seeded: 0,
      already_watched: false,
      message: error instanceof Error ? error.message : "Failed to add symbol to watchlist",
    };
  }
}

/**
 * Remove a symbol from the proactive watchlist
 * Note: Subscription remains active for TTL period (5 minutes default)
 */
export async function unwatchSymbol(params: UnwatchSymbolParams): Promise<UnwatchSymbolResult> {
  try {
    const validated = UnwatchSymbolParamsSchema.parse(params);
    const { symbol } = validated;

    // Check if symbol is watched
    if (!WATCHED_SYMBOLS.has(symbol)) {
      return {
        success: true,
        symbol,
        message: `${symbol} is not on the watchlist`,
      };
    }

    // Remove from watchlist Set
    WATCHED_SYMBOLS.delete(symbol);

    // Decrement subscription ref count
    // Note: Symbol remains subscribed until TTL expires (5m default)
    await unsubscribeSymbol(symbol);

    console.log(`👁️ Watchlist: Removed ${symbol}`);

    return {
      success: true,
      symbol,
      message: `${symbol} removed from watchlist (subscription will expire after TTL)`,
    };
  } catch (error) {
    const symbol = params?.symbol?.toUpperCase() ?? "UNKNOWN";
    console.error(`❌ Failed to unwatch symbol ${symbol}:`, error);
    
    return {
      success: false,
      symbol,
      message: error instanceof Error ? error.message : "Failed to remove symbol from watchlist",
    };
  }
}

/**
 * List all symbols currently on the proactive watchlist
 */
export function listWatched(): ListWatchedResult {
  const symbols = Array.from(WATCHED_SYMBOLS).sort();
  
  console.log(`👁️ Watchlist: ${symbols.length} symbols watched: [${symbols.join(", ")}]`);
  
  return {
    symbols,
    count: symbols.length,
  };
}

/**
 * Check if a symbol is currently watched
 */
export function isWatched(symbol: string): boolean {
  return WATCHED_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * Get watchlist size
 */
export function getWatchlistSize(): number {
  return WATCHED_SYMBOLS.size;
}
