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
  | "error";

interface MarketSSEOptions {
  sinceSeq?: number;
  maxReconnectDelay?: number;
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

  const maxReconnectDelay = opts?.maxReconnectDelay || 30000;

  const listeners = {
    bar: [] as ((b: Bar) => void)[],
    microbar: [] as ((m: Micro) => void)[],
    tick: [] as ((t: Tick) => void)[],
    status: [] as ((s: SSEStatus) => void)[],
    gap: [] as ((detected: { expected: number; received: number }) => void)[],
  };

  const emitStatus = (status: SSEStatus) => {
    currentState = status;
    listeners.status.forEach((fn) => fn(status));
  };

  const backfillGap = async (fromSeq: number, toSeq: number, previousLastSeq: number) => {
    try {
      console.log(`📊 Backfilling gap: seq ${fromSeq} → ${toSeq}`);
      emitStatus("replaying_gap");

      const symbol = symbols[0] || "SPY";
      const limit = Math.min(toSeq - fromSeq + 1, 100);

      const params = new URLSearchParams({
        symbol,
        timeframe: "1m",
        limit: String(limit),
      });

      const res = await fetch(`/api/history?${params.toString()}`);
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

      console.log(`✅ Filled ${filledBars.length} bars in gap`);

      filledBars.forEach((bar) => {
        lastSeq = bar.seq;
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

    emitStatus(reconnectAttempts === 0 ? "connecting" : "degraded_ws");

    es = new EventSource(`/stream/market?${params.toString()}`);

    es.addEventListener("open", async () => {
      reconnectAttempts = 0;
      emitStatus("connected");
      window.dispatchEvent(new CustomEvent("sse:connected"));

      // Gap-fill on reconnect if we have a lastSeq
      if (lastSeq > 0) {
        const symbol = symbols[0] || "SPY";
        try {
          const res = await fetch(
            `/api/history?symbol=${encodeURIComponent(symbol)}&timeframe=1m&sinceSeq=${lastSeq}`,
          );
          if (res.ok) {
            const bars = await res.json();
            bars.forEach((bar: Bar) => {
              if (bar.seq > lastSeq) {
                lastSeq = bar.seq;
                listeners.bar.forEach((fn) => fn(bar));
              }
            });
          }
        } catch (error) {
          console.error("SSE open gap-fill error:", error);
        }
      }
    });

    es.addEventListener("bar", (e) => {
      processingPromise = processingPromise.then(async () => {
        const b = JSON.parse((e as MessageEvent).data) as Bar;

        if (b.seq <= lastSeq) {
          console.warn(`Duplicate bar detected: seq=${b.seq}, lastSeq=${lastSeq}`);
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
        listeners.bar.forEach((fn) => fn(b));

        if (currentState === "connected" || currentState === "replaying_gap") {
          emitStatus("live");
        }
      });
    });

    es.addEventListener("microbar", (e) => {
      const m = JSON.parse((e as MessageEvent).data) as Micro;
      listeners.microbar.forEach((fn) => fn(m));
    });

    es.addEventListener("tick", (e) => {
      const t = JSON.parse((e as MessageEvent).data) as Tick;
      listeners.tick.forEach((fn) => fn(t));
    });

    es.onerror = () => {
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

  // Gap-fill on window focus (user returns to tab after being away)
  const handleFocus = async () => {
    if (lastSeq > 0 && currentState === "live") {
      const symbol = symbols[0] || "SPY";
      try {
        const res = await fetch(
          `/api/history?symbol=${encodeURIComponent(symbol)}&timeframe=1m&sinceSeq=${lastSeq}`,
        );
        if (res.ok) {
          const bars = await res.json();
          bars.forEach((bar: Bar) => {
            if (bar.seq > lastSeq) {
              lastSeq = bar.seq;
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
    `/api/history?symbol=${encodeURIComponent(symbol)}&timeframe=1m&limit=${limit}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load ${preset} history: ${res.statusText}`);
  }
  const bars: Bar[] = await res.json();
  bars.forEach(onBar);
}

export async function fetchHistory(symbol = "SPY", timeframe = "1m", limit = 300) {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    limit: String(limit),
  });

  const res = await fetch(`/api/history?${params.toString()}`);
  if (!res.ok) throw new Error("history fetch failed");

  return (await res.json()) as Bar[];
}
