import { getBuffer } from "./buffer.js";

export interface QuoteResponse {
  symbol: string;
  price: number;
  ts: number;
  source: "cache" | "bar_fallback";
}

/**
 * Get the last price for a symbol.
 * Preference: in-process ring buffer (lowest latency)
 * Fallback: latest 1m bar's close price
 */
export function getLastPrice(symbol: string): QuoteResponse {
  const upperSymbol = symbol.toUpperCase();
  
  // Try to get from 1m ring buffer (most recent bar)
  const buffer = getBuffer(upperSymbol, "1m");
  const lastBar = buffer.peekLast();
  
  if (lastBar) {
    return {
      symbol: upperSymbol,
      price: lastBar.c,
      ts: lastBar.t,
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
