// Server-authoritative timeframe switching
// Atomic transition: stop old aggregation → backfill history → start new aggregation

import { bars1m } from './bars1m';
import { rollupFrom1m } from './rollups';
import { type Timeframe } from '@shared/types/market';
import { eventBus } from '@server/market/eventBus';
import { barBuilder } from '@server/market/barBuilder';

interface TimeframeState {
  symbol: string;
  timeframe: Timeframe;
  rolledBars: any[];
  currentBar: any | null;
  seq: number;
  isLive: boolean;
}

// Track active timeframe states per user+symbol
const activeStates = new Map<string, TimeframeState>();

// Build state key for isolation
function stateKey(userId: string, symbol: string): string {
  return `${userId}:${symbol}`;
}

export async function switchTimeframe(params: {
  userId: string;
  symbol: string;
  timeframe: Timeframe;
}): Promise<{ ok: boolean; barsCount: number; error?: string }> {
  const { userId, symbol, timeframe } = params;
  const key = stateKey(userId, symbol);

  console.log(`[TimeframeSwitch] User ${userId} switching ${symbol} to ${timeframe}`);

  try {
    // Step 1: Stop old aggregation if exists
    const oldState = activeStates.get(key);
    if (oldState) {
      console.log(`[TimeframeSwitch] Stopping old aggregation for ${oldState.timeframe}`);
      oldState.isLive = false;
      
      // NEVER unsubscribe from 1m - it's the authoritative source for all timeframes
      // Only unsubscribe if switching FROM a non-1m timeframe
      // (1m stays subscribed at all times to feed bars1m buffer and rollups)
    }

    // Step 2: Backfill history from 1m buffer
    console.log(`[TimeframeSwitch] Backfilling ${timeframe} from 1m buffer`);
    
    const recent1m = bars1m.getRecent(symbol, 500); // Get up to 500 1m bars
    
    if (recent1m.length === 0) {
      console.warn(`[TimeframeSwitch] No 1m bars available for ${symbol}`);
      // Still proceed - live data will populate once ticks arrive
    }

    const rolled = rollupFrom1m(recent1m, timeframe);
    console.log(`[TimeframeSwitch] Rolled ${recent1m.length} 1m bars → ${rolled.length} ${timeframe} bars`);

    // Step 3: Create new state
    const newState: TimeframeState = {
      symbol,
      timeframe,
      rolledBars: rolled,
      currentBar: null,
      seq: rolled.length,
      isLive: true,
    };

    activeStates.set(key, newState);

    // Step 4: Emit bar:reset to signal client to redraw
    eventBus.emit('bar:reset' as any, {
      userId,
      symbol,
      timeframe,
      bars: rolled,
    });

    // Step 5: Subscribe to 1m bar closes for incremental rollup
    // When a 1m bar closes, we'll update the rolled state
    setupIncrementalRollup(userId, symbol, timeframe);

    console.log(`[TimeframeSwitch] ✅ Switched to ${timeframe}, emitted ${rolled.length} bars`);

    return { ok: true, barsCount: rolled.length };
  } catch (error) {
    console.error(`[TimeframeSwitch] Error switching ${symbol} to ${timeframe}:`, error);
    return { ok: false, barsCount: 0, error: String(error) };
  }
}

// Setup incremental rollup: listen to 1m bar closes and update rolled state
function setupIncrementalRollup(userId: string, symbol: string, timeframe: Timeframe): void {
  // ALWAYS ensure 1m is subscribed - it's the authoritative source for ALL timeframes
  // This feeds bars1m buffer, VWAP, voice tools, and rollups
  barBuilder.subscribe(symbol, '1m');
  
  if (timeframe === '1m') {
    // No rollup needed for 1m, just use 1m bars directly
    return;
  }

  // Listen to 1m bar closes from the bar builder for incremental rollups
  const eventName = `bar:new:${symbol}:1m` as const;
  
  const handler = (bar1m: any) => {
    const key = stateKey(userId, symbol);
    const state = activeStates.get(key);
    
    if (!state || !state.isLive || state.timeframe !== timeframe) {
      // State changed or user switched away, ignore
      return;
    }

    // Apply the closed 1m bar to the current rolled bar
    const { apply1mCloseToRollup } = require('./rollups');
    
    const result = apply1mCloseToRollup(
      symbol,
      timeframe,
      {
        symbol: bar1m.symbol,
        seq: bar1m.seq,
        bar_start: bar1m.bar_start,
        bar_end: bar1m.bar_end,
        o: bar1m.ohlcv.o,
        h: bar1m.ohlcv.h,
        l: bar1m.ohlcv.l,
        c: bar1m.ohlcv.c,
        v: bar1m.ohlcv.v,
      },
      state.currentBar
    );

    if (result === null) {
      // Current bar is complete, emit it and start new one
      if (state.currentBar) {
        state.seq++;
        const finalBar = { ...state.currentBar, seq: state.seq };
        
        eventBus.emit(`bar:new:${symbol}:${timeframe}` as any, finalBar);
        console.log(`[RollupLive] Emitted ${timeframe} bar seq=${state.seq}`);
      }
      
      // Start new bar with this 1m bar
      state.currentBar = null; // Will be created on next 1m bar
    } else {
      // Update current bar
      state.currentBar = result;
    }
  };

  eventBus.on(eventName, handler);
  
  // Also subscribe to 1m to ensure it's being built
  barBuilder.subscribe(symbol, '1m');
}

// Get current state for a user+symbol (for debugging)
export function getTimeframeState(userId: string, symbol: string): TimeframeState | undefined {
  return activeStates.get(stateKey(userId, symbol));
}
