import { eventBus, type Tick } from './eventBus';

interface SymbolConfig {
  basePrice: number;
  volatility: number; // percentage
  ticksPerSecond: number;
}

const DEFAULT_CONFIGS: Record<string, SymbolConfig> = {
  SPY: { basePrice: 580, volatility: 0.02, ticksPerSecond: 8 },
  QQQ: { basePrice: 485, volatility: 0.025, ticksPerSecond: 6 },
  TSLA: { basePrice: 250, volatility: 0.04, ticksPerSecond: 10 },
  AAPL: { basePrice: 195, volatility: 0.03, ticksPerSecond: 7 },
};

export class MockTickGenerator {
  private intervals = new Map<string, NodeJS.Timeout>();
  private prices = new Map<string, number>();
  private trends = new Map<string, number>(); // trending direction
  private lastPrices = new Map<string, number>(); // for uptick/downtick detection

  start(symbol: string, config?: Partial<SymbolConfig>) {
    if (this.intervals.has(symbol)) {
      return; // Already running
    }

    const defaultConfig = DEFAULT_CONFIGS[symbol] || DEFAULT_CONFIGS.SPY;
    const finalConfig = { ...defaultConfig, ...config } as SymbolConfig;

    // Initialize price and trend
    this.prices.set(symbol, finalConfig.basePrice);
    this.trends.set(symbol, 0);

    const intervalMs = 1000 / finalConfig.ticksPerSecond;

    const interval = setInterval(() => {
      this.generateTick(symbol, finalConfig);
    }, intervalMs);

    this.intervals.set(symbol, interval);
    console.log(`🎬 Mock tick generator started for ${symbol} (${finalConfig.ticksPerSecond} ticks/sec)`);
  }

  private generateTick(symbol: string, config: SymbolConfig) {
    const currentPrice = this.prices.get(symbol) || config.basePrice;
    const currentTrend = this.trends.get(symbol) || 0;

    // Mean reversion with trending behavior
    const trendPull = currentTrend * 0.3; // Current trend influence
    const meanReversion = (config.basePrice - currentPrice) * 0.05; // Pull back to base
    const randomWalk = (Math.random() - 0.5) * 2; // Random component

    // Update trend occasionally (10% chance each tick)
    if (Math.random() < 0.1) {
      this.trends.set(symbol, (Math.random() - 0.5) * 2);
    }

    // Calculate price change
    const change = (trendPull + meanReversion + randomWalk) * config.volatility * config.basePrice / 100;
    const newPrice = Math.max(currentPrice + change, config.basePrice * 0.9); // Floor at 90% of base
    const newPriceRounded = Math.round(newPrice * 100) / 100;

    this.prices.set(symbol, newPriceRounded);

    // Generate realistic volume (varies by price movement)
    const volumeBase = 50;
    const volumeMultiplier = 1 + Math.abs(change) * 10;
    const volume = Math.floor(volumeBase * volumeMultiplier * (Math.random() + 0.5));

    // Determine tick side (buy/sell) based on price direction
    const lastPrice = this.lastPrices.get(symbol);
    let side: 'buy' | 'sell' | undefined;
    
    if (lastPrice !== undefined) {
      if (newPriceRounded > lastPrice) {
        side = 'buy'; // Uptick
      } else if (newPriceRounded < lastPrice) {
        side = 'sell'; // Downtick
      } else {
        // For same price, use volume bias (larger volume = more likely aggressor)
        side = Math.random() > 0.5 ? 'buy' : 'sell';
      }
    }
    
    this.lastPrices.set(symbol, newPriceRounded);

    const tick: Tick = {
      ts: Date.now(),
      price: newPriceRounded,
      size: volume,
      side,
    };

    eventBus.emit(`tick:${symbol}` as const, tick);
  }

  stop(symbol: string) {
    const interval = this.intervals.get(symbol);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(symbol);
      this.prices.delete(symbol);
      this.trends.delete(symbol);
      console.log(`⏹️  Mock tick generator stopped for ${symbol}`);
    }
  }

  stopAll() {
    for (const symbol of this.intervals.keys()) {
      this.stop(symbol);
    }
  }

  isRunning(symbol: string): boolean {
    return this.intervals.has(symbol);
  }
}

export const mockTickGenerator = new MockTickGenerator();
