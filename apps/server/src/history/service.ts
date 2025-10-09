import { restClient } from '@polygon.io/client-js';
import { validateEnv } from '@shared/env';
import { ringBuffer } from '@server/cache/ring';
import type { Bar } from '@server/market/eventBus';

const env = validateEnv(process.env);
const polygonRest = restClient(env.POLYGON_API_KEY);

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
    const response = await polygonRest.stocks.aggregates(
      symbol,
      1,
      'minute',
      new Date(fromMs).toISOString().split('T')[0]!,
      new Date(toMs).toISOString().split('T')[0]!,
      { limit }
    );

    if (!response.results || response.results.length === 0) {
      return [];
    }

    const bars: Bar[] = response.results.map((agg: any) => {
      const bar_start = agg.t;
      const bar_end = bar_start + 60000;

      return {
        symbol,
        timeframe: '1m',
        seq: Math.floor(bar_start / 60000),
        bar_start,
        bar_end,
        open: agg.o,
        high: agg.h,
        low: agg.l,
        close: agg.c,
        volume: agg.v,
      };
    });

    ringBuffer.putBars(symbol, bars);

    return bars;
  } catch (err) {
    console.error('Failed to fetch history from Polygon:', err);
    return [];
  }
}
