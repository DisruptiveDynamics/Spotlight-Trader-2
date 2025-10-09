import type { Bar } from '@server/market/eventBus';

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

export class RingBuffer {
  private buffers = new Map<string, CachedBar[]>();
  private maxSize = 5000;

  putBars(symbol: string, bars: Bar[]) {
    if (!this.buffers.has(symbol)) {
      this.buffers.set(symbol, []);
    }

    const buffer = this.buffers.get(symbol)!;
    
    const cachedBars: CachedBar[] = bars.map((bar) => ({
      seq: bar.seq,
      bar_start: bar.bar_start,
      bar_end: bar.bar_end,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));

    buffer.push(...cachedBars);

    if (buffer.length > this.maxSize) {
      buffer.splice(0, buffer.length - this.maxSize);
    }
  }

  getSinceSeq(symbol: string, seq: number): CachedBar[] {
    const buffer = this.buffers.get(symbol);
    if (!buffer) return [];

    return buffer.filter((bar) => bar.seq > seq);
  }

  getRecent(symbol: string, n: number): CachedBar[] {
    const buffer = this.buffers.get(symbol);
    if (!buffer) return [];

    return buffer.slice(-n);
  }

  clear(symbol: string) {
    this.buffers.delete(symbol);
  }

  clearAll() {
    this.buffers.clear();
  }
}

export const ringBuffer = new RingBuffer();
