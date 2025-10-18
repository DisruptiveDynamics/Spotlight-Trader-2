import { ringBuffer } from "@server/cache/ring";
import { bars1m } from "@server/chart/bars1m";
import type { Timeframe } from "@server/market/eventBus";
import { polygonWs } from "@server/market/polygonWs";
import { validateEnv } from "@shared/env";
import type { Bar } from "@shared/types";

const env = validateEnv(process.env);

// Helper to convert cached bar to flat Bar structure
function toFlatBar(cached: { seq: number; bar_start: number; bar_end: number; open: number; high: number; low: number; close: number; volume: number }, symbol: string): Bar {
  return {
    symbol,
    timestamp: cached.bar_start,
    open: cached.open,
    high: cached.high,
    low: cached.low,
    close: cached.close,
    volume: cached.volume,
    seq: cached.seq,
    bar_start: cached.bar_start,
    bar_end: cached.bar_end,
  };
}

interface HistoryQuery {
  symbol: string;
  timeframe?: Timeframe;
  limit?: number;
  before?: number;
  sinceSeq?: number;
}

interface PolygonAggResponse {
  results?: Array<{
    t: number; // timestamp
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
  }>;
  status: string;
  count?: number;
}

/**
 * Get initial history for app startup using env-configured limit
 */
export async function getInitialHistory(symbol: string): Promise<Bar[]> {
  return getHistory({
    symbol,
    timeframe: env.HISTORY_INIT_TIMEFRAME,
    limit: env.HISTORY_INIT_LIMIT,
  });
}

/**
 * Fetch historical bar data with intelligent fallback strategy:
 * 1. Ring buffer (for recent real-time data)
 * 2. Polygon REST API (for historical data)
 * 3. High-quality mock generator (fallback)
 */
export async function getHistory(query: HistoryQuery): Promise<Bar[]> {
  const { symbol, timeframe = "1m", limit = env.HISTORY_INIT_LIMIT, before, sinceSeq } = query;

  // Priority 1: Check ring buffer for gap backfill
  // [CRITICAL] Honor sinceSeq contract - return empty if no newer bars exist
  // Do NOT fall back to getRecent() as that sends stale bars causing duplicate seq loops
  if (sinceSeq !== undefined) {
    const cached = ringBuffer.getSinceSeq(symbol, sinceSeq);
    // Always return here when sinceSeq is specified - either newer bars or empty array
    return cached.map((bar) => toFlatBar(bar, symbol));
  }

  // Priority 2: Check ring buffer for recent data
  const recentFromBuffer = ringBuffer.getRecent(symbol, limit);
  if (recentFromBuffer.length >= Math.min(limit, 10)) {
    console.log(`📊 Using ${recentFromBuffer.length} bars from ring buffer for ${symbol}`);
    return recentFromBuffer.map((bar) => toFlatBar(bar, symbol));
  }

  // Priority 3: Fetch from Polygon REST API (skip if using mock data)
  const isUsingMockData = polygonWs.isUsingMockData();

  if (!isUsingMockData) {
    const polygonBars = await fetchPolygonHistory(symbol, timeframe, limit, before);
    if (polygonBars.length > 0) {
      ringBuffer.putBars(symbol, polygonBars);
      
      // CRITICAL: Only append to bars1m if fetching LATEST data (no pagination)
      // Pagination (before parameter) fetches old bars which would pollute the authoritative buffer
      if (timeframe === "1m" && !before) {
        for (const bar of polygonBars) {
          bars1m.append(symbol, {
            symbol: bar.symbol,
            seq: bar.seq,
            bar_start: bar.bar_start,
            bar_end: bar.bar_end,
            o: bar.open,
            h: bar.high,
            l: bar.low,
            c: bar.close,
            v: bar.volume,
          });
        }
      }
      
      return polygonBars;
    }
  } else {
    console.log(
      `🎭 Skipping Polygon API (mock mode active) - generating realistic bars for ${symbol}`,
    );
  }

  // Priority 4: Use ring buffer even if sparse
  if (recentFromBuffer.length > 0) {
    console.log(`📊 Using ${recentFromBuffer.length} sparse bars from ring buffer (fallback)`);
    return recentFromBuffer.map((bar) => toFlatBar(bar, symbol));
  }

  // Priority 5: Generate high-quality mock data
  const toMs = before || Date.now();
  const fromMs = toMs - limit * 60000;
  console.log(`🎭 Generating ${limit} mock bars for ${symbol} (Polygon unavailable)`);
  const mockBars = generateRealisticBars(symbol, fromMs, toMs, limit);
  ringBuffer.putBars(symbol, mockBars);
  
  // CRITICAL: Only append to bars1m if fetching LATEST data (no pagination)
  if (timeframe === "1m" && !before) {
    for (const bar of mockBars) {
      bars1m.append(symbol, {
        symbol: bar.symbol,
        seq: bar.seq,
        bar_start: bar.bar_start,
        bar_end: bar.bar_end,
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume,
      });
    }
  }
  
  return mockBars;
}

