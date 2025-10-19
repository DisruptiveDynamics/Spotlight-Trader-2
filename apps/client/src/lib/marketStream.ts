import { perfMetrics } from "@shared/perf/metrics";
import { reconcileBars } from "@shared/utils/barHash";
import { logger } from "@shared/utils/logger";

import { STREAM_URL, HISTORY_URL } from "../config";
import { useAuthStore } from "../stores/authStore";

export type Ohlcv = { o: number; h: number; l: number; c: number; v: number };

export type Bar = {
  symbol: string;
  timeframe: "1m";
  seq: number;
  bar_start: number;
  bar_end: number;
  ohlcv: Ohlcv;
};

export type Micro = {
  symbol: string;
  ts: number;
  ohlcv: Ohlcv;
};

export type Tick = {
  symbol: string;
  ts: number;
  price: number;
  size: number;
  side?: "buy" | "sell"; // for color-coding in Time & Sales
};

export type SSEStatus =
  | "connecting"
  | "connected"
  | "degraded_ws"
  | "replaying_gap"
  | "live"
  | "idle"
  | "error";

interface MarketSSEOptions {
  sinceSeq?: number;
  maxReconnectDelay?: number;
  timeframe?: string;
}

// Runtime type guards for SSE payloads
function isFiniteNumber(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isBarPayload(b: any): b is Bar {
  return (
    b &&
    isFiniteNumber(b.seq) &&
    isFiniteNumber(b.bar_end) &&
    b.ohlcv &&
    ["o", "h", "l", "c"].every((k) => isFiniteNumber(b.ohlcv[k]))
  );
}

function isMicroPayload(m: any): m is Micro {
  return (
    m &&
    isFiniteNumber(m.ts) &&
    m.ohlcv &&
    ["o", "h", "l", "c"].every((k) => isFiniteNumber(m.ohlcv[k]))
  );
}

export function connectMarketSSE(symbols = ["SPY"], opts?: MarketSSEOptions) {
  let es: EventSource | null = null;
  let reconnectTimeout: number | null = null;
  let reconnectAttempts = 0;
  let reconnectCount = 0;
  let lastSeq = opts?.sinceSeq || 0;
  let isManualClose = false;
  let currentState: SSEStatus = "connecting";
  let processingPromise = Promise.resolve();

  // [RESILIENCE] Track server epoch for restart detection
  let currentEpochId: string | null = null;

  // [RESILIENCE] Track duplicate rejections to force resync
  let duplicateRejections: number[] = []; // Timestamps of rejections

  // [IDLE-STATE] Track last live bar to detect idle markets (no trading activity)
  let lastLiveBarAt = Date.now();
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  const maxReconnectDelay = opts?.maxReconnectDelay || 30000;

  const listeners = {
    bar: [] as ((b: Bar) => void)[],
    microbar: [] as ((m: Micro) => void)[],
    tick: [] as ((t: Tick) => void)[],
    status: [] as ((s: SSEStatus) => void)[],
    gap: [] as ((detected: { expected: number; received: number }) => void)[],
    epoch: [] as ((e: { epochId: string; epochStartMs: number }) => void)[],
  };

  const emitStatus = (status: SSEStatus) => {
    currentState = status;
    listeners.status.forEach((fn) => fn(status));
  };

  // [PHASE-5] Track local bars for reconciliation (last 10 bars)
  const localBars: Bar[] = [];
  const MAX_LOCAL_BARS = 10;

  // [RESILIENCE] Soft reset and resync when server restarts or sequence is stale
  const performResync = async (reason: string) => {
    try {
      logger.info(`🔄 Performing resync (${reason})`);

      // [PHASE-5] Track reconnect event
      perfMetrics.recordReconnectEvent();

      // [RESILIENCE] Emit resync event for debounced splash overlay
      window.dispatchEvent(new CustomEvent("market:resync-start", { detail: { reason } }));

      emitStatus("replaying_gap");

      const symbol = symbols[0] || "SPY";
      const timeframe = opts?.timeframe || "1m";
      
      // [PHASE-5] Fetch last 10 bars for reconciliation (reduced from 50)
      const params = new URLSearchParams({
        symbol,
        timeframe,
        limit: "10", // Fetch 10-bar snapshot for reconciliation
      });

      const res = await fetch(`${HISTORY_URL}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Resync failed: ${res.status} ${res.statusText}`);
      }

      const rawBars = await res.json();

      // Transform server bars
      const serverBars: Bar[] = rawBars
        .map((b: any) => ({
          symbol: b.symbol || symbol,
          timeframe: b.timeframe || "1m",
          seq: Math.floor(b.bar_end / 60000),
          bar_start: b.bar_end - 60000,
          bar_end: b.bar_end,
          ohlcv: b.ohlcv,
        }))
        .sort((a: Bar, b: Bar) => a.seq - b.seq);

      // [PHASE-5] Reconcile using hash comparison
      const { toUpdate, toAdd, reconciled } = reconcileBars(localBars, serverBars);

      if (reconciled > 0) {
        perfMetrics.recordBarReconciled(reconciled);
        
        const minSeq = Math.min(...[...toUpdate, ...toAdd].map((b) => b.seq));
        const maxSeq = Math.max(...[...toUpdate, ...toAdd].map((b) => b.seq));
        
        logger.info(`✅ Recovered ${reconciled} bars (seq ${minSeq}→${maxSeq})`);
        
        // Emit only reconciled bars (diffs)
        [...toUpdate, ...toAdd].forEach((bar) => {
          listeners.bar.forEach((fn) => fn(bar));
        });
      }

      // [PHASE-5] Replace local buffer with authoritative server snapshot
      localBars.length = 0; // Clear
      serverBars.slice(-MAX_LOCAL_BARS).forEach((bar) => {
        localBars.push(bar); // Keep last 10 bars
      });

      // Update lastSeq to highest from snapshot
      if (serverBars.length > 0) {
        lastSeq = serverBars[serverBars.length - 1]!.seq;
        logger.info(`✅ Resynced ${serverBars.length} bars, lastSeq now: ${lastSeq}`);

        // If no reconciliation needed, emit all bars
        if (reconciled === 0) {
          serverBars.forEach((bar) => {
            listeners.bar.forEach((fn) => fn(bar));
          });
        }
      }

      emitStatus("live");
      // [RESILIENCE] Emit completion event
      window.dispatchEvent(new CustomEvent("market:resync-complete"));
    } catch (error) {
      console.error("Resync error:", error);
      emitStatus("error");
      // [RESILIENCE] Emit completion even on error
      window.dispatchEvent(new CustomEvent("market:resync-complete"));
    }
  };

  const backfillGap = async (fromSeq: number, toSeq: number, previousLastSeq: number) => {
    try {
      logger.info(`📊 Backfilling gap: seq ${fromSeq} → ${toSeq}`);
      emitStatus("replaying_gap");

      const symbol = symbols[0] || "SPY";
      const timeframe = opts?.timeframe || "1m";
      const limit = Math.min(toSeq - fromSeq + 1, 100);

      const params = new URLSearchParams({
        symbol,
        timeframe,
        limit: String(limit),
      });

      const res = await fetch(`${HISTORY_URL}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Gap backfill failed: ${res.status} ${res.statusText}`);
      }

      const rawBars = await res.json();

      // Transform history response to Bar format
      const bars: Bar[] = rawBars.map((b: any) => ({
        symbol: b.symbol || symbol,
        timeframe: b.timeframe || "1m",
        seq: Math.floor(b.bar_end / 60000),
        bar_start: b.bar_end - 60000,
        bar_end: b.bar_end,
        ohlcv: b.ohlcv,
      }));

      const filledBars = bars
        .filter((bar) => bar.seq > previousLastSeq && bar.seq <= toSeq)
        .sort((a, b) => a.seq - b.seq);

      logger.info(`✅ Filled ${filledBars.length} bars in gap`);

      filledBars.forEach((bar) => {
        lastSeq = bar.seq;
        
        // [PHASE-5] Track filled bars in local buffer
        localBars.push(bar);
        if (localBars.length > MAX_LOCAL_BARS) {
          localBars.shift();
        }
        
        listeners.bar.forEach((fn) => fn(bar));
      });
    } catch (error) {
      console.error("Gap backfill error:", error);
      emitStatus("error");
    }
  };

  const connect = () => {
    if (isManualClose) return;

    const params = new URLSearchParams({ symbols: symbols.join(",") });
    if (lastSeq > 0) {
      params.append("sinceSeq", String(lastSeq));
    }
    if (opts?.timeframe) {
      params.append("timeframe", opts.timeframe);
    }

    emitStatus(reconnectAttempts === 0 ? "connecting" : "degraded_ws");

    const url = `${STREAM_URL}?${params.toString()}`;
    logger.debug(`[SSE] Creating EventSource connection to: ${url}`);
    es = new EventSource(url, { withCredentials: true });

    es.addEventListener("open", async () => {
      logger.debug(`[SSE] Connection OPENED successfully`);
      reconnectAttempts = 0;
      emitStatus("connected");
      window.dispatchEvent(new CustomEvent("sse:connected"));

      // Gap-fill on reconnect if we have a lastSeq
      if (lastSeq > 0) {
        const symbol = symbols[0] || "SPY";
        const timeframe = opts?.timeframe || "1m";
        try {
          const res = await fetch(
            `${HISTORY_URL}?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&sinceSeq=${lastSeq}`,
          );
          if (res.ok) {
            const bars = await res.json();
            bars.forEach((bar: Bar) => {
              if (bar.seq > lastSeq) {
                lastSeq = bar.seq;
                
                // [PHASE-5] Track gap-filled bars in local buffer
                localBars.push(bar);
                if (localBars.length > MAX_LOCAL_BARS) {
                  localBars.shift();
                }
                
                listeners.bar.forEach((fn) => fn(bar));
              }
            });
          }
        } catch (error) {
          console.error("SSE open gap-fill error:", error);
        }
      }
    });

    // [BOOTSTRAP] Listen for immediate bootstrap event
    es.addEventListener("bootstrap", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      logger.debug(`[SSE] Received bootstrap event:`, data);
    });

    // [RESILIENCE] Listen for epoch events to detect server restarts
    es.addEventListener("epoch", (e) => {
      logger.debug(`[SSE] Received epoch event`);
      const data = JSON.parse((e as MessageEvent).data) as {
        epochId: string;
        epochStartMs: number;
        symbols: string[];
        timeframe: string;
      };

      // Emit epoch to listeners first
      listeners.epoch.forEach((fn) => fn({ epochId: data.epochId, epochStartMs: data.epochStartMs }));

      if (currentEpochId && currentEpochId !== data.epochId) {
        logger.info(
          `🔄 Server restarted: epoch ${currentEpochId.slice(0, 8)} → ${data.epochId.slice(0, 8)}, soft reset`,
        );
        currentEpochId = data.epochId;
        duplicateRejections = []; // Reset duplicate counter
        
        // [RESILIENCE] Soft reset on epoch change: clear lastSeq and resync
        // This ensures we get fresh data after server restart
        lastSeq = 0;
        
        // Trigger immediate resync to rebuild state from server
        performResync("epoch change").catch((err) => {
          console.error("Epoch resync failed:", err);
        });
      } else {
        currentEpochId = data.epochId;
        logger.info(`✅ Epoch established: ${data.epochId.slice(0, 8)}`);
      }
    });

    // [RESILIENCE] Listen for ping events to keep connection alive (ignore payload)
    es.addEventListener("ping", (e) => {
      // Heartbeat event to prevent proxy idle timeout - no action needed
      // Optionally could track buffered/dropped stats for observability
      const data = JSON.parse((e as MessageEvent).data);
      if (data.buffered > 0 || data.dropped > 0) {
        logger.debug(`📡 SSE ping: buffered=${data.buffered}, dropped=${data.dropped}`);
      }
    });

    es.addEventListener("bar", (e) => {
      logger.debug(`[SSE] Received bar event`);
      processingPromise = processingPromise.then(async () => {
        const b = JSON.parse((e as MessageEvent).data);
        if (!isBarPayload(b)) {
          logger.warn("Invalid bar payload", b);
          return;
        }

        // [RESILIENCE] Detect server restart or seq regression (tightened threshold)
        // Reduced from 1000 to 10 to catch smaller regressions quickly
        const isStaleSequence = lastSeq > 0 && b.seq < lastSeq - 10;

        if (isStaleSequence) {
          logger.info(`🔄 Stale sequence detected: seq=${b.seq}, lastSeq=${lastSeq}`);
          duplicateRejections = []; // Reset counter before resync
          await performResync("stale sequence");
          return;
        }

        if (b.seq <= lastSeq) {
          // [RESILIENCE] Track duplicate rejections for forced resync
          const now = Date.now();
          duplicateRejections.push(now);

          // Keep only rejections from last 2 seconds
          duplicateRejections = duplicateRejections.filter((ts) => now - ts < 2000);

          if (duplicateRejections.length >= 5) {
            console.warn(
              `❌ Too many duplicate rejections (${duplicateRejections.length}), forcing resync`,
            );
            duplicateRejections = []; // Reset counter
            await performResync("excessive duplicates");
            return;
          }

          console.warn(
            `Duplicate bar detected: seq=${b.seq}, lastSeq=${lastSeq} (${duplicateRejections.length}/5)`,
          );
          return;
        }

        if (b.seq > lastSeq + 1 && lastSeq > 0) {
          const gap = { expected: lastSeq + 1, received: b.seq };
          const previousLastSeq = lastSeq;
          console.warn(`Gap detected: expected seq=${gap.expected}, got ${gap.received}`);
          listeners.gap.forEach((fn) => fn(gap));

          await backfillGap(previousLastSeq + 1, b.seq - 1, previousLastSeq);
        }

        lastSeq = b.seq;
        
        // [IDLE-STATE] Track live data arrival
        lastLiveBarAt = Date.now();
        
        // [PHASE-5] Track bar in local buffer for reconciliation
        localBars.push(b);
        if (localBars.length > MAX_LOCAL_BARS) {
          localBars.shift(); // Keep only last 10 bars
        }
        
        listeners.bar.forEach((fn) => fn(b));

        if (currentState === "connected" || currentState === "replaying_gap" || currentState === "idle") {
          emitStatus("live");
        }
      });
    });

    // [PHASE-5] Handle individual microbar (legacy)
    es.addEventListener("microbar", (e) => {
      const m = JSON.parse((e as MessageEvent).data);
      if (!isMicroPayload(m)) {
        logger.warn("Invalid micro payload", m);
        return;
      }
      listeners.microbar.forEach((fn) => fn(m));
    });

    // [PHASE-5] Handle microbar batch (unpack and emit individually)
    es.addEventListener("microbar_batch", (e) => {
      const batch = JSON.parse((e as MessageEvent).data) as {
        microbars: Array<{
          symbol: string;
          ts: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }>;
      };

      // Unpack batch and emit as individual microbars
      batch.microbars.forEach((mb) => {
        const m: Micro = {
          symbol: mb.symbol,
          ts: mb.ts,
          ohlcv: {
            o: mb.open,
            h: mb.high,
            l: mb.low,
            c: mb.close,
            v: mb.volume,
          },
        };
        if (!isMicroPayload(m)) {
          logger.warn("Invalid micro from batch", m);
          return;
        }
        listeners.microbar.forEach((fn) => fn(m));
      });
    });

    es.addEventListener("tick", (e) => {
      const t = JSON.parse((e as MessageEvent).data) as Tick;
      listeners.tick.forEach((fn) => fn(t));
    });

    es.addEventListener("message", (e) => {
      logger.debug(`[SSE] Generic message event:`, e.type, e.data?.slice(0, 100));
    });

    es.onerror = (event) => {
      console.error("[SSE] Connection error occurred:", {
        readyState: es?.readyState,
        url: es?.url,
        event: event,
      });
      console.warn("SSE error, scheduling reconnect");
      emitStatus("error");
      es?.close();
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (reconnectTimeout || isManualClose) return;

    reconnectCount++;
    window.dispatchEvent(
      new CustomEvent("metrics:update", {
        detail: { sseReconnects: reconnectCount },
      }),
    );

    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
      maxReconnectDelay,
    );

    reconnectAttempts++;

    reconnectTimeout = window.setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, delay);
  };

  connect();

  // [IDLE-STATE] Check for idle market every 30 seconds
  const idleCheckInterval = setInterval(() => {
    const idleMs = Date.now() - lastLiveBarAt;
    if (idleMs > IDLE_THRESHOLD_MS && currentState === "live") {
      logger.info(`📊 Market idle: ${Math.round(idleMs / 60000)} minutes since last bar`);
      emitStatus("idle");
    }
  }, 30000);

  // Gap-fill on window focus (user returns to tab after being away)
  const handleFocus = async () => {
    if (lastSeq > 0 && currentState === "live") {
      const symbol = symbols[0] || "SPY";
      const timeframe = opts?.timeframe || "1m";
      try {
        const res = await fetch(
          `${HISTORY_URL}?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&sinceSeq=${lastSeq}`,
        );
        if (res.ok) {
          const bars = await res.json();
          bars.forEach((bar: Bar) => {
            if (bar.seq > lastSeq) {
              lastSeq = bar.seq;
              
              // [PHASE-5] Track focus-filled bars in local buffer
              localBars.push(bar);
              if (localBars.length > MAX_LOCAL_BARS) {
                localBars.shift();
              }
              
              listeners.bar.forEach((fn) => fn(bar));
            }
          });
        }
      } catch (error) {
        console.error("Focus gap-fill error:", error);
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleFocus);
  }

  return {
    onBar(fn: (b: Bar) => void) {
      listeners.bar.push(fn);
    },
    onMicro(fn: (m: Micro) => void) {
      listeners.microbar.push(fn);
    },
    onTick(fn: (t: Tick) => void) {
      listeners.tick.push(fn);
    },
    onStatus(fn: (s: SSEStatus) => void) {
      listeners.status.push(fn);
    },
    onGap(fn: (detected: { expected: number; received: number }) => void) {
      listeners.gap.push(fn);
    },
    onEpoch(fn: (e: { epochId: string; epochStartMs: number }) => void) {
      listeners.epoch.push(fn);
    },
    getLastSeq() {
      return lastSeq;
    },
    getState() {
      return currentState;
    },
    close() {
      isManualClose = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      clearInterval(idleCheckInterval); // Clean up idle checker
      es?.close();

      // Cleanup focus listener
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus);
      }
    },
  };
}

