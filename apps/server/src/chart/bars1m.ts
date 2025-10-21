// Authoritative 1m bar buffer - single source of truth for all timeframes
// All higher timeframes (2m, 5m, 10m, 15m, 30m, 1h) roll up from this buffer

interface Bar1m {
  symbol: string;
  seq: number;
  bar_start: number;
  bar_end: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

class Bars1mBuffer {
  // Ring buffer per symbol (max 5000 bars = ~3.5 trading days at 1m)
  private buffers = new Map<string, Bar1m[]>();
  private readonly MAX_SIZE = 5000;

  // Append a closed 1m bar (immutable once added)
  append(symbol: string, bar: Bar1m): void {
    if (!this.buffers.has(symbol)) {
      this.buffers.set(symbol, []);
    }

    const buffer = this.buffers.get(symbol)!;
    buffer.push(bar);

    // Trim to max size (FIFO)
    if (buffer.length > this.MAX_SIZE) {
      buffer.shift();
    }
  }

  // Get N most recent closed 1m bars
  getRecent(symbol: string, n: number): Bar1m[] {
    const buffer = this.buffers.get(symbol) || [];
    return buffer.slice(-n);
  }

  // Get 1m bars since a specific sequence number
  getSinceSeq(symbol: string, seq: number): Bar1m[] {
    const buffer = this.buffers.get(symbol) || [];
    return buffer.filter((bar) => bar.seq > seq);
  }

  // Get 1m bars in a time range (for rollup backfill)
  getRange(symbol: string, startMs: number, endMs: number): Bar1m[] {
    const buffer = this.buffers.get(symbol) || [];
    return buffer.filter((bar) => bar.bar_start >= startMs && bar.bar_end <= endMs);
  }

  // Peek at the most recent bar (for incremental rollup)
  peekLast(symbol: string): Bar1m | undefined {
    const buffer = this.buffers.get(symbol);
    if (!buffer || buffer.length === 0) return undefined;
    return buffer[buffer.length - 1];
  }

  // Reconcile a bar with official data (for AM aggregate minute reconciliation)
  // Replaces existing bar by seq (primary) or bar_end (fallback), or appends if not found
  reconcile(symbol: string, bar: Bar1m): 
    | { replaced: true; oldBar: Bar1m }
    | { replaced: false; oldBar?: undefined } {
    if (!this.buffers.has(symbol)) {
      this.buffers.set(symbol, []);
    }

    const buffer = this.buffers.get(symbol)!;
    
    // Primary: Find existing bar with same seq (most deterministic)
    let existingIndex = buffer.findIndex((b) => b.seq === bar.seq);
    
    // Fallback: Find by bar_end if seq match fails (handles rare DST edge cases)
    if (existingIndex < 0) {
      existingIndex = buffer.findIndex((b) => b.bar_end === bar.bar_end);
    }

    if (existingIndex >= 0) {
      // Replace existing tick-based bar with official AM data
      const oldBar = buffer[existingIndex]!;
      buffer[existingIndex] = bar;
      return { replaced: true, oldBar };
    } else {
      // No existing bar found - append as new (gap-fill scenario)
      buffer.push(bar);
      // Trim to max size (FIFO)
      if (buffer.length > this.MAX_SIZE) {
        buffer.shift();
      }
      return { replaced: false };
    }
  }

  // Clear buffer for a symbol (rarely used)
  clear(symbol: string): void {
    this.buffers.delete(symbol);
  }

  // Get buffer size for diagnostics
  size(symbol: string): number {
    return this.buffers.get(symbol)?.length || 0;
  }
}

// Singleton instance
export const bars1m = new Bars1mBuffer();
