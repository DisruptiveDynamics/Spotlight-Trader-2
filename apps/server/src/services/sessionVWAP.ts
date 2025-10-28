import { eventBus } from '@server/market/eventBus';
import { isRthOpen } from '@server/market/session';

interface VWAPState {
  cumulativePV: number; // Price * Volume
  cumulativeVolume: number;
  sessionStart: number; // Session start timestamp
  vwap: number;
}

/**
 * Real-time VWAP tracker that listens to tick stream.
 * Calculates session VWAP for each symbol.
 */
class SessionVWAPService {
  private vwapState = new Map<string, VWAPState>();
  private initialized = false;

  start(symbols: string[] = []): void {
    if (this.initialized) {
      return;
    }

    // Subscribe to tick events for each symbol
    // Note: We'll need to dynamically add listeners when new symbols are subscribed
    for (const symbol of symbols) {
      this.subscribeSymbol(symbol);
    }

    // Reset VWAP at market open (9:30 AM ET)
    this.checkSessionReset();
    setInterval(() => this.checkSessionReset(), 60000); // Check every minute

    this.initialized = true;
    console.log('✅ SessionVWAP service started');
  }

  subscribeSymbol(symbol: string): void {
    const eventName = `tick:${symbol}` as const;
    
    eventBus.on(eventName, (tick) => {
      this.processTick(symbol, tick.price, tick.size, tick.ts);
    });
  }

  private processTick(symbol: string, price: number, size: number, timestamp: number): void {
    const state = this.vwapState.get(symbol);

    if (!state) {
      // Initialize new state for this symbol
      this.vwapState.set(symbol, {
        cumulativePV: price * size,
        cumulativeVolume: size,
        sessionStart: this.getSessionStart(timestamp),
        vwap: price,
      });
      return;
    }

    // Check if we need to reset for new session
    const currentSessionStart = this.getSessionStart(timestamp);
    if (currentSessionStart !== state.sessionStart) {
      // New session - reset
      state.cumulativePV = price * size;
      state.cumulativeVolume = size;
      state.sessionStart = currentSessionStart;
      state.vwap = price;
      return;
    }

    // Update cumulative values
    state.cumulativePV += price * size;
    state.cumulativeVolume += size;

    // Calculate VWAP
    if (state.cumulativeVolume > 0) {
      state.vwap = state.cumulativePV / state.cumulativeVolume;
    }
  }

  getLastVWAP(symbol: string): number | null {
    const state = this.vwapState.get(symbol);
    return state ? state.vwap : null;
  }

  getVWAPState(symbol: string): VWAPState | null {
    return this.vwapState.get(symbol) || null;
  }

  hasData(symbol: string): boolean {
    return this.vwapState.has(symbol);
  }

  private getSessionStart(timestamp: number): number {
    const date = new Date(timestamp);
    // Set to 9:30 AM ET (market open)
    date.setHours(9, 30, 0, 0);
    return date.getTime();
  }

  private checkSessionReset(): void {
    const sessionStatus = isRthOpen();
    
    // If market just opened, clear all VWAP states to start fresh
    if (sessionStatus.open && sessionStatus.session === 'rth') {
      const now = Date.now();
      for (const [symbol, state] of this.vwapState.entries()) {
        const currentSessionStart = this.getSessionStart(now);
        if (state.sessionStart !== currentSessionStart) {
          // Reset for new session
          this.vwapState.delete(symbol);
          console.log(`🔄 Reset VWAP for ${symbol} (new session)`);
        }
      }
    }
  }
}

export const sessionVWAP = new SessionVWAPService();
