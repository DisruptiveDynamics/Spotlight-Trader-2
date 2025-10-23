import { getHistory } from "@server/history/service";
import { getMarketSource, getMarketReason } from "@server/market/bootstrap";
import { eventBus } from "@server/market/eventBus";
import {
  recordSSEConnection,
  recordSSEDisconnection,
  recordSSEEvent,
  recordSSEBackpressure,
} from "@server/metrics/registry";
import type { Request, Response } from "express";

import { BackpressureController } from "./backpressure";
import { getEpochId, getEpochStartMs } from "./epoch"; // [RESILIENCE] Server restart detection
import { MicrobarBatcher } from "./microbatcher"; // [PHASE-5] SSE micro-batching

/**
 * [DATA-INTEGRITY] Type guard to validate bars have complete OHLCV data
 * Prevents empty { ohlcv: {} } from reaching clients and causing resync loops
 */
function hasCompleteOHLCV(bar: any): boolean {
  return (
    bar &&
    typeof bar.open === "number" && Number.isFinite(bar.open) &&
    typeof bar.high === "number" && Number.isFinite(bar.high) &&
    typeof bar.low === "number" && Number.isFinite(bar.low) &&
    typeof bar.close === "number" && Number.isFinite(bar.close) &&
    typeof bar.volume === "number" && Number.isFinite(bar.volume)
  );
}

