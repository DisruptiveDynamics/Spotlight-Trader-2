import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from "lightweight-charts";
import { connectMarketSSE, type Bar, type Micro } from "../../lib/marketStream";
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

  const [lastSeq, setLastSeq] = useLastSeq("SPY", "1m");
  const [, forceRerender] = useState({});

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
    const minuteStart = Math.floor(micro.ts / 60000) * 60000;
    const time = msToUtc(minuteStart);
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

    // 2) Microbars for active minute
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

  useEffect(() => {
    let mounted = true;
    let sseConnection: ReturnType<typeof connectMarketSSE> | null = null;

    const init = async () => {
      if (!chartContainerRef.current) return;
      const { createChart, CrosshairMode } = await import("lightweight-charts");

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

      const handleResize = () => {
        if (!chartContainerRef.current || !chartRef.current) return;
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      };

      window.addEventListener("resize", handleResize);

      sseConnection = connectMarketSSE(["SPY"], lastSeq ? { sinceSeq: lastSeq } : undefined);

      sseConnection.onBar((bar: Bar) => {
        if (!mounted) return;
        setLastSeq(bar.seq);
        barUpdateQueueRef.current.push(bar);
      });

      sseConnection.onMicrobar((micro: Micro) => {
        if (!mounted) return;
        microbarQueueRef.current.push(micro);
      });

      const tick = () => {
        if (visibleRef.current) {
          flushQueues();
        }
        rafIdRef.current = requestAnimationFrame(tick);
      };
      rafIdRef.current = requestAnimationFrame(tick);

      return () => {
        mounted = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        window.removeEventListener("resize", handleResize);
        sseConnection?.close?.();
        chartRef.current?.remove?.();
        chartRef.current = null;
        seriesRef.current = null;
      };
    };

    const cleanupPromise = init();
    return () => {
      Promise.resolve(cleanupPromise).catch(() => void 0);
    };
  }, [lastSeq, setLastSeq]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
