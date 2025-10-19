import { logger } from "@server/logger";

/**
 * Inflight request deduplication
 * Coalesces concurrent requests for the same key into a single promise
 * Returns shared result to all waiters
 */
export class InflightCache<T> {
  private inflight = new Map<string, Promise<T>>();

  /**
   * Execute fn if not already inflight for this key
   * If inflight, return the existing promise
   */
  async coalesce(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      logger.debug({ key }, "Inflight deduplication: using existing request");
      return existing;
    }

    logger.debug({ key }, "Inflight deduplication: starting new request");
    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Clear all inflight requests
   */
  clear(): void {
    this.inflight.clear();
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      inflightCount: this.inflight.size,
      keys: Array.from(this.inflight.keys()),
    };
  }
}