export async function sseMarketStream(req: Request, res: Response) {
  const symbolsParam = (req.query.symbols as string) || "SPY";
  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());
  const timeframe = (req.query.timeframe as string) || "1m"; // Allow client to specify timeframe
  
  // [CONFIG] Feature flags for SSE streaming
  const SSE_BUFFER_CAP = Number(process.env.SSE_BUFFER_CAP ?? 1000);
  const SSE_TICKS_ENABLED = (process.env.FF_SSE_TICKS ?? "off").toLowerCase() === "on";
  
  // Parse sinceSeq from query param OR Last-Event-ID header (SSE standard)
  const querySeq = req.query.sinceSeq ? parseInt(req.query.sinceSeq as string, 10) : undefined;
  const lastEventId = req.headers["last-event-id"] ? parseInt(req.headers["last-event-id"] as string, 10) : undefined;
  const sinceSeq = querySeq ?? lastEventId ?? undefined;
  
  // [RESILIENCE] Track per-connection watermark to prevent seq regressions
  let lastSentSeq = sinceSeq ?? 0;
  
  if (sinceSeq !== undefined) {
    console.log(`[SSE] Client resume: sinceSeq=${sinceSeq}, symbols=${symbols.join(",")}`);
  }

  // [RESILIENCE] Include epoch info in headers for client restart detection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  res.setHeader("X-Market-Source", getMarketSource());
  res.setHeader("X-Market-Reason", getMarketReason());
  res.setHeader("X-Epoch-Id", getEpochId());
  res.setHeader("X-Epoch-Start-Ms", String(getEpochStartMs()));
  res.flushHeaders();

  const userId = (req as any).userId || "anonymous";
  recordSSEConnection(userId);

  const bpc = new BackpressureController(res, SSE_BUFFER_CAP);

  // [PERFORMANCE] Send bootstrap event immediately (non-blocking)
  bpc.write("bootstrap", {
    now: Date.now(),
    warm: true,
    symbols,
    timeframe,
  });

  // [RESILIENCE] Send epoch info for client restart detection
  bpc.write("epoch", {
    epochId: getEpochId(),
    epochStartMs: getEpochStartMs(),
    symbols,
    timeframe,
  });

  // [PERFORMANCE] Fetch seed data asynchronously (non-blocking)
  // This allows SSE to connect immediately while history loads in background
  if (sinceSeq !== undefined) {
    Promise.all(
      symbols.map(async (symbol) => {
        try {
          const backfill = await getHistory({ symbol, timeframe: timeframe as any, sinceSeq });
          
          // [RESILIENCE] Emit bars strictly > sinceSeq in ascending order
          const barsToSend = backfill
            .filter((bar) => bar.seq > sinceSeq)
            .sort((a, b) => a.seq - b.seq);
          
          if (barsToSend.length > 0) {
            console.log(`[SSE] Backfilling ${barsToSend.length} bars (seq ${barsToSend[0]!.seq} → ${barsToSend[barsToSend.length - 1]!.seq})`);
          }
          
          // [DATA-INTEGRITY] Filter out bars with incomplete OHLCV
          let skippedCount = 0;
          for (const bar of barsToSend) {
            if (!hasCompleteOHLCV(bar)) {
              console.error(`[SSE] Skipping invalid backfill bar: ${bar.symbol} seq=${bar.seq} (missing OHLCV)`);
              skippedCount++;
              continue;
            }
            
            bpc.write(
              "bar",
              {
                symbol: bar.symbol,
                timeframe,
                seq: bar.seq,
                bar_start: bar.bar_start,
                bar_end: bar.bar_end,
                ohlcv: {
                  o: bar.open,
                  h: bar.high,
                  l: bar.low,
                  c: bar.close,
                  v: bar.volume,
                },
              },
              String(bar.seq),
            );
            lastSentSeq = Math.max(lastSentSeq, bar.seq);
          }
          
          if (skippedCount > 0) {
            console.warn(`[SSE] Skipped ${skippedCount} invalid bars during backfill for ${symbol}`);
          }
        } catch (err) {
          console.error(`Failed to fetch backfill for ${symbol}:`, err);
        }
      }),
    ).catch((err) => {
      console.error("Backfill error:", err);
    });
  } else {
    // Send initial seed data for cold start (async, non-blocking)
    Promise.all(
      symbols.map(async (symbol) => {
        try {
          const seed = await getHistory({ symbol, timeframe: timeframe as any });
          
          // [DATA-INTEGRITY] Filter out bars with incomplete OHLCV
          let skippedCount = 0;
          for (const bar of seed) {
            if (!hasCompleteOHLCV(bar)) {
              console.error(`[SSE] Skipping invalid seed bar: ${bar.symbol} seq=${bar.seq} (missing OHLCV)`);
              skippedCount++;
              continue;
            }
            
            bpc.write(
              "bar",
              {
                symbol: bar.symbol,
                timeframe,
                seq: bar.seq,
                bar_start: bar.bar_start,
                bar_end: bar.bar_end,
                ohlcv: {
                  o: bar.open,
                  h: bar.high,
                  l: bar.low,
                  c: bar.close,
                  v: bar.volume,
                },
              },
              String(bar.seq),
            );
            lastSentSeq = Math.max(lastSentSeq, bar.seq);
          }
          
          if (skippedCount > 0) {
            console.warn(`[SSE] Skipped ${skippedCount} invalid bars during seed for ${symbol}`);
          }
        } catch (err) {
          console.error(`Failed to fetch seed for ${symbol}:`, err);
        }
      }),
    ).catch((err) => {
      console.error("Seed fetch error:", err);
    });
  }

  interface TradingSignal {
    id: string;
    symbol: string;
    direction: string;
    confidence: number;
    ts: Date | number;
  }

  interface MicrobarData {
    symbol: string;
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  interface BarData {
    symbol: string;
    timeframe: string;
    seq: number;
    bar_start: number;
    bar_end: number;
    ohlcv: {
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
    };
  }

  interface TickData {
    ts: number;
    price: number;
    size: number;
    side?: "buy" | "sell" | "unknown";
  }

  type EventHandler = (data: TradingSignal | MicrobarData | BarData | TickData) => void;
  const listeners: Array<{ event: string; handler: EventHandler }> = [];

  const alertHandler = (signal: TradingSignal) => {
    recordSSEEvent("alert");
    bpc.write("alert", {
      id: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      confidence: signal.confidence,
      timestamp: signal.ts instanceof Date ? signal.ts.getTime() : signal.ts,
    });
  };

  eventBus.on("signal:new", alertHandler as any);
  listeners.push({ event: "signal:new", handler: alertHandler as EventHandler });

  // [TIMEFRAME-SWITCH] Listen for bar:reset events when user switches timeframes
  const barResetHandler = (data: any) => {
    recordSSEEvent("bar_reset");
    bpc.write("bar:reset", {
      symbol: data.symbol,
      timeframe: data.timeframe,
      bars: data.bars,
    });
    console.log(`[SSE] Sent bar:reset for ${data.symbol} ${data.timeframe}: ${data.bars.length} bars`);
  };

  eventBus.on("bar:reset", barResetHandler as any);
  listeners.push({ event: "bar:reset", handler: barResetHandler as any });

  // [PHASE-5] Create batcher per symbol (aggregate up to 5 microbars or 20ms)
  const batchers = new Map<string, MicrobarBatcher>();

  for (const symbol of symbols) {
    // [PHASE-5] Create batcher with flush callback
    const batcher = new MicrobarBatcher(
      (batch) => {
        recordSSEEvent("microbar_batch");
        bpc.write("microbar_batch", batch);
      },
      5, // maxBatchSize
      20, // maxDelayMs
    );
    batchers.set(symbol, batcher);

    const microbarHandler = (data: MicrobarData) => {
      // [PHASE-5] Push to batcher instead of immediate write
      const symbolBatcher = batchers.get(symbol);
      if (symbolBatcher) {
        symbolBatcher.push(data);
      } else {
        // Fallback: send immediately if batcher not found (shouldn't happen)
        recordSSEEvent("microbar");
        bpc.write("microbar", {
          symbol: data.symbol,
          ts: data.ts,
          ohlcv: {
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume,
          },
        });
      }
    };

    const barHandler = (data: BarData) => {
      // [RESILIENCE] Prevent seq regressions - only emit bars > lastSentSeq
      if (data.seq <= lastSentSeq) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[SSE] Dropped bar seq=${data.seq} (lastSentSeq=${lastSentSeq})`);
        }
        return;
      }
      
      recordSSEEvent("bar");
      bpc.write(
        "bar",
        {
          symbol: data.symbol,
          timeframe: data.timeframe,
          seq: data.seq,
          bar_start: data.bar_start,
          bar_end: data.bar_end,
          ohlcv: data.ohlcv,
        },
        String(data.seq),
      );
      
      // Update watermark
      lastSentSeq = Math.max(lastSentSeq, data.seq);
    };

    const barEventKey = `bar:new:${symbol}:${timeframe}`;

    eventBus.on(`microbar:${symbol}` as const, microbarHandler as any);
    eventBus.on(barEventKey as any, barHandler as any);

    listeners.push(
      { event: `microbar:${symbol}`, handler: microbarHandler as EventHandler },
      { event: barEventKey, handler: barHandler as EventHandler },
    );

    // [CONFIG] Tick streaming (disabled by default for stability)
    if (SSE_TICKS_ENABLED) {
      const tickHandler = (tick: TickData) => {
        recordSSEEvent("tick");
        bpc.write("tick", {
          symbol,
          ts: tick.ts,
          price: tick.price,
          size: tick.size,
          side: tick.side,
        });
      };
      
      eventBus.on(`tick:${symbol}` as const, tickHandler as any);
      listeners.push({ event: `tick:${symbol}`, handler: tickHandler as EventHandler });
    }
  }

  let lastDropped = 0;

  // [RESILIENCE] Send SSE heartbeat every 15s to prevent proxy idle timeout
  // Uses standard SSE comment format (`: \n\n`) for maximum compatibility
  const heartbeat = setInterval(() => {
    try {
      // Send standard SSE heartbeat comment (prevents proxy buffering/timeout)
      res.write(": heartbeat\n\n");
      
      // Monitor backpressure for observability
      const stats = bpc.getStats();
      if (stats.dropped > lastDropped) {
        const dropped = stats.dropped - lastDropped;
        console.warn(`[SSE] Backpressure: ${dropped} events dropped (buffer cap: ${SSE_BUFFER_CAP})`);
        lastDropped = stats.dropped;
      }
      recordSSEBackpressure(stats.buffered, stats.dropped, lastDropped);
    } catch (err) {
      console.warn("[SSE] Heartbeat write failed:", err);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    listeners.forEach(({ event, handler }) => {
      eventBus.off(event as any, handler);
    });
    // [PHASE-5] Destroy all batchers on disconnect
    batchers.forEach((batcher) => batcher.destroy());
    batchers.clear();
    bpc.destroy();
    recordSSEDisconnection(userId);
  });
}
