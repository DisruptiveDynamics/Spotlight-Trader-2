import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import {
  createChart,
  IChartApi,
  CandlestickData,
  Time,
  UTCTimestamp,
  ISeriesApi,
} from "lightweight-charts";

type UseLwChartOpts = {
  seriesOptions?: any;
  chartOptions?: any;
  seedKey: string;
  seed?: CandlestickData[];
};

export function useLightweightChart(
  containerRef: MutableRefObject<HTMLDivElement | null>,
  opts: UseLwChartOpts
) {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastTimeRef = useRef<UTCTimestamp | number | undefined>(undefined);
  const didInitRef = useRef(false);

  const chartOptions = useMemo(() => opts.chartOptions ?? {}, [opts.chartOptions]);
  const seriesOptions = useMemo(() => opts.seriesOptions ?? {}, [opts.seriesOptions]);

  // Initialize once
  useEffect(() => {
    if (didInitRef.current) return;
    const el = containerRef.current;
    if (!el || chartRef.current) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: "#1a1a1a" }, textColor: "#9ca3af" },
      rightPriceScale: { borderVisible: false },
      timeScale: { secondsVisible: true, borderVisible: false },
      ...chartOptions,
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
      ...seriesOptions,
    });
    seriesRef.current = series;

    // Resize observer
    const ro = new ResizeObserver(() => {
      try {
        chart.timeScale().fitContent();
      } catch (e) {
        // Ignore disposal errors during cleanup
      }
    });
    ro.observe(el);

    didInitRef.current = true;

    return () => {
      ro.disconnect();
      try {
        if (chartRef.current) chartRef.current.remove();
      } catch {}
      chartRef.current = null;
      seriesRef.current = null;
      didInitRef.current = false;
    };
  }, [containerRef, chartOptions, seriesOptions]);

  // Seed when data changes
  useEffect(() => {
    if (!seriesRef.current) return;
    if (opts.seed && opts.seed.length) {
      const sorted = [...opts.seed].sort((a, b) => Number(a.time) - Number(b.time));
      seriesRef.current.setData(sorted);
      const lastBar = sorted[sorted.length - 1];
      lastTimeRef.current = lastBar ? (Number(lastBar.time) as UTCTimestamp) : undefined;
    } else {
      seriesRef.current.setData([]);
      lastTimeRef.current = undefined;
    }
  }, [opts.seed, opts.seedKey]);

  function setData(data: CandlestickData[]) {
    if (!seriesRef.current) return;
    const sorted = [...data].sort((a, b) => Number(a.time) - Number(b.time));
    seriesRef.current.setData(sorted);
    const lastBar = sorted[sorted.length - 1];
    lastTimeRef.current = lastBar ? (Number(lastBar.time) as UTCTimestamp) : undefined;
  }

  function update(bar: CandlestickData) {
    if (!seriesRef.current) return;
    const t = Number(bar.time) as UTCTimestamp;
    if (lastTimeRef.current === undefined || t >= (lastTimeRef.current as number)) {
      seriesRef.current.update(bar);
      lastTimeRef.current = t;
    }
  }

  return {
    chart: chartRef,
    series: seriesRef,
    setData,
    update,
  };
}
