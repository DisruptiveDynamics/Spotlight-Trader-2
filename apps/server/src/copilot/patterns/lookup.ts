import { db } from "@server/db";
import { patternStats } from "@server/db/schema";
import { eq, and } from "drizzle-orm";

interface PatternStats {
  symbol: string;
  timeframe: string;
  setup: string;
  regime: string;
  winRate: number;
  evR: number;
  maeP50: number;
  maeP80: number;
  mfeP50: number;
  mfeP80: number;
  timeToTarget: number;
  falseBreakRate: number;
  volumeZScores: Record<string, number>;
  rangeZScores: Record<string, number>;
  vwapBehaviors: string[];
  atrPercentile: number;
  lastUpdated: Date;
}

class PatternMemoryCache {
  private cache = new Map<string, { data: PatternStats[]; expiry: number }>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  private getCacheKey(symbol: string, timeframe: string, setup?: string): string {
    return setup ? `${symbol}:${timeframe}:${setup}` : `${symbol}:${timeframe}`;
  }

  async getPatternStats(
    symbol: string,
    timeframe: string,
    setup?: string,
  ): Promise<PatternStats[]> {
    const cacheKey = this.getCacheKey(symbol, timeframe, setup);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    const conditions = [eq(patternStats.symbol, symbol), eq(patternStats.timeframe, timeframe)];

    if (setup) {
      conditions.push(eq(patternStats.setup, setup));
    }

    const results = await db
      .select()
      .from(patternStats)
      .where(and(...conditions));

    const data: PatternStats[] = results.map((row) => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      setup: row.setup,
      regime: row.regime,
      winRate: row.winRate,
      evR: row.evR,
      maeP50: row.maeP50,
      maeP80: row.maeP80,
      mfeP50: row.mfeP50,
      mfeP80: row.mfeP80,
      timeToTarget: row.timeToTarget,
      falseBreakRate: row.falseBreakRate,
      volumeZScores: row.volumeZScores as Record<string, number>,
      rangeZScores: row.rangeZScores as Record<string, number>,
      vwapBehaviors: row.vwapBehaviors,
      atrPercentile: row.atrPercentile,
      lastUpdated: row.lastUpdated,
    }));

    this.cache.set(cacheKey, {
      data,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });

    return data;
  }

  invalidate(symbol: string, timeframe: string): void {
    const keysToDelete: string[] = [];

    for (const [key] of this.cache) {
      if (key.startsWith(`${symbol}:${timeframe}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  clear(): void {
    this.cache.clear();
  }
}

export const patternMemory = new PatternMemoryCache();
