import {
  emaBatch,
  bollingerBatch,
  vwapSessionBatch,
  vwapAnchoredBatch,
  volumeSmaBatch,
  type Candle,
} from "@spotlight/shared";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import { useEffect, useRef, useState, useMemo } from "react";

import { useChartContext } from "./hooks/useChartContext";
import { fetchHistory, sessionStartMs } from "../../lib/history";
import { connectMarketSSE, type Bar, type Micro } from "../../lib/marketStream";
import { useChartState } from "../../state/chartState";

interface PaneProps {
  paneId: number;
  className?: string;
}

export function Pane({ className = "" }: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Bar"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: any } | null>(null);

  const { active, chartStyle, overlays, setVwapAnchor } = useChartState();

  const currentMinuteRef = useRef<number>(0);
  const currentBarTimeRef = useRef<number>(0);

  const [showExplainButton, setShowExplainButton] = useState(false);

  // RAF batching for smooth rendering
  const barQueueRef = useRef<Bar[]>([]);
  const microQueueRef = useRef<Micro[]>([]);
  const rafIdRef = useRef<number | null>(null);

  // Schedule batch processing on next animation frame
  const scheduleProcess = () => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(processBatches);
  };

  // Process queued bars and micros in batches
  const processBatches = () => {
    rafIdRef.current = null;
    const bars = barQueueRef.current;
    const micros = microQueueRef.current;
    barQueueRef.current = [];
    microQueueRef.current = [];

    if (bars.length && seriesRef.current && volumeSeriesRef.current) {
      for (const bar of bars) {
        const time = Math.floor(bar.bar_end / 1000) as UTCTimestamp;
        const { o, h, l, c, v } = bar.ohlcv;

        // Validate numeric fields before update
        if ([o, h, l, c].some((n) => n == null || Number.isNaN(n))) continue;

        if (chartStyle === "line") {
          seriesRef.current.update({ time, value: c });
        } else {
          seriesRef.current.update({ time, open: o, high: h, low: l, close: c });
        }

        if (v != null && !Number.isNaN(v)) {
          volumeSeriesRef.current.update({
            time,
            value: v,
            color: c >= o ? "#10b98166" : "#ef444466",
          });
        }

        const newCandle: Candle = { t: bar.bar_end, ohlcv: bar.ohlcv };
        setCandles((prev) => {
          const last = prev[prev.length - 1];
          return last && last.t === newCandle.t
            ? [...prev.slice(0, -1), newCandle]
            : [...prev, newCandle];
        });

        currentMinuteRef.current = Math.floor(bar.bar_end / 60000) * 60000;
        currentBarTimeRef.current = time;
      }
    }

    // Process only the last microbar for the current bucket
    const micro = micros.at(-1);
    if (micro && seriesRef.current && currentBarTimeRef.current > 0) {
      const microMinute = Math.floor(micro.ts / 60000) * 60000;
      if (microMinute === currentMinuteRef.current) {
        const { o, h, l, c } = micro.ohlcv;
        if ([o, h, l, c].some((n) => n == null || Number.isNaN(n))) return;

        if (chartStyle === "line") {
          seriesRef.current.update({
            time: currentBarTimeRef.current as UTCTimestamp,
            value: c,
          });
        } else {
          seriesRef.current.update({
            time: currentBarTimeRef.current as UTCTimestamp,
            open: o,
            high: h,
            low: l,
            close: c,
          });
        }
      }
    }
  };

  // Convert candles for indicators
  const candlesForIndicators = useMemo(() => {
    return candles.map((c) => ({
      t: c.t,
      ohlcv: c.ohlcv,
    })) as Candle[];
  }, [candles]);

  // Calculate indicators
  const indicators = useMemo(() => {
    const emaLines = overlays.ema.map((period) => ({
      period,
      values: emaBatch(candlesForIndicators, period),
    }));

    const bollinger = overlays.boll
      ? bollingerBatch(candlesForIndicators, overlays.boll.period, overlays.boll.stdDev)
      : null;

    let vwap: number[] | null = null;
    if (overlays.vwap) {
      if (overlays.vwap.mode === "session" && candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        if (lastCandle) {
          const sessionStart = sessionStartMs(active.symbol, lastCandle.t);
          vwap = vwapSessionBatch(candlesForIndicators, sessionStart);
        }
      } else if (overlays.vwap.mode === "anchored" && overlays.vwap.anchorMs) {
        vwap = vwapAnchoredBatch(candlesForIndicators, overlays.vwap.anchorMs);
      }
    }

    const volumeSma = volumeSmaBatch(candlesForIndicators, overlays.volumeSma);

    return { emaLines, bollinger, vwap, volumeSma };
  }, [candlesForIndicators, overlays, active.symbol, candles]);

  // Use chart context hook
  const { getCurrentContext } = useChartContext({
    candles: candlesForIndicators.map((c) => ({ t: c.t, ohlcv: c.ohlcv })),
    indicators,
  });

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#1a1a1a" },
        textColor: "#9ca3af",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#2a2a2a" },
        horzLines: { color: "#2a2a2a" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#6b7280",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "#6b7280",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
        secondsVisible: false,
      },
      height: containerRef.current.clientHeight,
      width: containerRef.current.clientWidth,
    });

    // Create main series based on chart style
    let series: ISeriesApi<any>;
    if (chartStyle === "candles") {
      series = chart.addCandlestickSeries({
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });
    } else if (chartStyle === "line") {
      series = chart.addLineSeries({
        color: "#3b82f6",
        lineWidth: 2,
      });
    } else {
      series = chart.addBarSeries({
        upColor: "#10b981",
        downColor: "#ef4444",
      });
    }

    // Create volume series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    // Handle crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        setShowExplainButton(false);
        return;
      }

      const data = param.seriesData.get(series);
      if (data) {
        setTooltip({
          x: param.point.x,
          y: param.point.y,
          data,
        });
        setShowExplainButton(true);
      }
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [chartStyle]);

  // Load historical data
  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      try {
        setIsLoading(true);
        const history = await fetchHistory(active.symbol, active.timeframe, 300);

        if (!mounted) return;

        const candleData: Candle[] = history.map((bar) => ({
          t: bar.msEnd,
          ohlcv: {
            o: bar.open,
            h: bar.high,
            l: bar.low,
            c: bar.close,
            v: bar.volume,
          },
        }));

        setCandles(candleData);

        // Update chart with candles
        if (seriesRef.current) {
          if (chartStyle === "line") {
            const lineData = history
              .filter((bar) => bar.time != null && bar.close != null && !isNaN(bar.close))
              .map((bar) => ({
                time: bar.time as UTCTimestamp,
                value: bar.close,
              }));
            seriesRef.current.setData(lineData);
          } else {
            const ohlcData = history
              .filter(
                (bar) =>
                  bar.time != null &&
                  bar.open != null &&
                  bar.high != null &&
                  bar.low != null &&
                  bar.close != null &&
                  !isNaN(bar.open) &&
                  !isNaN(bar.high) &&
                  !isNaN(bar.low) &&
                  !isNaN(bar.close),
              )
              .map((bar) => ({
                time: bar.time as UTCTimestamp,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
              }));
            seriesRef.current.setData(ohlcData);
          }
        }

        // Update volume
        if (volumeSeriesRef.current) {
          const volumeData = history
            .filter(
              (bar) =>
                bar.time != null && bar.volume != null && bar.close != null && !isNaN(bar.volume),
            )
            .map((bar) => ({
              time: bar.time as UTCTimestamp,
              value: bar.volume ?? 0,
              color: bar.close >= bar.open ? "#10b98166" : "#ef444466",
            }));
          volumeSeriesRef.current.setData(volumeData);
        }

        if (history.length > 0) {
          const lastBar = history[history.length - 1];
          if (lastBar) {
            currentMinuteRef.current = Math.floor(lastBar.msEnd / 60000) * 60000;
            currentBarTimeRef.current = lastBar.time;
          }
        }

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
  }, [active.symbol, active.timeframe, chartStyle]);

  // Connect to SSE for real-time updates with RAF batching
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;

    const sseConnection = connectMarketSSE([active.symbol]);

    sseConnection.onBar((bar: Bar) => {
      barQueueRef.current.push(bar);
      scheduleProcess();
    });

    sseConnection.onMicro((micro: Micro) => {
      microQueueRef.current.push(micro);
      scheduleProcess();
    });

    return () => {
      sseConnection.close();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [active.symbol, chartStyle]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current || !candles.length) return;

    // Clear old overlay series
    overlaySeriesRef.current.forEach((series) => {
      if (series && chartRef.current) {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {
          console.warn("Failed to remove series:", e);
        }
      }
    });
    overlaySeriesRef.current.clear();

    // Add EMA lines
    indicators.emaLines.forEach(({ period, values }) => {
      const emaSeries = chartRef.current!.addLineSeries({
        color: period === 20 ? "#f59e0b" : "#8b5cf6",
        lineWidth: 1,
        title: `EMA(${period})`,
      });

      const emaData = values
        .map((value: number, i: number) => ({
          time: Math.floor(candles[i]!.t / 1000) as UTCTimestamp,
          value,
        }))
        .filter((d: any) => !isNaN(d.value));

      emaSeries.setData(emaData);
      overlaySeriesRef.current.set(`ema-${period}`, emaSeries);
    });

    // Add Bollinger Bands
    if (indicators.bollinger) {
      const midSeries = chartRef.current!.addLineSeries({
        color: "#6366f1",
        lineWidth: 1,
        title: "BB Mid",
      });
      const upperSeries = chartRef.current!.addLineSeries({
        color: "#6366f166",
        lineWidth: 1,
        title: "BB Upper",
      });
      const lowerSeries = chartRef.current!.addLineSeries({
        color: "#6366f166",
        lineWidth: 1,
        title: "BB Lower",
      });

      const midData = indicators.bollinger
        .map((b: any, i: number) => ({
          time: Math.floor(candles[i]!.t / 1000) as UTCTimestamp,
          value: b.mid,
        }))
        .filter((d: any) => !isNaN(d.value));

      const upperData = indicators.bollinger
        .map((b: any, i: number) => ({
          time: Math.floor(candles[i]!.t / 1000) as UTCTimestamp,
          value: b.upper,
        }))
        .filter((d: any) => !isNaN(d.value));

      const lowerData = indicators.bollinger
        .map((b: any, i: number) => ({
          time: Math.floor(candles[i]!.t / 1000) as UTCTimestamp,
          value: b.lower,
        }))
        .filter((d: any) => !isNaN(d.value));

      midSeries.setData(midData);
      upperSeries.setData(upperData);
      lowerSeries.setData(lowerData);

      overlaySeriesRef.current.set("bb-mid", midSeries);
      overlaySeriesRef.current.set("bb-upper", upperSeries);
      overlaySeriesRef.current.set("bb-lower", lowerSeries);
    }

    // Add VWAP
    if (indicators.vwap) {
      const vwapSeries = chartRef.current!.addLineSeries({
        color: "#ec4899",
        lineWidth: 2,
        lineStyle: overlays.vwap?.mode === "anchored" ? LineStyle.Dashed : LineStyle.Solid,
        title: overlays.vwap?.mode === "anchored" ? "VWAP (Anchored)" : "VWAP (Session)",
      });

      const vwapData = indicators.vwap
        .map((value: number, i: number) => ({
          time: Math.floor(candles[i]!.t / 1000) as UTCTimestamp,
          value,
        }))
        .filter((d: any) => !isNaN(d.value));

      vwapSeries.setData(vwapData);
      overlaySeriesRef.current.set("vwap", vwapSeries);
    }

    // Add Volume SMA
    if (volumeSeriesRef.current && indicators.volumeSma) {
      const volumeSmaSeries = chartRef.current!.addLineSeries({
        color: "#3b82f6",
        lineWidth: 1,
        priceScaleId: "volume",
        title: `Vol SMA(${overlays.volumeSma})`,
      });

      const volSmaData = indicators.volumeSma
        .map((value: number, i: number) => ({
          time: Math.floor(candles[i]!.t / 1000) as UTCTimestamp,
          value,
        }))
        .filter((d: any) => !isNaN(d.value));

      volumeSmaSeries.setData(volSmaData);
      overlaySeriesRef.current.set("vol-sma", volumeSmaSeries);
    }
  }, [indicators, candles, overlays]);

  // Right-click handler for anchored VWAP
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();

      if (!chartRef.current) return;

      const timeScale = chartRef.current.timeScale();
      const coordinate = e.clientX - containerRef.current!.getBoundingClientRect().left;
      const time = timeScale.coordinateToTime(coordinate);

      if (time) {
        const msTime = (time as number) * 1000;
        setVwapAnchor(msTime);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
    }

    return () => {
      if (container) {
        container.removeEventListener("contextmenu", handleContextMenu);
      }
    };
  }, [setVwapAnchor]);

  const handleExplainChart = () => {
    const context = getCurrentContext(100);
    window.dispatchEvent(
      new CustomEvent("chart:explain-request", {
        detail: { context },
      }),
    );
  };

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/50">
          <div className="text-sm text-gray-400">Loading {active.symbol}...</div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />

      {tooltip && chartStyle === "candles" && (
        <div
          className="absolute z-20 px-2 py-1 text-xs font-mono text-white bg-gray-900 border border-gray-700 rounded shadow-lg pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
          }}
        >
          <div className="flex gap-3">
            <span>O {tooltip.data.open?.toFixed(2)}</span>
            <span>H {tooltip.data.high?.toFixed(2)}</span>
            <span>L {tooltip.data.low?.toFixed(2)}</span>
            <span>C {tooltip.data.close?.toFixed(2)}</span>
          </div>
        </div>
      )}

      {showExplainButton && (
        <button
          onClick={handleExplainChart}
          className="absolute bottom-4 right-4 z-20 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-lg transition-colors"
        >
          💬 Ask AI Coach
        </button>
      )}
    </div>
  );
}
