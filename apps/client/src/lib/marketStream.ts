export type Ohlcv = { o: number; h: number; l: number; c: number; v: number };

export type Bar = {
  symbol: string;
  timeframe: '1m';
  seq: number;
  bar_start: number;
  bar_end: number;
  ohlcv: Ohlcv;
};

export type Micro = {
  symbol: string;
  ts: number;
  ohlcv: Ohlcv;
};

interface MarketSSEOptions {
  sinceSeq?: number;
}

export function connectMarketSSE(symbols = ['SPY'], opts?: MarketSSEOptions) {
  const params = new URLSearchParams({ symbols: symbols.join(',') });
  if (opts?.sinceSeq) {
    params.append('sinceSeq', String(opts.sinceSeq));
  }

  const es = new EventSource(`/stream/market?${params.toString()}`);

  const listeners = {
    bar: [] as ((b: Bar) => void)[],
    microbar: [] as ((m: Micro) => void)[],
  };

  es.addEventListener('bar', (e) => {
    const b = JSON.parse((e as MessageEvent).data) as Bar;
    listeners.bar.forEach((fn) => fn(b));
  });

  es.addEventListener('microbar', (e) => {
    const m = JSON.parse((e as MessageEvent).data) as Micro;
    listeners.microbar.forEach((fn) => fn(m));
  });

  es.onerror = () => console.warn('SSE error');

  return {
    onBar(fn: (b: Bar) => void) {
      listeners.bar.push(fn);
    },
    onMicro(fn: (m: Micro) => void) {
      listeners.microbar.push(fn);
    },
    close() {
      es.close();
    },
  };
}

export async function fetchHistory(symbol = 'SPY', timeframe = '1m', limit = 300) {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    limit: String(limit),
  });

  const res = await fetch(`/api/history?${params.toString()}`);
  if (!res.ok) throw new Error('history fetch failed');

  return (await res.json()) as Bar[];
}
