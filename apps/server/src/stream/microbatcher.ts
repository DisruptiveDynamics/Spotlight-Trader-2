/**
 * [PHASE-5] SSE Micro-batching
 * Aggregates up to 5 microbars or 20ms timeout (whichever comes first)
 * Reduces SSE message overhead and improves network efficiency
 */

interface MicrobarData {
  symbol: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MicrobarBatch {
  microbars: MicrobarData[];
}

type FlushCallback = (batch: MicrobarBatch) => void;

export class MicrobarBatcher {
  private buffer: MicrobarData[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly maxBatchSize: number;
  private readonly maxDelayMs: number;
  private readonly onFlush: FlushCallback;

  constructor(onFlush: FlushCallback, maxBatchSize = 5, maxDelayMs = 20) {
    this.onFlush = onFlush;
    this.maxBatchSize = maxBatchSize;
    this.maxDelayMs = maxDelayMs;
  }

  /**
   * Add a microbar to the batch
   * Flushes immediately if batch reaches maxBatchSize
   */
  push(microbar: MicrobarData): void {
    this.buffer.push(microbar);

    // Start timer on first microbar
    if (this.buffer.length === 1) {
      this.timer = setTimeout(() => this.flush(), this.maxDelayMs);
    }

    // Flush immediately if batch is full
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Flush current batch
   */
  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const batch: MicrobarBatch = {
      microbars: [...this.buffer],
    };

    this.buffer = [];
    this.onFlush(batch);
  }

  /**
   * Force flush (for cleanup)
   */
  destroy(): void {
    this.flush();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
