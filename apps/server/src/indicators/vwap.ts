// Session tick VWAP calculator - single source of truth for chart, tape, and voice
// Uses the SAME tick stream as Tape for consistency

import { eventBus } from '@server/market/eventBus';
import type { Tick } from '@shared/types';
import type { Bar } from '@shared/types';

interface VWAPState {
  sumPriceVolume: number;
  sumVolume: number;
  lastUpdate: number;
}

class SessionVWAP {
  private states = new Map<string, VWAPState>();
  private tickListeners = new Map<string, (tick: Tick) => void>();

  // Start tracking VWAP for a symbol
  subscribe(symbol: string): void {
    if (this.tickListeners.has(symbol)) return; // Already subscribed

    // Initialize state
    this.states.set(symbol, {
      sumPriceVolume: 0,
      sumVolume: 0,
      lastUpdate: Date.now(),
    });

    // Listen to the same tick bus as Tape
    const tickListener = (tick: Tick) => {
      const state = this.states.get(symbol);
      if (!state) return;

      const price = tick.price;
      const volume = tick.size ?? 0;

      // Accumulate VWAP components
      state.sumPriceVolume += price * volume;
      state.sumVolume += volume;
      state.lastUpdate = tick.ts;
    };

    this.tickListeners.set(symbol, tickListener);
    eventBus.on(`tick:${symbol}` as const, tickListener);

    console.log(`[SessionVWAP] Subscribed to ${symbol}`);
  }

  // Stop tracking VWAP for a symbol
  unsubscribe(symbol: string): void {
    const tickListener = this.tickListeners.get(symbol);
    if (tickListener) {
      eventBus.off(`tick:${symbol}` as any, tickListener);
      this.tickListeners.delete(symbol);
    }

    this.states.delete(symbol);
    console.log(`[SessionVWAP] Unsubscribed from ${symbol}`);
  }

  // Get current session VWAP for a symbol
  getSessionVWAP(symbol: string): number | undefined {
    const state = this.states.get(symbol);
    if (!state || state.sumVolume === 0) return undefined;

    return state.sumPriceVolume / state.sumVolume;
  }

  // Reset VWAP for new session (called at market open)
  resetSession(symbol: string): void {
    const state = this.states.get(symbol);
    if (state) {
      state.sumPriceVolume = 0;
      state.sumVolume = 0;
      state.lastUpdate = Date.now();
      console.log(`[SessionVWAP] Reset session for ${symbol}`);
    }
  }

  // Get all tracked symbols
  getTrackedSymbols(): string[] {
    return Array.from(this.states.keys());
  }
}

// Singleton instance
export const sessionVWAP = new SessionVWAP();

// Helper function for tool/chart consumption
export function getSessionVWAPForSymbol(symbol: string): number | undefined {
  return sessionVWAP.getSessionVWAP(symbol);
}