// Timeframe presets mapping to 1-minute bars (Thinkorswim-style)
export const TF_PRESETS = {
  "1H": 60, // 1 hour of 1-min bars
  "3H": 180, // 3 hours of 1-min bars
  "5H": 300, // 5 hours of 1-min bars
  "1D": 390, // 1 trading day (~6.5 hours)
  "5D": 1950, // 5 trading days
} as const;

export type TimeframePreset = keyof typeof TF_PRESETS;

export async function loadHistoryPreset(
  symbol: string,
  preset: TimeframePreset,
  onBar: (bar: Bar) => void,
): Promise<void> {
  const limit = TF_PRESETS[preset];
  const res = await fetch(
    `${HISTORY_URL}?symbol=${encodeURIComponent(symbol)}&timeframe=1m&limit=${limit}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load ${preset} history: ${res.statusText}`);
  }
  const bars: Bar[] = await res.json();
  bars.forEach(onBar);
}

// Auth-aware market stream starter
export function startMarketStream() {
  const authReady = useAuthStore.getState().authReady;
  const user = useAuthStore.getState().user;

  if (!authReady || !user) {
    logger.warn("[marketStream] Not starting - auth not ready");
    return () => {}; // No-op cleanup
  }

  logger.info("[marketStream] Starting market stream (auth ready)");
  const stream = connectMarketSSE(["SPY", "QQQ"]);

  // Wire up default handlers
  stream.onStatus((status) => {
    if (status === "connected") {
      window.dispatchEvent(new CustomEvent("sse:connected"));
    }
  });

  return () => {
    logger.info("[marketStream] Stopping market stream");
    stream.close();
  };
}

// fetchHistory lives in lib/history to avoid duplicates
export { fetchHistory } from "./history";
