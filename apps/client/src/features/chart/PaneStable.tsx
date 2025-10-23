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
import { formatTickET, formatTooltipET } from "../../lib/timeFormatET";

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
  
  // Track oldest loaded bar for infinite scrolling
  const oldestBarTimeRef = useRef<number | null>(null);
  const isLoadingMoreRef = useRef(false);
  
  // Maintain local buffers for all candles and volumes
  const candlesBufferRef = useRef<CandlestickData[]>([]);
  const volumesBufferRef = useRef<HistogramData[]>([]);
  
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
        tickMarkFormatter: formatTickET,
      },
      localization: {
        timeFormatter: formatTooltipET,
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

  // Function to load more historical data (for infinite scrolling)
  const loadMoreHistory = async () => {
    if (!priceSeriesRef.current || !volumeSeriesRef.current || !oldestBarTimeRef.current) return;
    if (isLoadingMoreRef.current) return; // Prevent concurrent fetches
    
    try {
      isLoadingMoreRef.current = true;
      
      // Fetch 200 bars before the oldest bar we have (convert seconds to milliseconds)
      const oldestBarMs = oldestBarTimeRef.current * 1000;
      const history = await fetchHistory(active.symbol, active.timeframe, 200, oldestBarMs);
      
      if (!history.length) {
        console.log("📊 No more historical data available");
        isLoadingMoreRef.current = false;
        return;
      }
      
      // Sort oldest to newest for correct ordering
      history.sort((a, b) => a.time - b.time);
      
      // Convert to chart format
      const newCandles: CandlestickData[] = history.map((bar) => ({
        time: bar.time as any,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));
      
      const newVolumes: HistogramData[] = history.map((bar) => ({
        time: bar.time as any,
        value: bar.volume,
        color: getVolumeColor(bar.close, bar.open, bar.time * 1000),
      }));
      
      // Merge with existing buffers (prepend older data)
      candlesBufferRef.current = [...newCandles, ...candlesBufferRef.current];
      volumesBufferRef.current = [...newVolumes, ...volumesBufferRef.current];
      
      // Update oldest bar reference to the EARLIEST timestamp
      oldestBarTimeRef.current = newCandles[0].time as number;
      
      // Use setData() to update the entire series with merged data
      priceSeriesRef.current.setData(candlesBufferRef.current);
      volumeSeriesRef.current.setData(volumesBufferRef.current);
      
      console.log(`📊 Loaded ${history.length} more historical bars going back to ${new Date(history[0].msEnd).toLocaleString()}`);
      isLoadingMoreRef.current = false;
    } catch (err) {
      console.error("Failed to load more history:", err);
      isLoadingMoreRef.current = false;
    }
  };

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

        // Store in buffers for infinite scrolling
        candlesBufferRef.current = candles;
        volumesBufferRef.current = volumes;
        
        priceSeriesRef.current.setData(candles);
        volumeSeriesRef.current.setData(volumes);
        
        // Track oldest bar for infinite scrolling
        if (candles.length > 0) {
          oldestBarTimeRef.current = Number(candles[0].time);
        }
        
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

  // Infinite scrolling: load more data when user scrolls near left edge
  useEffect(() => {
    if (!chartRef.current) return;
    
    let debounceTimer: NodeJS.Timeout | null = null;
    
    // Stable handler reference for proper unsubscribe
    const handleVisibleRangeChange = () => {
      if (!chartRef.current || !oldestBarTimeRef.current) return;
      
      // Debounce to avoid excessive fetches during rapid scrolling
      if (debounceTimer) clearTimeout(debounceTimer);
      
      debounceTimer = setTimeout(() => {
        if (!chartRef.current) return;
        
        const timeScale = chartRef.current.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();
        
        if (!visibleRange) return;
        
        // If user is scrolled within 20 bars of the left edge, load more
        if (visibleRange.from < 20 && !isLoadingMoreRef.current) {
          loadMoreHistory();
        }
      }, 300); // 300ms debounce
    };
    
    // Subscribe with stable handler reference
    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    
    return () => {
      // Clean up debounce timer
      if (debounceTimer) clearTimeout(debounceTimer);
      
      // Unsubscribe using the same handler reference
      if (chartRef.current) {
        chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      }
    };
  }, [seedKey, active.symbol, active.timeframe]);

  // Subscribe to live SSE updates with proper cleanup
  useEffect(() => {
    const sseConnection = connectMarketSSE([active.symbol], {
      timeframe: active.timeframe,
    });

    // Keep stable handler reference for proper unsubscribe
    const handleBar = (bar: Bar) => {
      if (!priceSeriesRef.current || !volumeSeriesRef.current) return;
      
      // Only process bars that match our timeframe
      if (bar.timeframe !== active.timeframe) return;

      try {
        const candle = toCandleData(bar);
        const volume = toVolumeData(bar);

        // Update the chart (lightweight-charts handles updates efficiently)
        priceSeriesRef.current.update(candle);
        volumeSeriesRef.current.update(volume);
        
        // Also update buffers for infinite scrolling consistency
        // Find and update existing bar, or append new one
        const candleTime = Number(candle.time);
        const existingCandleIdx = candlesBufferRef.current.findIndex(c => Number(c.time) === candleTime);
        
        if (existingCandleIdx >= 0) {
          // Update existing bar
          candlesBufferRef.current[existingCandleIdx] = candle;
          volumesBufferRef.current[existingCandleIdx] = volume;
        } else {
          // Append new bar
          candlesBufferRef.current.push(candle);
          volumesBufferRef.current.push(volume);
        }
      } catch (err) {
        console.error("Failed to update chart with bar:", err);
      }
    };

    sseConnection.onBar(handleBar);

    return () => {
      // Properly unsubscribe using same handler reference before closing
      sseConnection.offBar(handleBar);
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
