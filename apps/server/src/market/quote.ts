import { bars1m } from "../chart/bars1m.js";

export interface QuoteResponse {
  symbol: string;
  price: number;
  ts: number;
  source: "cache" | "bar_fallback";
}

/**
 * Get the last price for a symbol.
 * Uses bars1m buffer for lowest latency access.
 */
export function getLastPrice(symbol: string): QuoteResponse {
  const upperSymbol = symbol.toUpperCase();
  
  // Get the most recent bar from bars1m
  const bars = bars1m.getRecent(upperSymbol, 1);
  
  if (bars.length > 0 && bars[0]) {
    const lastBar = bars[0];
    return {
      symbol: upperSymbol,
      price: lastBar.c,
      ts: lastBar.bar_end,
      source: "cache" as const,
    };
  }
  
  // Fallback: no data available (return disclaimer price)
  return {
    symbol: upperSymbol,
    price: 0,
    ts: Date.now(),
    source: "bar_fallback" as const,
  };
}
