import type { Bar } from "@shared/types";

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
 * [DATA-INTEGRITY] Validates bar has complete OHLCV data
 * Prevents storing placeholder bars or bars with undefined fields
 */
function hasCompleteOHLCV(bar: Bar): boolean {
  return (
    typeof bar.open === "number" && Number.isFinite(bar.open) &&
    typeof bar.high === "number" && Number.isFinite(bar.high) &&
    typeof bar.low === "number" && Number.isFinite(bar.low) &&
    typeof bar.close === "number" && Number.isFinite(bar.close) &&
    typeof bar.volume === "number" && Number.isFinite(bar.volume)
  );
}

/**
 * [DATA-INTEGRITY] Creates immutable snapshot of bar to prevent mutation
 * Ensures stored bars cannot be modified after storage
 */
function createImmutableSnapshot(bar: Bar): CachedBar {
  if (!hasCompleteOHLCV(bar)) {
    throw new Error(
      `RingBuffer: Cannot store bar with incomplete OHLCV - ${bar.symbol} seq=${bar.seq} ` +
      `(open=${bar.open}, high=${bar.high}, low=${bar.low}, close=${bar.close}, volume=${bar.volume})`
    );
  }

  return Object.freeze({
    seq: bar.seq,
    bar_start: bar.bar_start,
    bar_end: bar.bar_end,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  });
}

export class RingBuffer {
  private buffers = new Map<string, CachedBar[]>();
  private maxSize = 5000;

  putBars(symbol: string, bars: Bar[]) {
    if (!this.buffers.has(symbol)) {
      this.buffers.set(symbol, []);
    }

    const buffer = this.buffers.get(symbol)!;

    // [DATA-INTEGRITY] Create immutable snapshots with validation
    const cachedBars: CachedBar[] = bars.map((bar) => {
      try {
        return createImmutableSnapshot(bar);
      } catch (err) {
        console.error(`[RingBuffer] Skipping invalid bar during putBars:`, err);
        throw err; // Re-throw to prevent silent failures
      }
    });

    buffer.push(...cachedBars);

    if (buffer.length > this.maxSize) {
      buffer.splice(0, buffer.length - this.maxSize);
    }
  }

  /**
   * Replace or upsert a bar by seq (for AM reconciliation)
   * If bar with same seq exists, replace it. Otherwise append.
   */
  replaceOrUpsertBySeq(symbol: string, bar: Bar) {
    if (!this.buffers.has(symbol)) {
      this.buffers.set(symbol, []);
    }

    const buffer = this.buffers.get(symbol)!;
    
    // [DATA-INTEGRITY] Create immutable snapshot with validation
    let cachedBar: CachedBar;
    try {
      cachedBar = createImmutableSnapshot(bar);
    } catch (err) {
      console.error(`[RingBuffer] Skipping invalid bar during replaceOrUpsertBySeq:`, err);
      throw err; // Re-throw to prevent silent failures
    }

    // Find existing bar with same seq
    const existingIndex = buffer.findIndex((b) => b.seq === bar.seq);

    if (existingIndex >= 0) {
      // Replace existing bar
      buffer[existingIndex] = cachedBar;
    } else {
      // Append new bar
      buffer.push(cachedBar);
      
      // Trim to max size if needed
      if (buffer.length > this.maxSize) {
        buffer.splice(0, buffer.length - this.maxSize);
      }
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
