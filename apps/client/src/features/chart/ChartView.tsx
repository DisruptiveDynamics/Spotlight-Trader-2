import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from "lightweight-charts";
import { TIMEFRAME_TO_BUCKET_MIN } from "@shared/types/market";
import { connectMarketSSE, type Bar, type Micro } from "../../lib/marketStream";
import { fetchHistory } from "../../lib/history";
import { useChartState } from "../../state/chartState";
import { useLastSeq } from "./useLastSeq";

export function ChartView() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const barUpdateQueueRef = useRef<Bar[]>([]);
  const microbarQueueRef = useRef<Micro[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const currentCandleRef = useRef<{ time: UTCTimestamp; o: number; h: number; l: number; c: number } | null>(null);
  const visibleRef = useRef(true);

  // Read active symbol and timeframe from global state
  const { active } = useChartState();
  const { symbol, timeframe } = active;

  const [epochId, setEpochId] = useState<string | null>(null);
  const [lastSeq, setLastSeq, resetSeqForTf] = useLastSeq(symbol, timeframe, epochId);
  const lastSeqRef = useRef<number | null>(lastSeq);
  
  // Keep ref in sync with state
  useEffect(() => {
    lastSeqRef.current = lastSeq;
  }, [lastSeq]);

  const msToUtc = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

  const barToCandle = (bar: Bar) => ({
    time: msToUtc(bar.bar_start),
    o: bar.ohlcv.o,
    h: bar.ohlcv.h,
    l: bar.ohlcv.l,
    c: bar.ohlcv.c,
  });

  const toCandlestickData = (c: { time: UTCTimestamp; o: number; h: number; l: number; c: number }): CandlestickData => ({
    time: c.time,
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
  });

  const applyMicroToCandle = (micro: Micro) => {
    // Use dynamic bucket size based on active timeframe
    const bucketMinutes = TIMEFRAME_TO_BUCKET_MIN[timeframe as keyof typeof TIMEFRAME_TO_BUCKET_MIN] || 1;
    const bucketMs = bucketMinutes * 60000;
    const bucketStart = Math.floor(micro.ts / bucketMs) * bucketMs;
    const time = msToUtc(bucketStart);
    const { o, h, l, c } = micro.ohlcv;

    if (!currentCandleRef.current || currentCandleRef.current.time !== time) {
      currentCandleRef.current = { time, o, h, l, c };
    } else {
      const cur = currentCandleRef.current;
      cur.c = c;
      cur.h = Math.max(cur.h, h, c);
      cur.l = Math.min(cur.l, l, c);
    }
  };

  const flushQueues = () => {
    if (!seriesRef.current) return;

    // 1) Finalized bars
    let nextBar: Bar | undefined;
    while ((nextBar = barUpdateQueueRef.current.shift())) {
      const candle = barToCandle(nextBar);
      currentCandleRef.current = candle;
      seriesRef.current.update(toCandlestickData(candle));
    }

    // 2) Microbars for active bucket
    let nextMicro: Micro | undefined;
    while ((nextMicro = microbarQueueRef.current.shift())) {
      applyMicroToCandle(nextMicro);
    }

    // 3) Push the latest in-progress candle
    if (currentCandleRef.current) {
      seriesRef.current.update(toCandlestickData(currentCandleRef.current));
    }
  };

  useEffect(() => {
    visibleRef.current = document.visibilityState === "visible";
    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Main chart initialization and SSE connection
  // Re-runs when symbol or timeframe changes
  useEffect(() => {
    let mounted = true;
    let cleanupFn: (() => void) | null = null;

    const init = async () => {
      if (!chartContainerRef.current) return;
      const { createChart, CrosshairMode } = await import("lightweight-charts");

      // Abort if unmounted during async import
      if (!mounted) return;

      // Clear existing chart if it exists
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { color: "#1a1a1a" },
          textColor: "#d1d5db",
        },
        grid: {
          vertLines: { color: "#374151" },
          horzLines: { color: "#374151" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 2,
          barSpacing: 8,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });

      const series = chart.addCandlestickSeries({
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
        priceLineVisible: true,
        priceLineColor: "#9CA3AF",
        lastValueVisible: true,
      });

      chartRef.current = chart;
      seriesRef.current = series;

      // Load historical data for the selected timeframe
      try {
        const history = await fetchHistory(symbol, timeframe, 300);
        // Abort if unmounted during fetch
        if (!mounted) return;
        
        if (history.length > 0) {
          // Convert HistoryCandle[] to CandlestickData[]
          const candlestickData = history.map(bar => ({
            time: bar.time as UTCTimestamp,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          }));
          series.setData(candlestickData);
          if (import.meta.env?.MODE === "development") {
            console.log(`📊 Loaded ${history.length} bars for ${symbol} ${timeframe}`);
          }
        }
      } catch (error) {
        console.error("[ChartView] Failed to load history:", error);
      }

      // Abort if unmounted during history fetch
      if (!mounted) return;

      const handleResize = () => {
        if (!chartContainerRef.current || !chart) return;
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      };

      window.addEventListener("resize", handleResize);

      // Connect to SSE with active symbol and timeframe
      const sseOptions: { timeframe: string; sinceSeq?: number } = { timeframe };
      if (lastSeqRef.current) {
        sseOptions.sinceSeq = lastSeqRef.current;
      }
      const sseConnection = connectMarketSSE([symbol], sseOptions);

      sseConnection.onEpoch((e: { epochId: string; epochStartMs: number }) => {
        if (!mounted) return;
        if (!epochId) {
          setEpochId(e.epochId);
        } else if (epochId !== e.epochId) {
          console.log(`🔄 Epoch changed: ${epochId.slice(0, 8)} → ${e.epochId.slice(0, 8)}, resetting sequence`);
          resetSeqForTf();
          setEpochId(e.epochId);
        }
      });

      sseConnection.onBar((bar: Bar) => {
        if (!mounted) return;
        setLastSeq(bar.seq);
        barUpdateQueueRef.current.push(bar);
      });

      sseConnection.onMicro((micro: Micro) => {
        if (!mounted) return;
        microbarQueueRef.current.push(micro);
      });

      const tick = () => {
        if (!mounted) return;
        if (visibleRef.current) {
          flushQueues();
        }
        const rafId = requestAnimationFrame(tick);
        rafIdRef.current = rafId;
      };
      const rafId = requestAnimationFrame(tick);
      rafIdRef.current = rafId;

      // Create cleanup function for THIS init's resources
      cleanupFn = () => {
        mounted = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        window.removeEventListener("resize", handleResize);
        sseConnection?.close?.();
        chart?.remove?.();
        chartRef.current = null;
        seriesRef.current = null;
        rafIdRef.current = null;
      };
    };

    // Start initialization
    init();

    // Cleanup runs synchronously when symbol/timeframe changes
    return () => {
      mounted = false;
      // Call the captured cleanup function if it was created
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [symbol, timeframe, epochId]); // Re-run when symbol or timeframe changes

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
