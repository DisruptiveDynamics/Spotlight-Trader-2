import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
} from "lightweight-charts";

import { toCandleData, toVolumeData, toSec } from "../../lib/chartAdapters";
import { fetchHistory, type HistoryCandle } from "../../lib/history";
import { connectMarketSSE, type Bar } from "../../lib/marketStream";
import { useChartState } from "../../state/chartState";
import { getVolumeColor } from "@shared";

interface PaneProps {
  paneId?: number;
  className?: string;
}

export function PaneStable({ className = "" }: PaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { active } = useChartState();
  const seedKey = `${active.symbol}:${active.timeframe}`;

  const chartOptions = useMemo(
    () => ({
      autoSize: true,
      layout: {
        background: { color: "#0B0F14" },
        textColor: "#C9D1D9",
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
        rightOffset: 5,
      },
      grid: {
        vertLines: { color: "#1F2937" },
        horzLines: { color: "#1F2937" },
      },
      crosshair: {
        mode: 1,
      },
    }),
    []
  );

  const priceSeriesOptions = useMemo(
    () => ({
      priceLineVisible: false,
      upColor: "#16A34A",
      downColor: "#DC2626",
      wickUpColor: "#16A34A",
      wickDownColor: "#DC2626",
      borderVisible: false,
    }),
    []
  );

  const volumeSeriesOptions = useMemo(
    () => ({
      priceFormat: {
        type: "volume" as const,
      },
      priceScaleId: "",
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    }),
    []
  );

  // Initialize chart once on mount
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    try {
      const chart = createChart(containerRef.current, chartOptions);
      chartRef.current = chart;

      const priceSeries = chart.addCandlestickSeries(priceSeriesOptions);
      priceSeriesRef.current = priceSeries;

      const volumeSeries = chart.addHistogramSeries(volumeSeriesOptions);
      volumeSeriesRef.current = volumeSeries;

      const resizeObserver = new ResizeObserver(() => {
        chart.timeScale().fitContent();
      });
      resizeObserver.observe(containerRef.current);
      resizeObserverRef.current = resizeObserver;
    } catch (err) {
      console.error("Failed to create chart:", err);
      setError("Failed to initialize chart");
    }

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      
      try {
        chartRef.current?.remove();
      } catch (err) {
        console.error("Error removing chart:", err);
      }
      
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [chartOptions, priceSeriesOptions, volumeSeriesOptions]);

  // Load history when symbol/timeframe changes
  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      if (!priceSeriesRef.current || !volumeSeriesRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        const history = await fetchHistory(active.symbol, active.timeframe, 300);

        if (!mounted) return;

        // Convert history to chart data (already in seconds from fetchHistory)
        const candles: CandlestickData[] = history
          .map((bar) => ({
            time: bar.time as any,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          }))
          .sort((a, b) => Number(a.time) - Number(b.time));

        const volumes: HistogramData[] = history
          .map((bar) => ({
            time: bar.time as any,
            value: bar.volume,
            // Apply session-aware coloring (muted during extended hours)
            color: getVolumeColor(bar.close, bar.open, bar.time * 1000),
          }))
          .sort((a, b) => Number(a.time) - Number(b.time));

        priceSeriesRef.current.setData(candles);
        volumeSeriesRef.current.setData(volumes);
        
        chartRef.current?.timeScale().fitContent();
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load history:", err);
        if (mounted) {
          setError("Failed to load chart data");
          setIsLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      mounted = false;
    };
  }, [seedKey, active.symbol, active.timeframe]);

  // Subscribe to live SSE updates
  useEffect(() => {
    const sseConnection = connectMarketSSE([active.symbol], {
      timeframe: active.timeframe,
    });

    sseConnection.onBar((bar: Bar) => {
      if (!priceSeriesRef.current || !volumeSeriesRef.current) return;
      
      // Only process bars that match our timeframe
      if (bar.timeframe !== active.timeframe) return;

      try {
        const candle = toCandleData(bar);
        const volume = toVolumeData(bar);

        priceSeriesRef.current.update(candle);
        volumeSeriesRef.current.update(volume);
      } catch (err) {
        console.error("Failed to update chart with bar:", err);
      }
    });

    return () => {
      sseConnection.close();
    };
  }, [active.symbol, active.timeframe]);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/50 rounded">
          <div className="text-sm text-gray-400">
            Loading {active.symbol} {active.timeframe}...
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/50 rounded">
          <div className="text-sm text-red-400">{error}</div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
