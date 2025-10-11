import { validateEnv } from '@shared/env';
import { ringBuffer } from '@server/cache/ring';
import type { Bar } from '@server/market/eventBus';

const env = validateEnv(process.env);

interface HistoryQuery {
  symbol: string;
  timeframe?: '1m';
  limit?: number;
  before?: number;
  sinceSeq?: number;
}

interface PolygonAggResponse {
  results?: Array<{
    t: number;  // timestamp
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume
  }>;
  status: string;
  count?: number;
}

/**
 * Fetch historical bar data with intelligent fallback strategy:
 * 1. Ring buffer (for recent real-time data)
 * 2. Polygon REST API (for historical data)
 * 3. High-quality mock generator (fallback)
 */
export async function getHistory(query: HistoryQuery): Promise<Bar[]> {
  const { symbol, timeframe = '1m', limit = 1000, before, sinceSeq } = query;

  // Priority 1: Check ring buffer for gap backfill
  if (sinceSeq !== undefined) {
    const cached = ringBuffer.getSinceSeq(symbol, sinceSeq);
    if (cached.length > 0) {
      return cached.map((bar) => ({
        symbol,
        timeframe,
        seq: bar.seq,
        bar_start: bar.bar_start,
        bar_end: bar.bar_end,
        ohlcv: {
          o: bar.open,
          h: bar.high,
          l: bar.low,
          c: bar.close,
          v: bar.volume,
        },
      }));
    }
  }

  // Priority 2: Check ring buffer for recent data
  const recentFromBuffer = ringBuffer.getRecent(symbol, limit);
  if (recentFromBuffer.length >= Math.min(limit, 10)) {
    console.log(`📊 Using ${recentFromBuffer.length} bars from ring buffer for ${symbol}`);
    return recentFromBuffer.map((bar) => ({
      symbol,
      timeframe,
      seq: bar.seq,
      bar_start: bar.bar_start,
      bar_end: bar.bar_end,
      ohlcv: {
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume,
      },
    }));
  }

  // Priority 3: Fetch from Polygon REST API
  const polygonBars = await fetchPolygonHistory(symbol, limit, before);
  if (polygonBars.length > 0) {
    ringBuffer.putBars(symbol, polygonBars);
    return polygonBars;
  }

  // Priority 4: Use ring buffer even if sparse
  if (recentFromBuffer.length > 0) {
    console.log(`📊 Using ${recentFromBuffer.length} sparse bars from ring buffer (fallback)`);
    return recentFromBuffer.map((bar) => ({
      symbol,
      timeframe,
      seq: bar.seq,
      bar_start: bar.bar_start,
      bar_end: bar.bar_end,
      ohlcv: {
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume,
      },
    }));
  }

  // Priority 5: Generate high-quality mock data
  const toMs = before || Date.now();
  const fromMs = toMs - limit * 60000;
  console.log(`🎭 Generating ${limit} mock bars for ${symbol} (Polygon unavailable)`);
  const mockBars = generateRealisticBars(symbol, fromMs, toMs, limit);
  ringBuffer.putBars(symbol, mockBars);
  return mockBars;
}

/**
 * Fetch historical bars from Polygon REST API using direct fetch
 */
async function fetchPolygonHistory(
  symbol: string,
  limit: number,
  before?: number
): Promise<Bar[]> {
  const toMs = before || Date.now();
  const fromMs = toMs - limit * 60000;

  // Format dates for Polygon API (YYYY-MM-DD)
  const fromDate = new Date(fromMs).toISOString().split('T')[0];
  const toDate = new Date(toMs).toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${fromDate}/${toDate}`;
  const params = new URLSearchParams({
    adjusted: 'true',
    sort: 'asc',
    limit: String(limit),
    apiKey: env.POLYGON_API_KEY,
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.warn(`Polygon API error (${response.status}): ${errorText}`);
      return [];
    }

    const data = await response.json() as PolygonAggResponse;

    if (!data.results || data.results.length === 0) {
      console.warn(`No historical data from Polygon for ${symbol}`);
      return [];
    }

    const bars: Bar[] = data.results.map((agg) => {
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

    console.log(`✅ Fetched ${bars.length} historical bars from Polygon for ${symbol}`);
    return bars;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.warn(`Polygon API request failed: ${errorMsg}`);
    return [];
  }
}

/**
 * Generate realistic mock bars with proper price action and volume
 * Uses current market prices and realistic volatility patterns
 */
function generateRealisticBars(
  symbol: string,
  fromMs: number,
  toMs: number,
  limit: number
): Bar[] {
  const bars: Bar[] = [];
  
  // Current realistic base prices (updated Oct 2025)
  const basePrices: Record<string, number> = {
    SPY: 580,
    QQQ: 485,
    TSLA: 250,
    AAPL: 195,
  };

  // Volatility profiles (% movement per bar)
  const volatilities: Record<string, number> = {
    SPY: 0.015,  // 1.5% typical range
    QQQ: 0.02,   // 2% typical range
    TSLA: 0.04,  // 4% high volatility
    AAPL: 0.025, // 2.5% moderate volatility
  };

  let currentPrice = basePrices[symbol] || 100;
  const volatility = volatilities[symbol] || 0.02;
  let trend = 0; // Trending direction (-1 to 1)

  const barCount = Math.min(limit, 300);
  const timeStep = Math.floor((toMs - fromMs) / barCount);

  for (let i = 0; i < barCount; i++) {
    const bar_start = fromMs + i * timeStep;
    const bar_end = bar_start + 60000;

    // Mean reversion with trending behavior
    const trendInfluence = trend * 0.3;
    const randomWalk = (Math.random() - 0.5) * 2;
    const priceChange = (trendInfluence + randomWalk) * volatility * currentPrice;

    // Update trend occasionally (15% chance per bar)
    if (Math.random() < 0.15) {
      trend = (Math.random() - 0.5) * 2;
    }

    // Calculate OHLC with realistic intra-bar movement
    const open = currentPrice;
    const close = open + priceChange;
    const rangeFactor = 0.3 + Math.random() * 0.7; // 30-100% of daily range
    const spread = Math.abs(priceChange) * rangeFactor;
    
    const high = Math.max(open, close) + spread * Math.random();
    const low = Math.min(open, close) - spread * Math.random();

    // Realistic volume (higher on volatility)
    const baseVolume = 100000;
    const volatilityMultiplier = 1 + Math.abs(priceChange / currentPrice) * 20;
    const volume = Math.floor(baseVolume * volatilityMultiplier * (0.5 + Math.random()));

    bars.push({
      symbol,
      timeframe: '1m',
      seq: Math.floor(bar_start / 60000),
      bar_start,
      bar_end,
      ohlcv: {
        o: Math.round(open * 100) / 100,
        h: Math.round(high * 100) / 100,
        l: Math.round(low * 100) / 100,
        c: Math.round(close * 100) / 100,
        v: volume,
      },
    });

    currentPrice = close;
  }

  return bars;
}
