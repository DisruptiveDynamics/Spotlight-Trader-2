import type { InsightContext, InsightBar, InsightOverlays } from "@spotlight/shared";
import { useMemo } from "react";

import { useChartState } from "../../../state/chartState";

interface UseChartContextProps {
  candles: Array<{
    t: number;
    ohlcv: { o: number; h: number; l: number; c: number; v: number };
  }>;
  indicators?: {
    emaLines?: Array<{ period: number; values: number[] }>;
    bollinger?: Array<{ mid: number; upper: number; lower: number }> | null;
    vwap?: number[] | null;
  };
}

export function useChartContext({ candles, indicators }: UseChartContextProps) {
  const { active } = useChartState();

  const getCurrentContext = useMemo(() => {
    return (barCount: number = 100): InsightContext => {
      // Get last N bars
      const recentCandles = candles.slice(-barCount);

      const bars: InsightBar[] = recentCandles.map((c) => ({
        time: Math.floor(c.t / 1000), // Convert to seconds
        o: c.ohlcv.o,
        h: c.ohlcv.h,
        l: c.ohlcv.l,
        c: c.ohlcv.c,
        v: c.ohlcv.v,
      }));

      // Build overlays from indicators
      const contextOverlays: InsightOverlays = {};

      if (indicators?.emaLines && indicators.emaLines.length > 0) {
        contextOverlays.ema = {};
        indicators.emaLines.forEach(({ period, values }) => {
          const lastValue = values[values.length - 1];
          if (lastValue !== undefined && !isNaN(lastValue)) {
            contextOverlays.ema![period] = lastValue;
          }
        });
      }

      if (indicators?.vwap && indicators.vwap.length > 0) {
        const lastVwap = indicators.vwap[indicators.vwap.length - 1];
        if (lastVwap !== undefined && !isNaN(lastVwap)) {
          contextOverlays.vwap = lastVwap;
        }
      }

      if (indicators?.bollinger && indicators.bollinger.length > 0) {
        const lastBoll = indicators.bollinger[indicators.bollinger.length - 1];
        if (lastBoll && !isNaN(lastBoll.mid)) {
          contextOverlays.boll = {
            mid: lastBoll.mid,
            upper: lastBoll.upper,
            lower: lastBoll.lower,
          };
        }
      }

      return {
        symbol: active.symbol,
        timeframe: active.timeframe,
        bars,
        overlays: contextOverlays,
        activeSignals: [], // TODO: Wire up from signals service
      };
    };
  }, [candles, indicators, active]);

  return { getCurrentContext };
}
