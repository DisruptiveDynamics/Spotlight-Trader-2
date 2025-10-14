import { eventBus, type Tick, type Microbar, type MarketBarEvent } from "./eventBus";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const ET = "America/New_York";

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
  timeframe: string; // e.g. '1m', '5m', '15m'
  timeframeMs: number; // timeframe in milliseconds
}

export class BarBuilder {
  private states = new Map<string, SymbolState>();
  private microbarInterval = 50; // Ultra-smooth 20 updates/sec (TOS-level)
  private microbarTimers = new Map<string, NodeJS.Timeout>();
  private barFinalizeTimers = new Map<string, NodeJS.Timeout>();
  // Track tick listeners to properly remove them
  private tickListeners = new Map<string, (tick: Tick) => void>();
  // Track last seq for monotonic sequence numbers
  private lastSeq = new Map<string, number>();

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
      0,
    );
    return fromZonedTime(wall, ET).getTime();
  }

  subscribe(symbol: string, timeframe: string = "1m") {
    const stateKey = `${symbol}:${timeframe}`;
    if (this.states.has(stateKey)) return;

    // Parse timeframe to get bar duration in minutes
    const barMinutes = this.parseTimeframe(timeframe);
    const timeframeMs = barMinutes * 60000;

    const now = Date.now();
    const bar_start = this.floorToExchangeMinute(now, barMinutes);
    const bar_end = bar_start + timeframeMs;

    this.states.set(stateKey, {
      currentBar: null,
      bar_start,
      bar_end,
      microbars: [],
      lastTickTs: now,
      timeframe,
      timeframeMs,
    });

    // Initialize seq counter for this symbol/timeframe
    this.lastSeq.set(stateKey, 0);

    // Create and store tick listener reference for proper cleanup
    const tickListener = (tick: Tick) => this.handleTick(symbol, timeframe, tick);
    this.tickListeners.set(stateKey, tickListener);

    eventBus.on(`tick:${symbol}` as const, tickListener);
    this.startMicrobarTimer(symbol, timeframe);
    this.startBarFinalizeTimer(symbol, timeframe);
  }

  private parseTimeframe(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([mh])$/);
    if (!match || !match[1] || !match[2]) return 1; // default to 1 minute

    const value = parseInt(match[1], 10);
    const unit = match[2];

    return unit === "h" ? value * 60 : value;
  }

  unsubscribe(symbol: string, timeframe: string = "1m") {
    const stateKey = `${symbol}:${timeframe}`;

    // Remove tick listener using stored reference
    const tickListener = this.tickListeners.get(stateKey);
    if (tickListener) {
      eventBus.off(`tick:${symbol}` as any, tickListener);
      this.tickListeners.delete(stateKey);
    }

    // Clean up state and timers
    this.states.delete(stateKey);

    const microTimer = this.microbarTimers.get(stateKey);
    if (microTimer) {
      clearInterval(microTimer);
      this.microbarTimers.delete(stateKey);
    }

    const finalizeTimer = this.barFinalizeTimers.get(stateKey);
    if (finalizeTimer) {
      clearInterval(finalizeTimer);
      this.barFinalizeTimers.delete(stateKey);
    }
  }

  private handleTick(symbol: string, timeframe: string, tick: Tick) {
    const stateKey = `${symbol}:${timeframe}`;
    const state = this.states.get(stateKey);
    if (!state) return;

    state.lastTickTs = tick.ts;

    // Check if we crossed timeframe boundary
    if (tick.ts >= state.bar_end) {
      this.finalizeBar(symbol, timeframe, state);

      const barMinutes = this.parseTimeframe(timeframe);
      const tickBoundary = this.floorToExchangeMinute(tick.ts, barMinutes);
      state.bar_start = tickBoundary;
      state.bar_end = tickBoundary + state.timeframeMs;
      state.currentBar = null;
    }

    if (!state.currentBar) {
      state.currentBar = {
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.size ?? 0,
      };
    } else {
      state.currentBar.high = Math.max(state.currentBar.high, tick.price);
      state.currentBar.low = Math.min(state.currentBar.low, tick.price);
      state.currentBar.close = tick.price;
      state.currentBar.volume += tick.size ?? 0;
    }
  }

  private finalizeBar(symbol: string, timeframe: string, state: SymbolState) {
    if (!state.currentBar) return;

    const stateKey = `${symbol}:${timeframe}`;
    // Increment seq strictly (initialized to 0 in subscribe)
    const currentSeq = this.lastSeq.get(stateKey) ?? 0;
    const seq = currentSeq + 1;
    this.lastSeq.set(stateKey, seq);

    const finalizedBar: MarketBarEvent = {
      symbol,
      timeframe: timeframe as any,
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

    // Emit with dynamic timeframe in event name
    eventBus.emit(`bar:new:${symbol}:${timeframe}` as any, finalizedBar);
  }

  private startMicrobarTimer(symbol: string, timeframe: string = "1m") {
    const stateKey = `${symbol}:${timeframe}`;
    const timer = setInterval(() => {
      const state = this.states.get(stateKey);
      if (!state || !state.currentBar) return;

      const microbar: Microbar = {
        symbol,
        tf: "250ms",
        ts: Date.now(),
        open: state.currentBar.open,
        high: state.currentBar.high,
        low: state.currentBar.low,
        close: state.currentBar.close,
        volume: state.currentBar.volume,
      };

      eventBus.emit(`microbar:${symbol}` as const, microbar);
    }, this.microbarInterval);

    this.microbarTimers.set(stateKey, timer);
  }

  private startBarFinalizeTimer(symbol: string, timeframe: string = "1m") {
    const stateKey = `${symbol}:${timeframe}`;
    // Check every second if the current bar needs to be finalized
    const timer = setInterval(() => {
      const state = this.states.get(stateKey);
      if (!state) return;

      const now = Date.now();

      // If current time has crossed bar_end, finalize even without new ticks
      if (now >= state.bar_end && state.currentBar) {
        this.finalizeBar(symbol, timeframe, state);

        // Start new bar at the next timeframe boundary
        const barMinutes = this.parseTimeframe(timeframe);
        const nextBoundary = this.floorToExchangeMinute(now, barMinutes);
        state.bar_start = nextBoundary;
        state.bar_end = nextBoundary + state.timeframeMs;
        state.currentBar = null;
      }
    }, 1000);

    this.barFinalizeTimers.set(stateKey, timer);
  }

  getState(symbol: string, timeframe: string = "1m"): SymbolState | undefined {
    const stateKey = `${symbol}:${timeframe}`;
    return this.states.get(stateKey);
  }
}

export const barBuilder = new BarBuilder();
