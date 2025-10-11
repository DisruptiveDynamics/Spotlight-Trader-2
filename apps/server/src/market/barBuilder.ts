import { eventBus, type Tick, type Microbar, type Bar } from './eventBus';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const ET = 'America/New_York';

interface BarState {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SymbolState {
  currentBar: BarState | null;
  bar_start: number;
  bar_end: number;
  microbars: Microbar[];
  lastTickTs: number;
}

export class BarBuilder {
  private states = new Map<string, SymbolState>();
  private microbarInterval = 50; // Ultra-smooth 20 updates/sec (TOS-level)
  private microbarTimers = new Map<string, NodeJS.Timeout>();
  private barFinalizeTimers = new Map<string, NodeJS.Timeout>();

  private floorToExchangeMinute(tsMs: number, barMinutes: number = 1): number {
    const d = toZonedTime(new Date(tsMs), ET);
    const flooredMin = Math.floor(d.getMinutes() / barMinutes) * barMinutes;
    const wall = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      flooredMin,
      0,
      0
    );
    return fromZonedTime(wall, ET).getTime();
  }

  subscribe(symbol: string) {
    if (this.states.has(symbol)) return;

    const now = Date.now();
    const bar_start = this.floorToExchangeMinute(now);
    const bar_end = bar_start + 60000;

    this.states.set(symbol, {
      currentBar: null,
      bar_start,
      bar_end,
      microbars: [],
      lastTickTs: now,
    });

    eventBus.on(`tick:${symbol}` as const, (tick) => this.handleTick(symbol, tick));
    this.startMicrobarTimer(symbol);
    this.startBarFinalizeTimer(symbol);
  }

  unsubscribe(symbol: string) {
    this.states.delete(symbol);
    const microTimer = this.microbarTimers.get(symbol);
    if (microTimer) {
      clearInterval(microTimer);
      this.microbarTimers.delete(symbol);
    }
    const finalizeTimer = this.barFinalizeTimers.get(symbol);
    if (finalizeTimer) {
      clearInterval(finalizeTimer);
      this.barFinalizeTimers.delete(symbol);
    }
  }

  private handleTick(symbol: string, tick: Tick) {
    const state = this.states.get(symbol);
    if (!state) return;

    state.lastTickTs = tick.ts;

    // Check if we crossed minute boundary
    if (tick.ts >= state.bar_end) {
      this.finalizeBar(symbol, state);

      const tickMinute = this.floorToExchangeMinute(tick.ts);
      state.bar_start = tickMinute;
      state.bar_end = tickMinute + 60000;
      state.currentBar = null;
    }

    if (!state.currentBar) {
      state.currentBar = {
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.size,
      };
    } else {
      state.currentBar.high = Math.max(state.currentBar.high, tick.price);
      state.currentBar.low = Math.min(state.currentBar.low, tick.price);
      state.currentBar.close = tick.price;
      state.currentBar.volume += tick.size;
    }
  }

  private finalizeBar(symbol: string, state: SymbolState) {
    if (!state.currentBar) return;

    const seq = Math.floor(state.bar_start / 60000);

    const finalizedBar: Bar = {
      symbol,
      timeframe: '1m',
      seq,
      bar_start: state.bar_start,
      bar_end: state.bar_end,
      ohlcv: {
        o: state.currentBar.open,
        h: state.currentBar.high,
        l: state.currentBar.low,
        c: state.currentBar.close,
        v: state.currentBar.volume,
      },
    };

    // Clear microbars to prevent memory leak
    state.microbars = [];

    eventBus.emit(`bar:new:${symbol}:1m` as const, finalizedBar);
  }

  private startMicrobarTimer(symbol: string) {
    const timer = setInterval(() => {
      const state = this.states.get(symbol);
      if (!state || !state.currentBar) return;

      const microbar: Microbar = {
        symbol,
        tf: '250ms',
        ts: Date.now(),
        open: state.currentBar.open,
        high: state.currentBar.high,
        low: state.currentBar.low,
        close: state.currentBar.close,
        volume: state.currentBar.volume,
      };

      eventBus.emit(`microbar:${symbol}` as const, microbar);
    }, this.microbarInterval);

    this.microbarTimers.set(symbol, timer);
  }

  private startBarFinalizeTimer(symbol: string) {
    // Check every second if the current bar needs to be finalized
    const timer = setInterval(() => {
      const state = this.states.get(symbol);
      if (!state) return;

      const now = Date.now();
      
      // If current time has crossed bar_end, finalize even without new ticks
      if (now >= state.bar_end && state.currentBar) {
        this.finalizeBar(symbol, state);

        // Start new bar at the next minute boundary
        const tickMinute = this.floorToExchangeMinute(now);
        state.bar_start = tickMinute;
        state.bar_end = tickMinute + 60000;
        state.currentBar = null;
      }
    }, 1000);

    this.barFinalizeTimers.set(symbol, timer);
  }

  getState(symbol: string): SymbolState | undefined {
    return this.states.get(symbol);
  }
}

export const barBuilder = new BarBuilder();
