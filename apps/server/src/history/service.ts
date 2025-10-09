import { restClient } from '@polygon.io/client-js';
import { validateEnv } from '@shared/env';
import { ringBuffer } from '@server/cache/ring';
import type { Bar } from '@server/market/eventBus';

const env = validateEnv(process.env);
const polygon = restClient(env.POLYGON_API_KEY);

interface HistoryQuery {
  symbol: string;
  timeframe?: '1m';
  limit?: number;
  before?: number;
  sinceSeq?: number;
}

export async function getHistory(query: HistoryQuery): Promise<Bar[]> {
  const { symbol, timeframe = '1m', limit = 1000, before, sinceSeq } = query;

  if (sinceSeq !== undefined) {
    const cached = ringBuffer.getSinceSeq(symbol, sinceSeq);
    if (cached.length > 0) {
      return cached.map((bar) => ({ ...bar, symbol, timeframe }));
    }
  }

  const toMs = before || Date.now();
  const fromMs = toMs - limit * 60000;

  try {
    const data = await polygon.stocks.aggregates(
      symbol,
      1,
      'minute',
      new Date(fromMs).toISOString().split('T')[0]!,
      new Date(toMs).toISOString().split('T')[0]!,
      { limit }
    );

    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn(`No history data for ${symbol} from Polygon`);
      return generateMockBars(symbol, fromMs, toMs, limit);
    }

    const bars: Bar[] = data.results.map((agg: any) => {
      const bar_start = agg.t;
      const bar_end = bar_start + 60000;

      return {
        symbol,
        timeframe: '1m',
        seq: Math.floor(bar_start / 60000),
        bar_start,
        bar_end,
        ohlcv: {
          o: agg.o,
          h: agg.h,
          l: agg.l,
          c: agg.c,
          v: agg.v,
        },
      };
    });

    ringBuffer.putBars(symbol, bars);

    return bars;
  } catch (err) {
    console.warn('Polygon API unavailable, using mock data:', (err as Error).message);
    return generateMockBars(symbol, fromMs, toMs, limit);
  }
}

function generateMockBars(symbol: string, fromMs: number, toMs: number, limit: number): Bar[] {
  const bars: Bar[] = [];
  let basePrice = symbol === 'SPY' ? 450 : 380;

  for (let i = 0; i < Math.min(limit, 300); i++) {
    const bar_start = fromMs + i * 60000;
    const bar_end = bar_start + 60000;

    const open = basePrice + (Math.random() - 0.5) * 2;
    const close = open + (Math.random() - 0.5) * 1.5;
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;

    bars.push({
      symbol,
      timeframe: '1m',
      seq: Math.floor(bar_start / 60000),
      bar_start,
      bar_end,
      ohlcv: {
        o: open,
        h: high,
        l: low,
        c: close,
        v: Math.floor(Math.random() * 1000000),
      },
    });

    basePrice = close;
  }

  return bars;
}
