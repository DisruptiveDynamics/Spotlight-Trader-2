import { useEffect, useRef, useCallback } from "react";
import type { IChartApi, LogicalRange } from "lightweight-charts";

type UseBackscrollOpts = {
  chart: IChartApi | null;
  symbol: string;
  timeframe: string;
  pageSize?: number;
  onPrependBars: (olderBars: any[]) => void;
};

/**
 * Subscribes to logical range changes and fetches older bars when the user drags left.
 * Debounced and guarded to avoid duplicate fetches. Properly unsubscribes on cleanup.
 */
export function useInfiniteBackscroll({ 
  chart, 
  symbol, 
  timeframe, 
  pageSize = 300, 
  onPrependBars 
}: UseBackscrollOpts) {
  const earliestTsRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const setEarliest = useCallback((unixSeconds: number | null) => {
    earliestTsRef.current = unixSeconds;
  }, []);

  useEffect(() => {
    if (!chart) return;

    const handler = (range: LogicalRange | null) => {
      if (!range) return;

      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(async () => {
        if (fetchingRef.current) return;
        const before = earliestTsRef.current;
        if (before == null) return;

        const { from } = range;
        if (from > 20) return;

        fetchingRef.current = true;
        try {
          console.debug("[backscroll] requesting older bars before", before);

          const params = new URLSearchParams({
            symbol,
            timeframe,
            limit: String(pageSize),
            before: String(before),
          });
          const res = await fetch(`/api/history?${params.toString()}`);
          if (res.ok) {
            const olderBars = await res.json();
            if (Array.isArray(olderBars) && olderBars.length > 0) {
              olderBars.sort((a: any, b: any) => a.bar_end - b.bar_end);
              onPrependBars(olderBars);
              earliestTsRef.current = olderBars[0]!.bar_end;
              console.info(`[backscroll] fetched ${olderBars.length} older bars`);
            } else {
              console.info("[backscroll] no older bars returned");
            }
          } else {
            console.warn("[backscroll] history fetch failed:", res.status, res.statusText);
          }
        } catch (err) {
          console.error("[backscroll] error fetching older bars", err);
        } finally {
          fetchingRef.current = false;
        }
      }, 300) as unknown as number;
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [chart, symbol, timeframe, pageSize, onPrependBars]);

  return { setEarliest };
}
