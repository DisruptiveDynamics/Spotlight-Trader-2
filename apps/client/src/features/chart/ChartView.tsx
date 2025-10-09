import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { connectMarketSSE, fetchHistory, type Bar, type Micro } from '../../lib/marketStream';
import { useLastSeq } from './useLastSeq';

export function ChartView() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isPausedRef = useRef(false);
  const [, forceUpdate] = useState({});
  const [lastSeq, setLastSeq] = useLastSeq('SPY', '1m');
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
        const history = await fetchHistory('SPY', '1m', 300);
        if (!mounted) return;

        const { createChart, CrosshairMode } = await import('lightweight-charts');

        const chart = createChart(chartContainerRef.current, {
          layout: {
            background: { color: '#1a1a1a' },
            textColor: '#d1d5db',
          },
          grid: {
            vertLines: { color: '#374151' },
            horzLines: { color: '#374151' },
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
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });

        const candleData: CandlestickData[] = history.map((bar) => ({
          time: Math.floor(bar.bar_end / 1000) as UTCTimestamp,
          open: bar.ohlcv.o,
          high: bar.ohlcv.h,
          low: bar.ohlcv.l,
          close: bar.ohlcv.c,
        }));

        series.setData(candleData);

        chartRef.current = chart;
        seriesRef.current = series;

        if (history.length > 0) {
          const lastBar = history[history.length - 1];
          if (lastBar) {
            currentMinuteRef.current = Math.floor(lastBar.bar_end / 60000) * 60000;
            currentBarTimeRef.current = Math.floor(lastBar.bar_end / 1000);
          }
        }

        const handleResize = () => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current?.clientWidth || 0,
              height: chartContainerRef.current?.clientHeight || 0,
            });
          }
        };

        window.addEventListener('resize', handleResize);

        sseConnection = connectMarketSSE(['SPY'], lastSeq ? { sinceSeq: lastSeq } : undefined);

        sseConnection.onBar((bar: Bar) => {
          if (!mounted || !seriesRef.current) return;

          if (barCountRef.current < 3) {
            console.log(`BAR seq=${bar.seq} time=${bar.bar_end} close=${bar.ohlcv.c}`);
            barCountRef.current++;
          }

          setLastSeq(bar.seq);

          const time = Math.floor(bar.bar_end / 1000) as UTCTimestamp;
          seriesRef.current.update({
            time,
            open: bar.ohlcv.o,
            high: bar.ohlcv.h,
            low: bar.ohlcv.l,
            close: bar.ohlcv.c,
          });

          currentMinuteRef.current = Math.floor(bar.bar_end / 60000) * 60000;
          currentBarTimeRef.current = time;
        });

        sseConnection.onMicro((micro: Micro) => {
          if (!mounted || isPausedRef.current) return;

          microbarQueueRef.current.push(micro);

          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(processMicrobars);
          }
        });

        setIsLoading(false);

        return () => {
          window.removeEventListener('resize', handleResize);
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
          }
        };
      } catch (error) {
        console.error('Chart initialization failed:', error);
        setIsLoading(false);
      }
    };

    const processMicrobars = () => {
      rafIdRef.current = null;

      if (!seriesRef.current || microbarQueueRef.current.length === 0) return;

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
    };

    initChart();

    const handleTogglePause = () => {
      isPausedRef.current = !isPausedRef.current;
      forceUpdate({});
    };

    window.addEventListener('hotkey:toggle-stream', handleTogglePause);

    return () => {
      mounted = false;
      window.removeEventListener('hotkey:toggle-stream', handleTogglePause);
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
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500'
              : 'bg-green-500/20 text-green-400 border border-green-500'
          }`}
        >
          {isPausedRef.current ? 'PAUSED' : 'LIVE'}
        </div>
      </div>
    </div>
  );
}
