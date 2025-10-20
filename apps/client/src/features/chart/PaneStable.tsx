import { useEffect, useMemo, useRef, useState } from "react";
import type { CandlestickData, Time } from "lightweight-charts";

import { useLightweightChart } from "./useLightweightChart";
import { toCandleData } from "../../lib/chartAdapters";
import { fetchHistory } from "../../lib/history";
import { connectMarketSSE, type Bar } from "../../lib/marketStream";
import { useChartState } from "../../state/chartState";

interface PaneProps {
  paneId?: number;
  className?: string;
}

export function PaneStable({ className = "" }: PaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [seed, setSeed] = useState<CandlestickData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const { active } = useChartState();

  const chartOptions = useMemo(
    () => ({
      autoSize: true,
      layout: {
        background: { color: "#1a1a1a" },
        textColor: "#9ca3af",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#2a2a2a" },
        horzLines: { color: "#2a2a2a" },
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
        secondsVisible: false,
      },
    }),
    []
  );

  const seriesOptions = useMemo(
    () => ({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    }),
    []
  );

  const seedKey = `${active.symbol}:${active.timeframe}`;

  const { update } = useLightweightChart(containerRef, {
    chartOptions,
    seriesOptions,
    seedKey,
    seed,
  });

  // Load history when symbol/timeframe changes
  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      try {
        setIsLoading(true);
        const history = await fetchHistory(active.symbol, active.timeframe, 300);

        if (!mounted) return;

        // Convert server data (ms) to chart format (seconds)
        // History already has time in seconds, just use it directly
        const seedCandles: CandlestickData[] = history
          .map((bar) => ({
            time: bar.time as Time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          }))
          .sort((a, b) => Number(a.time) - Number(b.time));

        setSeed(seedCandles);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load history:", error);
        setIsLoading(false);
      }
    };

    loadHistory();

    return () => {
      mounted = false;
    };
  }, [active.symbol, active.timeframe]);

  // Subscribe to live data
  useEffect(() => {
    const sseConnection = connectMarketSSE([active.symbol]);

    sseConnection.onBar((bar: Bar) => {
      // Convert and update chart
      const candle = toCandleData(bar);
      update(candle);
    });

    return () => {
      sseConnection.close();
    };
  }, [active.symbol, update]);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/50">
          <div className="text-sm text-gray-400">Loading {active.symbol}...</div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