/**
 * Convert timeframe to Polygon API multiplier
 */
function timeframeToMultiplier(timeframe: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 1,
    "2m": 2,
    "5m": 5,
    "10m": 10,
    "15m": 15,
    "30m": 30,
    "1h": 60,
  };
  return map[timeframe] || 1;
}

/**
 * Convert timeframe to milliseconds
 */
function timeframeToMs(timeframe: Timeframe): number {
  return timeframeToMultiplier(timeframe) * 60000;
}

/**
 * Fetch historical bars from Polygon REST API using direct fetch
 * Uses limit-based fetch (not time-based) for efficient cold starts
 */
async function fetchPolygonHistory(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  before?: number,
): Promise<Bar[]> {
  const toMs = before || Date.now();

  // Calculate time range based on requested limit (not hardcoded days)
  // This ensures we fetch only what's needed, not 60 days every time
  const timeframeMs = timeframeToMs(timeframe);
  const fromMs = toMs - limit * timeframeMs;

  // [CRITICAL] Use precise ISO timestamps for better data accuracy
  // Full ISO format gives Polygon exact boundaries instead of date-only
  const fromISO = new Date(fromMs).toISOString();
  const toISO = new Date(toMs).toISOString();

  const multiplier = timeframeToMultiplier(timeframe);
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/minute/${fromISO}/${toISO}`;
  const params = new URLSearchParams({
    adjusted: "true",
    sort: "asc",
    limit: String(limit),
    apiKey: env.POLYGON_API_KEY,
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const status = response.status;
    const raw = await response.text().catch(() => "");

    if (!response.ok) {
      console.warn(`[history] Polygon error status=${status} body=${raw}`);
      return [];
    }

    let data: PolygonAggResponse | null = null;
    try {
      data = JSON.parse(raw) as PolygonAggResponse;
    } catch (e) {
      console.warn(`[history] Polygon parse error for ${symbol} (${status}):`, e);
      return [];
    }

    if (!data?.results?.length) {
      console.warn(
        `[history] Empty Polygon results for ${symbol} ${fromISO}→${toISO} ` +
        `status=${status} body=${raw}`
      );
      return [];
    }

    const bars: Bar[] = data.results.map((agg) => {
      const bar_start = agg.t;
      const bar_end = bar_start + timeframeMs;

      return {
        symbol,
        timestamp: bar_start,
        open: agg.o,
        high: agg.h,
        low: agg.l,
        close: agg.c,
        volume: agg.v,
        // [CRITICAL] Use 60000ms base for seq (matches barBuilder exactly)
        // Always use 1-minute base regardless of timeframe to ensure alignment
        seq: Math.floor(bar_start / 60000),
        bar_start,
        bar_end,
      };
    });

    console.log(`✅ Fetched ${bars.length} historical bars from Polygon for ${symbol}`);
    return bars;
  } catch (err) {
    console.warn(`[history] Polygon request failed:`, err);
    return [];
  }
}

/**
 * Generate realistic mock bars with proper price action and volume
 * Uses current market prices and realistic volatility patterns
 */
function generateRealisticBars(symbol: string, fromMs: number, toMs: number, limit: number): Bar[] {
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
    SPY: 0.015, // 1.5% typical range
    QQQ: 0.02, // 2% typical range
    TSLA: 0.04, // 4% high volatility
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
      timestamp: bar_start,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      // [CRITICAL] Use bar_start for seq (matches barBuilder and fetchPolygonHistory)
      seq: Math.floor(bar_start / 60000),
      bar_start,
      bar_end,
    });

    currentPrice = close;
  }

  return bars;
}
