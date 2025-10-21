/**
 * [PHASE-6] Tool Throttling
 * Rate limiting for voice assistant tools to prevent abuse and ensure quality responses
 */

export interface ThrottleConfig {
  maxCallsPerSecond: number;
  windowMs?: number; // Default: 1000ms
}

export class ToolThrottler {
  private callTimestamps = new Map<string, number[]>();
  private config: Record<string, ThrottleConfig> = {};

  constructor() {
    // [PHASE-6] Tool-specific throttling rates
    this.config = {
      // Micro tools: 8/sec (ultra-low latency, high frequency)
      get_last_price: { maxCallsPerSecond: 8 },
      get_last_vwap: { maxCallsPerSecond: 8 },
      get_last_ema: { maxCallsPerSecond: 8 },
      
      // Snapshot tools: 2/sec (moderate payload, contextual)
      get_chart_snapshot: { maxCallsPerSecond: 2 },
      get_market_regime: { maxCallsPerSecond: 2 },
      
      // Risk/rules tools: 1/sec (critical decisions, heavy compute)
      evaluate_rules: { maxCallsPerSecond: 1 },
      propose_entry_exit: { maxCallsPerSecond: 1 },
      get_recommended_risk_box: { maxCallsPerSecond: 1 },
      
      // Default for unlisted tools: 3/sec
      _default: { maxCallsPerSecond: 3 },
    };
  }

  /**
   * Check if a tool call should be throttled
   * @param toolName - Name of the tool
   * @param userId - User ID for per-user throttling
   * @returns null if allowed, or an error object if throttled
   */
  checkThrottle(
    toolName: string,
    userId: string,
  ): { allowed: boolean; error?: { code: string; message: string; retryAfterMs: number } } {
    const config = this.config[toolName] || this.config._default!;
    const windowMs = config.windowMs || 1000;
    const key = `${userId}:${toolName}`;

    const now = Date.now();
    const timestamps = this.callTimestamps.get(key) || [];

    // Remove timestamps outside the window
    const recentTimestamps = timestamps.filter((ts) => now - ts < windowMs);

    if (recentTimestamps.length >= config.maxCallsPerSecond) {
      const oldestTimestamp = recentTimestamps[0]!;
      const retryAfterMs = windowMs - (now - oldestTimestamp);

      return {
        allowed: false,
        error: {
          code: "THROTTLED",
          message: `Tool '${toolName}' throttled: ${config.maxCallsPerSecond} calls/sec limit exceeded. Retry after ${Math.ceil(retryAfterMs)}ms.`,
          retryAfterMs: Math.ceil(retryAfterMs),
        },
      };
    }

    // Allow the call and record timestamp
    recentTimestamps.push(now);
    this.callTimestamps.set(key, recentTimestamps);

    return { allowed: true };
  }

  /**
   * Clear throttling state for a user (e.g., on session end)
   */
  clearUser(userId: string): void {
    const keysToDelete: string[] = [];
    
    this.callTimestamps.forEach((_, key) => {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.callTimestamps.delete(key);
    });
  }

  /**
   * Cleanup old timestamps periodically
   */
  cleanup(): void {
    const now = Date.now();
    const windowMs = 1000;

    this.callTimestamps.forEach((timestamps, key) => {
      const recent = timestamps.filter((ts) => now - ts < windowMs);
      
      if (recent.length === 0) {
        this.callTimestamps.delete(key);
      } else {
        this.callTimestamps.set(key, recent);
      }
    });
  }
}

// Singleton instance
export const toolThrottler = new ToolThrottler();

// Cleanup every 5 seconds
setInterval(() => {
  toolThrottler.cleanup();
}, 5000);
