import { bars1m } from '@server/services/bars1m';
import { sessionVWAP } from '@server/services/sessionVWAP';

/**
 * Get the last price for a symbol from the most recent 1m bar.
 * Returns null if no data available.
 */
export function get_last_price(symbol: string): number | null {
  return bars1m.getLastPrice(symbol);
}

/**
 * Get the session VWAP for a symbol.
 * Returns null if no data available.
 */
export function get_last_vwap(symbol: string): number | null {
  return sessionVWAP.getLastVWAP(symbol);
}

/**
 * Get the last EMA value for a symbol.
 * Note: This requires calculating EMA from recent bars.
 * Returns null if insufficient data.
 */
export function get_last_ema(symbol: string, period: number = 9): number | null {
  const recentBars = bars1m.getRecentBars(symbol, period * 2); // Get 2x period for warmup
  
  if (recentBars.length < period) {
    return null;
  }

  const closes = recentBars.map(b => b.close);
  const multiplier = 2 / (period + 1);
  let ema = closes[0];

  for (let i = 1; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Check if we have real-time data for a symbol.
 */
export function has_data(symbol: string): boolean {
  return bars1m.hasData(symbol);
}
