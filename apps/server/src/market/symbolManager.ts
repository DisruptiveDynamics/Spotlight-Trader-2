import { polygonWs } from './polygonWs';
import { barBuilder } from './barBuilder';
import { getHistory } from '@server/history/service';
import type { Timeframe } from './eventBus';

class SymbolManager {
  private subscribedSymbols = new Set<string>();
  private symbolTimeframes = new Map<string, Timeframe>();

  async subscribeSymbol(symbol: string, timeframe: Timeframe = '1m'): Promise<void> {
    const symbolUpper = symbol.toUpperCase();
    
    // Check if already subscribed
    if (this.subscribedSymbols.has(symbolUpper)) {
      console.log(`📊 Symbol ${symbolUpper} already subscribed, switching timeframe to ${timeframe}`);
      this.switchTimeframe(symbolUpper, timeframe);
      return;
    }

    console.log(`📊 Subscribing to new symbol: ${symbolUpper} (${timeframe})`);

    try {
      // Subscribe to Polygon WebSocket for real-time ticks
      polygonWs.subscribe(symbolUpper);

      // Subscribe barBuilder for bar aggregation
      barBuilder.subscribe(symbolUpper, timeframe);

      // Seed historical data to populate ringBuffer
      await this.seedHistoricalData(symbolUpper, timeframe);

      // Track subscription
      this.subscribedSymbols.add(symbolUpper);
      this.symbolTimeframes.set(symbolUpper, timeframe);

      console.log(`✅ Symbol ${symbolUpper} subscribed successfully`);
    } catch (err) {
      console.error(`❌ Failed to subscribe to ${symbolUpper}:`, err);
      throw err;
    }
  }

  switchTimeframe(symbol: string, newTimeframe: Timeframe): void {
    const symbolUpper = symbol.toUpperCase();
    const oldTimeframe = this.symbolTimeframes.get(symbolUpper);

    if (oldTimeframe === newTimeframe) {
      return;
    }

    // Unsubscribe from old timeframe
    if (oldTimeframe) {
      barBuilder.unsubscribe(symbolUpper, oldTimeframe);
    }

    // Subscribe to new timeframe
    barBuilder.subscribe(symbolUpper, newTimeframe);
    this.symbolTimeframes.set(symbolUpper, newTimeframe);

    console.log(`📊 Switched ${symbolUpper} from ${oldTimeframe} to ${newTimeframe}`);
  }

  unsubscribeSymbol(symbol: string): void {
    const symbolUpper = symbol.toUpperCase();

    if (!this.subscribedSymbols.has(symbolUpper)) {
      return;
    }

    const timeframe = this.symbolTimeframes.get(symbolUpper);
    if (timeframe) {
      barBuilder.unsubscribe(symbolUpper, timeframe);
    }

    polygonWs.unsubscribe(symbolUpper);

    this.subscribedSymbols.delete(symbolUpper);
    this.symbolTimeframes.delete(symbolUpper);

    console.log(`📊 Unsubscribed from ${symbolUpper}`);
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  isSubscribed(symbol: string): boolean {
    return this.subscribedSymbols.has(symbol.toUpperCase());
  }

  getTimeframe(symbol: string): Timeframe | undefined {
    return this.symbolTimeframes.get(symbol.toUpperCase());
  }

  private async seedHistoricalData(symbol: string, timeframe: Timeframe, limit: number = 500): Promise<void> {
    try {
      console.log(`🌱 Seeding historical data for ${symbol} (${timeframe}, ${limit} bars)...`);
      
      const bars = await getHistory({
        symbol,
        timeframe,
        limit,
      });

      if (!bars || bars.length === 0) {
        console.warn(`⚠️ No historical data returned for ${symbol}`);
        return;
      }

      console.log(`✅ Seeded ${bars.length} historical bars for ${symbol}`);
    } catch (err) {
      console.error(`❌ Failed to seed historical data for ${symbol}:`, err);
      // Don't throw - subscription can continue without historical seed
    }
  }
}

export const symbolManager = new SymbolManager();
