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

export type SSEStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

interface MarketSSEOptions {
  sinceSeq?: number;
  maxReconnectDelay?: number;
}

export function connectMarketSSE(symbols = ['SPY'], opts?: MarketSSEOptions) {
  let es: EventSource | null = null;
  let reconnectTimeout: number | null = null;
  let reconnectAttempts = 0;
  let lastSeq = opts?.sinceSeq || 0;
  let isManualClose = false;

  const maxReconnectDelay = opts?.maxReconnectDelay || 30000;

  const listeners = {
    bar: [] as ((b: Bar) => void)[],
    microbar: [] as ((m: Micro) => void)[],
    status: [] as ((s: SSEStatus) => void)[],
    gap: [] as ((detected: { expected: number; received: number }) => void)[],
  };

  const emitStatus = (status: SSEStatus) => {
    listeners.status.forEach((fn) => fn(status));
  };

  const connect = () => {
    if (isManualClose) return;

    const params = new URLSearchParams({ symbols: symbols.join(',') });
    if (lastSeq > 0) {
      params.append('sinceSeq', String(lastSeq));
    }

    emitStatus(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    es = new EventSource(`/stream/market?${params.toString()}`);

    es.addEventListener('open', () => {
      reconnectAttempts = 0;
      emitStatus('connected');
      window.dispatchEvent(new CustomEvent('sse:connected'));
    });

    es.addEventListener('bar', (e) => {
      const b = JSON.parse((e as MessageEvent).data) as Bar;

      if (b.seq <= lastSeq) {
        console.warn(`Duplicate bar detected: seq=${b.seq}, lastSeq=${lastSeq}`);
        return;
      }

      if (b.seq > lastSeq + 1 && lastSeq > 0) {
        const gap = { expected: lastSeq + 1, received: b.seq };
        console.warn(`Gap detected: expected seq=${gap.expected}, got ${gap.received}`);
        listeners.gap.forEach((fn) => fn(gap));
      }

      lastSeq = b.seq;
      listeners.bar.forEach((fn) => fn(b));
    });

    es.addEventListener('microbar', (e) => {
      const m = JSON.parse((e as MessageEvent).data) as Micro;
      listeners.microbar.forEach((fn) => fn(m));
    });

    es.onerror = () => {
      console.warn('SSE error, scheduling reconnect');
      emitStatus('error');
      es?.close();
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (reconnectTimeout || isManualClose) return;

    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
      maxReconnectDelay
    );

    reconnectAttempts++;

    reconnectTimeout = window.setTimeout(() => {
      reconnectTimeout = null;
      connect();
    }, delay);
  };

  connect();

  return {
    onBar(fn: (b: Bar) => void) {
      listeners.bar.push(fn);
    },
    onMicro(fn: (m: Micro) => void) {
      listeners.microbar.push(fn);
    },
    onStatus(fn: (s: SSEStatus) => void) {
      listeners.status.push(fn);
    },
    onGap(fn: (detected: { expected: number; received: number }) => void) {
      listeners.gap.push(fn);
    },
    getLastSeq() {
      return lastSeq;
    },
    close() {
      isManualClose = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      es?.close();
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
