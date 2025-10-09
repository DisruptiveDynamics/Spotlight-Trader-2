import { useRef, useCallback } from 'react';

export function useLastSeq(symbol: string, timeframe: string) {
  const key = `lastSeq:${symbol}:${timeframe}`;
  const seqRef = useRef<number | undefined>(undefined);

  if (seqRef.current === undefined) {
    const saved = localStorage.getItem(key);
    seqRef.current = saved ? parseInt(saved, 10) : undefined;
  }

  const setLastSeq = useCallback(
    (seq: number) => {
      localStorage.setItem(key, String(seq));
      seqRef.current = seq;
    },
    [key]
  );

  return [seqRef.current, setLastSeq] as const;
}
