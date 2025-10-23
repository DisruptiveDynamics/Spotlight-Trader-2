import { eventBus, type Tick, type Microbar, type MarketBarEvent } from "./eventBus";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { bars1m } from "@server/chart/bars1m";
import { ringBuffer } from "@server/cache/ring";
import { validateEnv } from "@shared/env";
import { sessionPolicy, isRegularTradingHours } from "./sessionPolicy";

const ET = "America/New_York";
const env = validateEnv(process.env);

// RTH session boundaries (09:30-16:00 ET)
const RTH_START_MINUTES = 9 * 60 + 30; // 9:30 AM
const RTH_END_MINUTES = 16 * 60; // 4:00 PM

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
  // Microbar update cadence (ms): configurable for load tuning
  // 50ms = 20 updates/sec (TOS-level), 200ms = 5 updates/sec (balanced)
  private microbarInterval = env.MICROBAR_MS;
  private microbarTimers = new Map<string, NodeJS.Timeout>();
  private barFinalizeTimers = new Map<string, NodeJS.Timeout>();
  // Track tick listeners to properly remove them
  private tickListeners = new Map<string, (tick: Tick) => void>();
  // Track AM listeners for reconciliation
  private amListeners = new Map<string, (am: MarketBarEvent) => void>();
  // Track last seq for monotonic sequence numbers
  private lastSeq = new Map<string, number>();
  // Track reconciled seqs to prevent duplicate emissions
  private reconciledSeqs = new Map<string, Set<number>>();
  // Track recent volumes for spike detection (rolling window of 20 bars)
  private recentVolumes = new Map<string, number[]>();

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

  /**
   * Check if a bar timestamp falls within RTH session (09:30-16:00 ET)
   */
  private isWithinRTH(timestampMs: number): boolean {
    const etDate = toZonedTime(new Date(timestampMs), ET);
    const dayOfWeek = etDate.getDay();
    
    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    const timeInMinutes = etDate.getHours() * 60 + etDate.getMinutes();
    return timeInMinutes >= RTH_START_MINUTES && timeInMinutes < RTH_END_MINUTES;
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
    
    // Listen for official AM aggregates for reconciliation (1m only)
    if (timeframe === "1m") {
      const amListener = (am: MarketBarEvent) => this.handleAMReconciliation(symbol, am);
      this.amListeners.set(stateKey, amListener);
      eventBus.on(`am:${symbol}` as const, amListener);
    }
    
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

    // Remove AM listener
    const amListener = this.amListeners.get(stateKey);
    if (amListener) {
      eventBus.off(`am:${symbol}` as any, amListener);
      this.amListeners.delete(stateKey);
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

    // [DATA-INTEGRITY] Validate currentBar has complete OHLCV before emission
    const { open, high, low, close, volume } = state.currentBar;
    if (
      typeof open !== "number" || !Number.isFinite(open) ||
      typeof high !== "number" || !Number.isFinite(high) ||
      typeof low !== "number" || !Number.isFinite(low) ||
      typeof close !== "number" || !Number.isFinite(close) ||
      typeof volume !== "number" || !Number.isFinite(volume)
    ) {
      console.error(
        `[barBuilder] CRITICAL: Refusing to emit bar with incomplete OHLCV - ` +
        `${symbol} ${timeframe} bar_start=${new Date(state.bar_start).toISOString()} ` +
        `o=${open} h=${high} l=${low} c=${close} v=${volume}`
      );
      return; // Abort emission - do not poison ringBuffer or SSE stream
    }

    // DO NOT filter bars here - barBuilder serves all users
    // Session filtering happens at API/SSE level where user preferences are known

    const stateKey = `${symbol}:${timeframe}`;

    // [CRITICAL] Authoritative seq = floor(bar_start ms / 60_000)
    // This ensures seq is deterministic and aligned across all sources:
    // - Live ticks → barBuilder
    // - Historical REST API → history service
    // - SSE backfill → client
    // - AM aggregates → Polygon official data
    // Using bar_start (not bar_end) matches industry standard and Polygon API
    // NO monotonic fallback - seq must match AM for reconciliation to work
    const seq = Math.floor(state.bar_start / 60000);
    this.lastSeq.set(stateKey, seq);

    // Skip emission if this seq was already reconciled with AM
    const reconciledSet = this.reconciledSeqs.get(stateKey);
    if (reconciledSet?.has(seq)) {
      console.debug(
        `[barBuilder] skipping duplicate emission for seq=${seq} ` +
        `(already reconciled with AM)`
      );
      return;
    }

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

    // Volume spike detection for debugging
    this.detectVolumeSpike(symbol, timeframe, finalizedBar.ohlcv.v, seq);

    console.debug(
      `[barBuilder] finalized symbol=${symbol} tf=${timeframe} seq=${seq} ` +
      `start=${new Date(state.bar_start).toISOString()} end=${new Date(state.bar_end).toISOString()} ` +
      `o=${finalizedBar.ohlcv.o} c=${finalizedBar.ohlcv.c} v=${finalizedBar.ohlcv.v}`
    );

    // Write to ringBuffer immediately for gap-fill availability (before AM arrives)
    if (timeframe === "1m") {
      ringBuffer.putBars(symbol, [{
        symbol,
        timestamp: state.bar_start,
        open: finalizedBar.ohlcv.o,
        high: finalizedBar.ohlcv.h,
        low: finalizedBar.ohlcv.l,
        close: finalizedBar.ohlcv.c,
        volume: finalizedBar.ohlcv.v,
        seq,
        bar_start: state.bar_start,
        bar_end: state.bar_end,
      }]);
    }

    // Clear microbars to prevent memory leak
    state.microbars = [];

    // Emit with dynamic timeframe in event name
    eventBus.emit(`bar:new:${symbol}:${timeframe}` as any, finalizedBar as any);
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

  /**
   * Detect volume spikes that are >10x recent average
   * Helps debug potential duplicate bars or data issues
   */
  private detectVolumeSpike(symbol: string, timeframe: string, volume: number, seq: number) {
    const key = `${symbol}:${timeframe}`;
    
    if (!this.recentVolumes.has(key)) {
      this.recentVolumes.set(key, []);
    }
    
    const recent = this.recentVolumes.get(key)!;
    
    // Only check if we have enough history (at least 5 bars)
    if (recent.length >= 5) {
      const avg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
      
      if (avg > 0 && volume > avg * 10) {
        console.warn(
          `⚠️  [VOLUME SPIKE] ${symbol} ${timeframe} seq=${seq} ` +
          `volume=${volume.toLocaleString()} is ${(volume / avg).toFixed(1)}x ` +
          `the recent average (${avg.toLocaleString()}) ` +
          `- possible duplicate bar or auction volume`
        );
      }
    }
    
    // Track this volume (keep last 20 bars)
    recent.push(volume);
    if (recent.length > 20) {
      recent.shift();
    }
  }

  /**
   * Handle official AM aggregate reconciliation
   * Replaces tick-based bars with authoritative Polygon data
   */
  private handleAMReconciliation(symbol: string, am: MarketBarEvent) {
    // DO NOT filter bars here - barBuilder serves all users
    // Session filtering happens at API/SSE level where user preferences are known

    // Reconcile the closed minute in the authoritative buffer
    const result = bars1m.reconcile(symbol, {
      symbol: am.symbol,
      seq: am.seq,
      bar_start: am.bar_start,
      bar_end: am.bar_end,
      o: am.ohlcv.o,
      h: am.ohlcv.h,
      l: am.ohlcv.l,
      c: am.ohlcv.c,
      v: am.ohlcv.v,
    });

    // Propagate correction to ringBuffer (replace/upsert by seq)
    ringBuffer.replaceOrUpsertBySeq(symbol, {
      symbol: am.symbol,
      timestamp: am.bar_start,
      open: am.ohlcv.o,
      high: am.ohlcv.h,
      low: am.ohlcv.l,
      close: am.ohlcv.c,
      volume: am.ohlcv.v,
      seq: am.seq,
      bar_start: am.bar_start,
      bar_end: am.bar_end,
    });

    // Mark this seq as reconciled to prevent duplicate emission from finalizeBar
    const stateKey = `${symbol}:1m`;
    if (!this.reconciledSeqs.has(stateKey)) {
      this.reconciledSeqs.set(stateKey, new Set());
    }
    this.reconciledSeqs.get(stateKey)!.add(am.seq);

    // Re-emit corrected bar to update live stream and clients
    eventBus.emit(`bar:new:${symbol}:1m` as any, am);

    // Log reconciliation with volume drift detection
    // Note: During extended hours, tick drift is expected (sparse trading, intermittent feed)
    // Only warn during RTH when drift indicates a real data quality issue
    if (result.replaced && result.oldBar) {
      const volumeDiff = Math.abs(result.oldBar.v - am.ohlcv.v);
      const volumeDiffPct = am.ohlcv.v > 0 ? (volumeDiff / am.ohlcv.v) * 100 : 0;
      const isRTH = isRegularTradingHours(am.bar_start);
      
      if (volumeDiffPct > 10) {
        // Only warn about drift during RTH (extended hours drift is normal)
        if (isRTH) {
          console.debug(
            `[AM reconcile] ${symbol} seq=${am.seq} ` +
            `VOLUME DRIFT ${volumeDiffPct.toFixed(1)}%: ` +
            `tick=${result.oldBar.v} → AM=${am.ohlcv.v} (diff=${volumeDiff})`
          );
        }
      } else {
        console.debug(
          `[AM reconcile] ${symbol} seq=${am.seq} ` +
          `tick_v=${result.oldBar.v} AM_v=${am.ohlcv.v} ` +
          `o=${am.ohlcv.o} h=${am.ohlcv.h} l=${am.ohlcv.l} c=${am.ohlcv.c}`
        );
      }
    } else {
      console.debug(
        `[AM gap-fill] ${symbol} seq=${am.seq} ` +
        `v=${am.ohlcv.v} o=${am.ohlcv.o} h=${am.ohlcv.h} l=${am.ohlcv.l} c=${am.ohlcv.c}`
      );
    }
  }
}

export const barBuilder = new BarBuilder();
