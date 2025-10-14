import { validateEnv } from "@shared/env";

const env = validateEnv(process.env);

export interface RingBar {
  t: number;      // bar_start timestamp
  seq: number;    // sequence number
  o: number;      // open
  h: number;      // high
  l: number;      // low
  c: number;      // close
  v?: number;     // volume (optional)
}

/**
 * Unified ring buffer for market data
 * Single source of truth with capped memory usage
 */
class Ring {
  private buf: RingBar[] = [];
  
  constructor(private cap: number = env.RING_BUFFER_CAP) {}
  
  /**
   * Push a new bar (auto-trims to cap)
   */
  push(b: RingBar): void {
    this.buf.push(b);
    if (this.buf.length > this.cap) {
      this.buf.splice(0, this.buf.length - this.cap);
    }
  }
  
  /**
   * Push multiple bars (more efficient than individual pushes)
   */
  pushMany(bars: RingBar[]): void {
    this.buf.push(...bars);
    if (this.buf.length > this.cap) {
      this.buf.splice(0, this.buf.length - this.cap);
    }
  }
  
  /**
   * Get N most recent bars
   */
  latest(n: number = 300): RingBar[] {
    return this.buf.slice(-n);
  }
  
  /**
   * Get bars since a sequence number
   */
  sinceSeq(seq: number): RingBar[] {
    return this.buf.filter((bar) => bar.seq > seq);
  }
  
  /**
   * Get bars in time range
   */
  range(startMs: number, endMs: number): RingBar[] {
    return this.buf.filter((bar) => bar.t >= startMs && bar.t < endMs);
  }
  
  /**
   * Peek at most recent bar (for voice tools, etc)
   */
  peekLast(): RingBar | null {
    return this.buf.length > 0 ? this.buf[this.buf.length - 1]! : null;
  }
  
  /**
   * Get oldest bar timestamp (for lazy loading)
   */
  oldestTs(): number | null {
    return this.buf.length > 0 ? this.buf[0]!.t : null;
  }
  
  /**
   * Get buffer size
   */
  size(): number {
    return this.buf.length;
  }
  
  /**
   * Clear all bars
   */
  clear(): void {
    this.buf = [];
  }
}

/**
 * Create key for (symbol, timeframe) tuple
 */
function keyFor(symbol: string, tf: string): string {
  return `${symbol}:${tf}`;
}

/**
 * Global buffer registry (per symbol+timeframe)
 */
const buffers = new Map<string, Ring>();

/**
 * Get or create buffer for (symbol, timeframe)
 */
export function getBuffer(symbol: string, tf: string, cap: number = env.RING_BUFFER_CAP): Ring {
  const k = keyFor(symbol, tf);
  if (!buffers.has(k)) {
    buffers.set(k, new Ring(cap));
  }
  return buffers.get(k)!;
}

/**
 * Clear buffer for (symbol, timeframe)
 */
export function clearBuffer(symbol: string, tf: string): void {
  const k = keyFor(symbol, tf);
  buffers.delete(k);
}

/**
 * Clear all buffers
 */
export function clearAllBuffers(): void {
  buffers.clear();
}
