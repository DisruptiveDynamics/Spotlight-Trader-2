import { ringBuffer } from '@server/cache/ring';

interface CachedBar {
  seq: number;
  bar_start: number;
  bar_end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Service wrapper around ringBuffer for 1-minute bars.
 * Provides convenient methods for voice assistant and copilot tools.
 */
class Bars1mService {
  /**
   * Get the most recent 1-minute bar for a symbol
   */
  getLastBar(symbol: string): CachedBar | null {
    const bars = ringBuffer.getRecent(symbol, 1);
    return bars.length > 0 && bars[0] ? bars[0] : null;
  }

  /**
   * Get N most recent 1-minute bars for a symbol
   */
  getRecentBars(symbol: string, count: number): CachedBar[] {
    return ringBuffer.getRecent(symbol, count);
  }

  /**
   * Get bars since a specific sequence number
   */
  getBarsSinceSeq(symbol: string, sinceSeq: number): CachedBar[] {
    return ringBuffer.getSinceSeq(symbol, sinceSeq);
  }

  /**
   * Get the last price from the most recent bar
   */
  getLastPrice(symbol: string): number | null {
    const bar = this.getLastBar(symbol);
    if (!bar) {
      return null;
    }
    return bar.close;
  }

  /**
   * Get the last volume from the most recent bar
   */
  getLastVolume(symbol: string): number | null {
    const bar = this.getLastBar(symbol);
    if (!bar) {
      return null;
    }
    return bar.volume;
  }

  /**
   * Check if we have any data for a symbol
   */
  hasData(symbol: string): boolean {
    const bars = ringBuffer.getRecent(symbol, 1);
    return bars.length > 0;
  }

  /**
   * Get all bars within a time range
   */
  getBarsInRange(symbol: string, startMs: number, endMs: number): CachedBar[] {
    const allBars = ringBuffer.getRecent(symbol, 1000); // Fetch a large window
    return allBars.filter(bar => bar.bar_start >= startMs && bar.bar_start <= endMs);
  }
}

export const bars1m = new Bars1mService();
