import type { Request, Response } from "express";
import { eventBus } from "@server/market/eventBus";
import { getHistory } from "@server/history/service";
import { BackpressureController } from "./backpressure";
import {
  recordSSEConnection,
  recordSSEDisconnection,
  recordSSEEvent,
  recordSSEBackpressure,
} from "@server/metrics/registry";
import { getMarketSource, getMarketReason } from "@server/market/bootstrap";
import { getEpochId, getEpochStartMs } from "./epoch"; // [RESILIENCE] Server restart detection

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
                timeframe: bar.timeframe,
                seq: bar.seq,
                bar_start: bar.bar_start,
                bar_end: bar.bar_end,
                ohlcv: bar.ohlcv,
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
                timeframe: bar.timeframe,
                seq: bar.seq,
                bar_start: bar.bar_start,
                bar_end: bar.bar_end,
                ohlcv: bar.ohlcv,
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

  const listeners: Array<{ event: string; handler: (data: any) => void }> = [];

  const alertHandler = (signal: any) => {
    recordSSEEvent("alert");
    bpc.write("alert", {
      id: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      confidence: signal.confidence,
      timestamp: signal.ts,
    });
  };

  eventBus.on("signal:new", alertHandler);
  listeners.push({ event: "signal:new", handler: alertHandler });

  for (const symbol of symbols) {
    const microbarHandler = (data: any) => {
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
    };

    const barHandler = (data: any) => {
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
    const tickHandler = (tick: any) => {
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

    eventBus.on(`microbar:${symbol}` as const, microbarHandler);
    eventBus.on(barEventKey as any, barHandler);
    eventBus.on(`tick:${symbol}` as const, tickHandler);

    listeners.push(
      { event: `microbar:${symbol}`, handler: microbarHandler },
      { event: barEventKey, handler: barHandler },
      { event: `tick:${symbol}`, handler: tickHandler },
    );
  }

  let lastDropped = 0;

  const heartbeat = setInterval(() => {
    res.write(":\n\n");
    const stats = bpc.getStats();
    recordSSEBackpressure(stats.buffered, stats.dropped, lastDropped);
    lastDropped = stats.dropped;
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    listeners.forEach(({ event, handler }) => {
      eventBus.off(event as any, handler);
    });
    bpc.destroy();
    recordSSEDisconnection(userId);
  });
}
