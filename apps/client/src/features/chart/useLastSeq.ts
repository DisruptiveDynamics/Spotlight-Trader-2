import { useState, useEffect } from 'react';

export function useLastSeq(symbol: string, timeframe: string) {
  const key = `lastSeq:${symbol}:${timeframe}`;
  const [lastSeq, setLastSeqState] = useState<number | undefined>(() => {
    const saved = localStorage.getItem(key);
    return saved ? parseInt(saved, 10) : undefined;
  });

  const setLastSeq = (seq: number) => {
    localStorage.setItem(key, String(seq));
    setLastSeqState(seq);
  };

  return [lastSeq, setLastSeq] as const;
}
