/**
 * Performance Metrics
 * Dev-only performance tracking for bar latency and indicator updates
 */

const isDev = typeof process !== 'undefined' 
  ? process.env.NODE_ENV === 'development' 
  : false;

/**
 * Histogram for tracking latency distributions
 */
class LatencyHistogram {
  private measurements: number[] = [];
  private maxSize = 1000; // Keep last 1000 measurements

  record(latencyMs: number): void {
    this.measurements.push(latencyMs);
    if (this.measurements.length > this.maxSize) {
      this.measurements.shift();
    }
  }

  getStats(): {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    if (this.measurements.length === 0) return null;

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count,
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      mean: sorted.reduce((sum, val) => sum + val, 0) / count,
      p50: sorted[Math.floor(count * 0.5)] ?? 0,
      p95: sorted[Math.floor(count * 0.95)] ?? 0,
      p99: sorted[Math.floor(count * 0.99)] ?? 0,
    };
  }

  clear(): void {
    this.measurements = [];
  }
}

/**
 * Performance metrics singleton
 */
class PerformanceMetrics {
  private barLatencyHistogram = new LatencyHistogram();
  private indicatorUpdateHistogram = new LatencyHistogram();
  private enabled = isDev;

  /**
   * Record bar latency (tick → candle update)
   * @param tickTs - Original tick timestamp
   * @param barUpdateTs - Bar update timestamp
   */
  recordBarLatency(tickTs: number, barUpdateTs: number): void {
    if (!this.enabled) return;
    const latencyMs = barUpdateTs - tickTs;
    this.barLatencyHistogram.record(latencyMs);
  }

  /**
   * Record indicator update time
   * @param durationMs - Time to update indicators in milliseconds
   */
  recordIndicatorUpdate(durationMs: number): void {
    if (!this.enabled) return;
    this.indicatorUpdateHistogram.record(durationMs);
  }

  /**
   * Get bar latency statistics
   */
  getBarLatencyStats() {
    return this.barLatencyHistogram.getStats();
  }

  /**
   * Get indicator update statistics
   */
  getIndicatorUpdateStats() {
    return this.indicatorUpdateHistogram.getStats();
  }

  /**
   * Print summary to console (dev only)
   */
  printSummary(): void {
    if (!this.enabled) return;

    const barStats = this.getBarLatencyStats();
    const indicatorStats = this.getIndicatorUpdateStats();

    console.group('📊 Performance Metrics');
    
    if (barStats) {
      console.log('Bar Latency (tick → candle update):');
      console.table({
        Count: barStats.count,
        'Min (ms)': barStats.min.toFixed(2),
        'Mean (ms)': barStats.mean.toFixed(2),
        'P50 (ms)': barStats.p50.toFixed(2),
        'P95 (ms)': barStats.p95.toFixed(2),
        'P99 (ms)': barStats.p99.toFixed(2),
        'Max (ms)': barStats.max.toFixed(2),
      });
    } else {
      console.log('Bar Latency: No measurements');
    }

    if (indicatorStats) {
      console.log('Indicator Update Time:');
      console.table({
        Count: indicatorStats.count,
        'Min (ms)': indicatorStats.min.toFixed(2),
        'Mean (ms)': indicatorStats.mean.toFixed(2),
        'P50 (ms)': indicatorStats.p50.toFixed(2),
        'P95 (ms)': indicatorStats.p95.toFixed(2),
        'P99 (ms)': indicatorStats.p99.toFixed(2),
        'Max (ms)': indicatorStats.max.toFixed(2),
      });
    } else {
      console.log('Indicator Update: No measurements');
    }

    console.groupEnd();
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.barLatencyHistogram.clear();
    this.indicatorUpdateHistogram.clear();
  }

  /**
   * Enable/disable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const perfMetrics = new PerformanceMetrics();

/**
 * Measure execution time of a function (dev only)
 * @param fn - Function to measure
 * @returns Result of function and duration in ms
 */
export function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Measure async function execution time (dev only)
 * @param fn - Async function to measure
 * @returns Result of function and duration in ms
 */
export async function measureTimeAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

// Auto-print metrics summary every 60 seconds in dev
if (isDev && typeof setInterval !== 'undefined') {
  setInterval(() => {
    if (perfMetrics.isEnabled()) {
      perfMetrics.printSummary();
    }
  }, 60_000);
}
