import { ringBuffer } from "@server/cache/ring";
import { bars1m } from "@server/chart/bars1m";
import { coachAdvisor } from "@server/coach/advisor";
import { getHistory } from "@server/history/service";
import { sessionVWAP } from "@server/indicators/vwap";
import { marketAuditTap } from "@server/market/auditTap";
import { barBuilder } from "@server/market/barBuilder";
import { getMarketSource, getMarketReason } from "@server/market/bootstrap";
import { eventBus } from "@server/market/eventBus";
import { polygonWs } from "@server/market/polygonWs";
import { isRthOpen } from "@server/market/session";
import { subscribeSymbol } from "@server/market/symbolManager";
import { handleChartTimeframe } from "@server/routes/chartTimeframe";
import { rulesEngineService } from "@server/rules/service";
import { signalsService } from "@server/signals/service";
import { sseMarketStream } from "@server/stream/sse";
import type { Express } from "express";

const DEFAULT_FAVORITES = ["SPY", "QQQ"];
const DEFAULT_TIMEFRAME = "1m";

// Track active timeframe subscriptions per symbol
const activeSubscriptions = new Map<string, string>();
// Track bar listeners to properly remove them
const barListeners = new Map<string, (bar: any) => void>();

// [COALESCING] Track in-flight history requests to prevent duplicate fetches
// Key: `symbol:timeframe:limit:before:sinceSeq`, Value: Promise<Bar[]>
const inflightHistoryRequests = new Map<string, Promise<any>>();

function subscribeSymbolTimeframe(symbol: string, timeframe: string) {
  // CRITICAL: Always ensure 1m barBuilder subscription exists
  // The 1m feed is authoritative and feeds bars1m, VWAP, voice tools, and rollups
  // This MUST stay active regardless of user's selected timeframe
  barBuilder.subscribe(symbol, "1m");

  // CRITICAL: Always listen to 1m bars for bars1m buffer (single source of truth)
  // This listener NEVER gets removed - it's the foundation of the entire system
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
    console.log(`📊 [CRITICAL] Subscribed ${symbol} to 1m authoritative feed (never removed)`);
  }

  // Now handle user-specific timeframe subscription for SSE streaming
  // Remove ALL old timeframe listeners (including 1m ring listener)
  const oldTimeframe = activeSubscriptions.get(symbol);
  if (oldTimeframe) {
    // Remove old non-1m listener
    if (oldTimeframe !== "1m") {
      const oldKey = `${symbol}:${oldTimeframe}`;
      const oldListener = barListeners.get(oldKey);
      if (oldListener) {
        eventBus.off(`bar:new:${symbol}:${oldTimeframe}` as any, oldListener);
        barListeners.delete(oldKey);
      }
    } else {
      // Remove old 1m ring listener
      const oldRingKey = `${symbol}:1m:ring`;
      const oldRingListener = barListeners.get(oldRingKey);
      if (oldRingListener) {
        eventBus.off(`bar:new:${symbol}:1m` as any, oldRingListener);
        barListeners.delete(oldRingKey);
      }
    }
  }

  // Subscribe to user's selected timeframe for SSE streaming
  if (timeframe !== "1m") {
    // For higher timeframes, listen to rolled bar events
    const timeframeKey = `${symbol}:${timeframe}`;
    const timeframeListener = (bar: any) => {
      // Feed rolled bars to ring buffer for SSE streaming
      ringBuffer.putBars(symbol, [bar]);
    };
    barListeners.set(timeframeKey, timeframeListener);
    eventBus.on(`bar:new:${symbol}:${timeframe}` as any, timeframeListener);
  } else {
    // For 1m, add separate ring buffer listener (distinct from bars1m listener)
    const ringKey = `${symbol}:1m:ring`;
    const ringListener = (bar: any) => {
      ringBuffer.putBars(symbol, [bar]);
    };
    barListeners.set(ringKey, ringListener);
    eventBus.on(`bar:new:${symbol}:1m` as any, ringListener);
  }

  activeSubscriptions.set(symbol, timeframe);
  console.log(`📊 Subscribed ${symbol} to ${timeframe} timeframe`);
}

