import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { useLastSeq } from "./useLastSeq";
import { connectMarketSSE, type Bar, type Micro } from "../../lib/marketStream";

export function ChartView() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isPausedRef = useRef(false);
  const [, forceUpdate] = useState({});
  const [lastSeq, setLastSeq] = useLastSeq("SPY", "1m");

  const barUpdateQueueRef = useRef<Bar[]>([]);
  const microbarQueueRef = useRef<Micro[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const currentMinuteRef = useRef<number>(0);
  const currentBarTimeRef = useRef<number>(0);
  const barCountRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    let sseConnection: ReturnType<typeof connectMarketSSE> | null = null;

    const initChart = async () => {
      if (!chartContainerRef.current) return;

      try {
        // Initial history is loaded by Pane; avoid double-fetch here.
        if (!mounted) return;

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
          crosshair: {
            mode: CrosshairMode.Normal,
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
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
        });

        // Chart will be populated by Pane component's history load
        chartRef.current = chart;
        seriesRef.current = series;

        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current?.clientWidth || 0,
              height: chartContainerRef.current?.clientHeight || 0,
            });
          }
        };

        window.addEventListener("resize", handleResize);

        sseConnection = connectMarketSSE(["SPY"], lastSeq ? { sinceSeq: lastSeq } : undefined);

        sseConnection.onBar((bar: Bar) => {
          if (!mounted || !seriesRef.current) return;

          if (barCountRef.current < 3) {
            console.log(`BAR seq=${bar.seq} time=${bar.bar_end} close=${bar.ohlcv.c}`);
            barCountRef.current++;
          }

          setLastSeq(bar.seq);

          barUpdateQueueRef.current.push(bar);

          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(processUpdates);
          }
        });

        sseConnection.onMicro((micro: Micro) => {
          if (!mounted || isPausedRef.current) return;

          microbarQueueRef.current.push(micro);

          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(processUpdates);
          }
        });

        setIsLoading(false);

        return () => {
          window.removeEventListener("resize", handleResize);
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
          }
        };
      } catch (error) {
        console.error("Chart initialization failed:", error);
        setIsLoading(false);
      }
    };

    const processUpdates = () => {
      rafIdRef.current = null;

      if (!seriesRef.current) return;

      if (barUpdateQueueRef.current.length > 0) {
        const bars = barUpdateQueueRef.current;
        barUpdateQueueRef.current = [];

        bars.forEach((bar) => {
          const time = Math.floor(bar.bar_end / 1000) as UTCTimestamp;
          seriesRef.current?.update({
            time,
            open: bar.ohlcv.o,
            high: bar.ohlcv.h,
            low: bar.ohlcv.l,
            close: bar.ohlcv.c,
          });

          currentMinuteRef.current = Math.floor(bar.bar_end / 60000) * 60000;
          currentBarTimeRef.current = time;
        });
      }

      if (microbarQueueRef.current.length > 0) {
        const micro = microbarQueueRef.current[microbarQueueRef.current.length - 1];
        microbarQueueRef.current = [];

        if (!micro) return;

        const microMinute = Math.floor(micro.ts / 60000) * 60000;

        if (microMinute === currentMinuteRef.current && currentBarTimeRef.current > 0) {
          seriesRef.current.update({
            time: currentBarTimeRef.current as UTCTimestamp,
            open: micro.ohlcv.o,
            high: micro.ohlcv.h,
            low: micro.ohlcv.l,
            close: micro.ohlcv.c,
          });
        }
      }

      if (
        document.hidden &&
        (barUpdateQueueRef.current.length > 0 || microbarQueueRef.current.length > 0)
      ) {
        rafIdRef.current = requestAnimationFrame(processUpdates);
      }
    };

    initChart();

    const handleTogglePause = () => {
      isPausedRef.current = !isPausedRef.current;
      forceUpdate({});
    };

    window.addEventListener("hotkey:toggle-stream", handleTogglePause);

    return () => {
      mounted = false;
      window.removeEventListener("hotkey:toggle-stream", handleTogglePause);
      if (sseConnection) {
        sseConnection.close();
      }
      if (chartRef.current) {
        chartRef.current.remove();
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-gray-400">Loading chart...</div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
      <div className="absolute top-2 right-2">
        <div
          className={`px-2 py-1 text-xs font-mono rounded ${
            isPausedRef.current
              ? "bg-amber-500/20 text-amber-400 border border-amber-500"
              : "bg-green-500/20 text-green-400 border border-green-500"
          }`}
        >
          {isPausedRef.current ? "PAUSED" : "LIVE"}
        </div>
      </div>
    </div>
  );
}
