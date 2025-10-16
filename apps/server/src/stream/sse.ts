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

export async function sseMarketStream(req: Request, res: Response) {
  const symbolsParam = (req.query.symbols as string) || "SPY";
  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());
  const timeframe = (req.query.timeframe as string) || "1m"; // Allow client to specify timeframe
  const sinceSeq = req.query.sinceSeq ? parseInt(req.query.sinceSeq as string, 10) : undefined;

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

  const bpc = new BackpressureController(res, 100);

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
          for (const bar of backfill) {
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
          for (const bar of seed) {
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
    };

    // Tick streaming for real-time "tape" feel
    const tickHandler = (tick: TickData) => {
      recordSSEEvent("tick");
      bpc.write("tick", {
        symbol,
        ts: tick.ts,
        price: tick.price,
        size: tick.size,
        side: tick.side, // 'buy' | 'sell' for color coding
      });
    };

    const barEventKey = `bar:new:${symbol}:${timeframe}`;

    eventBus.on(`microbar:${symbol}` as const, microbarHandler as any);
    eventBus.on(barEventKey as any, barHandler as any);
    eventBus.on(`tick:${symbol}` as const, tickHandler as any);

    listeners.push(
      { event: `microbar:${symbol}`, handler: microbarHandler as EventHandler },
      { event: barEventKey, handler: barHandler as EventHandler },
      { event: `tick:${symbol}`, handler: tickHandler as EventHandler },
    );
  }

  let lastDropped = 0;

  // [RESILIENCE] Send ping event every 10s to prevent proxy idle timeout
  // Also monitors backpressure stats for observability
  const heartbeat = setInterval(() => {
    const stats = bpc.getStats();
    bpc.write("ping", { 
      ts: Date.now(),
      buffered: stats.buffered,
      dropped: stats.dropped 
    });
    recordSSEBackpressure(stats.buffered, stats.dropped, lastDropped);
    lastDropped = stats.dropped;
  }, 10000);

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