export function initializeMarketPipeline(app: Express) {
  polygonWs.connect();

  rulesEngineService.start();
  signalsService.start();
  coachAdvisor.start();

  // Start optional audit tap (disabled by default via flag)
  marketAuditTap.start();

  // Subscribe to default favorites using SymbolManager
  // This enables live data + seeds historical bars immediately
  for (const symbol of DEFAULT_FAVORITES) {
    subscribeSymbol(symbol, { seedLimit: 200 }).catch((err) => {
      console.error(`Failed to subscribe ${symbol}:`, err);
    });
  }

  // [PERFORMANCE] Paged history endpoint for lazy loading
  // Supports: initial load, gap-fill (sinceSeq), and scroll-back pagination (before)
  app.get("/api/history", async (req, res) => {
    try {
      const { symbol, timeframe = "1m", limit = 500, before, sinceSeq } = req.query;

      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({ error: "symbol is required" });
      }

      // Validate timeframe
      const validTimeframes = ["1m", "2m", "5m", "10m", "15m", "30m", "1h"];
      if (typeof timeframe === "string" && !validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: "Invalid timeframe" });
      }

      // Parse and validate limit (100-1000 bars per page)
      const parsedLimit = limit ? parseInt(limit as string, 10) : 500;
      const validatedLimit = Math.min(Math.max(parsedLimit, 100), 1000);

      const query: any = {
        symbol: symbol.toUpperCase(),
        timeframe: typeof timeframe === "string" ? timeframe : "1m",
        limit: validatedLimit,
      };

      // before: timestamp for scrolling back in time (pagination)
      if (before) {
        query.before = parseInt(before as string, 10);
      }

      // sinceSeq: sequence number for gap-filling
      if (sinceSeq) {
        query.sinceSeq = parseInt(sinceSeq as string, 10);
      }

      // [COALESCING] Create unique key for this request
      const requestKey = `${query.symbol}:${query.timeframe}:${query.limit}:${query.before || ''}:${query.sinceSeq || ''}`;
      
      // Check if identical request is already in flight
      let requestPromise = inflightHistoryRequests.get(requestKey);
      
      if (requestPromise) {
        console.log(`♻️ Coalescing duplicate history request: ${requestKey}`);
      } else {
        // Create new request and track it
        requestPromise = getHistory(query).finally(() => {
          // Clean up when done
          inflightHistoryRequests.delete(requestKey);
        });
        inflightHistoryRequests.set(requestKey, requestPromise);
      }

      const bars = await requestPromise;

      // Bars already have nested ohlcv format, just return them
      res.json(bars);
    } catch (err) {
      console.error("History API error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/realtime/sse", sseMarketStream); // No auth for personal app

  // Endpoint to change timeframe for a symbol (replaced with new implementation)
  app.post("/api/chart/timeframe", handleChartTimeframe);

  app.get("/api/market/status", (_req, res) => {
    const source = getMarketSource();
    const reason = getMarketReason();
    const sessionStatus = isRthOpen();

    res.setHeader("X-Market-Source", source);
    res.setHeader("X-Market-Reason", reason);
    res.setHeader("X-Market-Session", sessionStatus.session);
    res.setHeader("X-Market-Open", String(sessionStatus.open));

    res.json({
      source,
      reason,
      session: sessionStatus.session,
      open: sessionStatus.open,
    });
  });

  app.get("/ready", (_req, res) => {
    const isReady = true;

    if (isReady) {
      res.json({ status: "ready", timestamp: Date.now() });
    } else {
      res.status(503).json({ status: "not ready" });
    }
  });

  console.log("✅ Market pipeline initialized");
  console.log(`   Subscribed symbols: ${DEFAULT_FAVORITES.join(", ")}`);
  console.log("✅ Rules engine started");
  console.log("✅ Signals service started");
  console.log("✅ Coach advisor started");
}
