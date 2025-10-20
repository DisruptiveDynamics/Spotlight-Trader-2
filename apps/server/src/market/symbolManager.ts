import { ringBuffer } from "@server/cache/ring";
import { bars1m } from "@server/chart/bars1m";
import { getHistory } from "@server/history/service";
import { sessionVWAP } from "@server/indicators/vwap";
import { barBuilder } from "@server/market/barBuilder";
import { eventBus } from "@server/market/eventBus";
import { polygonWs } from "@server/market/polygonWs";

type SubEntry = { refs: number; lastTouched: number; timer?: NodeJS.Timeout };

const ACTIVE = new Map<string, SubEntry>();
const TTL_MS = Number(process.env.SYMBOL_TTL_MS ?? 15 * 60_000); // 15m default

// Track bar listeners to properly clean up
const barListeners = new Map<string, (bar: any) => void>();

function touch(symbol: string) {
  const entry = ACTIVE.get(symbol);
  if (!entry) return;
  entry.lastTouched = Date.now();
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => tryEvict(symbol), TTL_MS);
}

function tryEvict(symbol: string) {
  const entry = ACTIVE.get(symbol);
  if (!entry) return;
  const idle = Date.now() - entry.lastTouched;
  if (entry.refs <= 0 && idle >= TTL_MS) {
    // Unsubscribe from all services
    polygonWs.unsubscribe(symbol);
    sessionVWAP.unsubscribe?.(symbol);

    // Remove bar listeners
    const bars1mKey = `${symbol}:1m:bars1m`;
    const ringKey = `${symbol}:1m:ring`;
    
    const bars1mListener = barListeners.get(bars1mKey);
    if (bars1mListener) {
      eventBus.off(`bar:new:${symbol}:1m` as any, bars1mListener);
      barListeners.delete(bars1mKey);
    }
    
    const ringListener = barListeners.get(ringKey);
    if (ringListener) {
      eventBus.off(`bar:new:${symbol}:1m` as any, ringListener);
      barListeners.delete(ringKey);
    }

    ACTIVE.delete(symbol);
    console.log(`♻️ Symbol evicted: ${symbol} (idle for ${Math.round(idle / 1000)}s)`);
  } else {
    touch(symbol);
  }
}

export async function subscribeSymbol(
  symbolRaw: string,
  opts?: { seedLimit?: number },
): Promise<{ ok: boolean; already?: boolean; seeded?: number }> {
  const symbol = symbolRaw.toUpperCase();
  const seedLimit = opts?.seedLimit ?? 200;
  const now = Date.now();
  const entry = ACTIVE.get(symbol);

  if (entry) {
    entry.refs++;
    touch(symbol);
    return { ok: true, already: true };
  }

  ACTIVE.set(symbol, { refs: 1, lastTouched: now });

  try {
    // Subscribe to Polygon WebSocket for live ticks
    polygonWs.subscribe(symbol);

    // CRITICAL: Always ensure 1m barBuilder subscription exists
    // The 1m feed is authoritative and feeds bars1m, VWAP, voice tools, and rollups
    barBuilder.subscribe(symbol, "1m");

    // CRITICAL: Always listen to 1m bars for bars1m buffer (single source of truth)
    // This listener NEVER gets removed while symbol is active
    const bars1mKey = `${symbol}:1m:bars1m`;
    if (!barListeners.has(bars1mKey)) {
      const bars1mListener = (bar: any) => {
        // Feed ALL 1m bars into authoritative buffer
        bars1m.append(symbol, {
          symbol: bar.symbol,
          seq: bar.seq,
          bar_start: bar.bar_start,
          bar_end: bar.bar_end,
          o: bar.ohlcv.o,
          h: bar.ohlcv.h,
          l: bar.ohlcv.l,
          c: bar.ohlcv.c,
          v: bar.ohlcv.v,
        });
      };
      barListeners.set(bars1mKey, bars1mListener);
      eventBus.on(`bar:new:${symbol}:1m` as any, bars1mListener);
    }

    // Add ring buffer listener for 1m SSE streaming
    const ringKey = `${symbol}:1m:ring`;
    if (!barListeners.has(ringKey)) {
      const ringListener = (bar: any) => {
        ringBuffer.putBars(symbol, [bar]);
      };
      barListeners.set(ringKey, ringListener);
      eventBus.on(`bar:new:${symbol}:1m` as any, ringListener);
    }

    // Subscribe to session VWAP (same tick stream)
    sessionVWAP.subscribe(symbol);

    console.log(`✅ Symbol subscribed: ${symbol} (live tick feed + 1m bars)`);

    // Seed history to prime buffers immediately
    let seededCount = 0;
    try {
      const bars = await getHistory({ symbol, timeframe: "1m", limit: seedLimit });
      if (bars?.length) {
        // Prime both ring buffer and bars1m buffer
        ringBuffer.putBars(symbol, bars as any);
        bars.forEach((bar) => {
          bars1m.append(symbol, bar as any);
        });
        seededCount = bars.length;
        console.log(`📊 Seeded ${seededCount} bars for ${symbol}`);
      }
    } catch (err) {
      console.warn(`Failed to seed history for ${symbol}:`, err);
      // Continue - live ticks will still work
    }

    touch(symbol);
    return { ok: true, seeded: seededCount };
  } catch (e) {
    ACTIVE.delete(symbol);
    console.error(`Failed to subscribe ${symbol}:`, e);
    throw e;
  }
}

export async function unsubscribeSymbol(
  symbolRaw: string,
): Promise<{ ok: boolean; missing?: boolean }> {
  const symbol = symbolRaw.toUpperCase();
  const entry = ACTIVE.get(symbol);
  if (!entry) return { ok: true, missing: true };
  entry.refs = Math.max(0, entry.refs - 1);
  touch(symbol);
  console.log(`📉 Symbol unsubscribe: ${symbol} (refs: ${entry.refs})`);
  return { ok: true };
}

export function getActiveSymbols(): string[] {
  return Array.from(ACTIVE.keys());
}

export function isSymbolActive(symbol: string): boolean {
  return ACTIVE.has(symbol.toUpperCase());
}
