import { useCallback, useEffect, useState } from "react";

export function useLastSeq(symbol: string, timeframe: string, epochId: string | null) {
  const key = epochId ? `lastSeq:${epochId}:${symbol}:${timeframe}` : null;
  const [lastSeq, setLastSeqState] = useState<number | null>(null);

  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      setLastSeqState(raw ? parseInt(raw, 10) : null);
    } catch {
      // Ignore localStorage errors
    }
  }, [key]);

  const setLastSeq = useCallback(
    (seq: number) => {
      if (!key) return;
      setLastSeqState(seq);
      try {
        localStorage.setItem(key, String(seq));
      } catch {
        // Ignore localStorage errors
      }
    },
    [key],
  );

  const resetAllForSymbolTf = useCallback(() => {
    try {
      const prefix = `lastSeq:`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k.endsWith(`:${symbol}:${timeframe}`)) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setLastSeqState(null);
  }, [symbol, timeframe]);

  return [lastSeq, setLastSeq, resetAllForSymbolTf] as const;
}
