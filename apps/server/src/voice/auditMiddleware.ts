/**
 * [PHASE-6] Runtime Auditing Middleware
 * Detects when AI responses contain price-like numbers without recent tool calls
 * Helps prevent hallucination by enforcing tool usage for data-driven responses
 */

import { perfMetrics } from "@shared/perf/metrics";

export interface AuditConfig {
  enableAutoCorrect: boolean; // If true, auto-correct hallucinations
  violationWindowMs: number; // Time window to check for recent tool calls (default: 2000ms)
}

export class VoiceAuditMiddleware {
  private config: AuditConfig;
  private lastToolCallTimestamps = new Map<string, number>();

  constructor(config?: Partial<AuditConfig>) {
    this.config = {
      enableAutoCorrect: config?.enableAutoCorrect ?? false,
      violationWindowMs: config?.violationWindowMs ?? 2000,
    };
  }

  /**
   * Record a tool call for a session
   */
  recordToolCall(sessionId: string, toolName: string): void {
    this.lastToolCallTimestamps.set(`${sessionId}:${toolName}`, Date.now());
    
    // Also record generic tool call for any data tool
    if (this.isDataTool(toolName)) {
      this.lastToolCallTimestamps.set(`${sessionId}:_any_data_tool`, Date.now());
    }
  }

  /**
   * Check if a tool is a data tool (returns factual data)
   */
  private isDataTool(toolName: string): boolean {
    const dataTools = [
      "get_last_price",
      "get_last_vwap",
      "get_last_ema",
      "get_chart_snapshot",
      "get_market_regime",
      "get_recent_journal",
      "get_active_rules",
      "get_recent_signals",
    ];
    
    return dataTools.includes(toolName);
  }

  /**
   * Audit a voice response for potential hallucinations
   * Returns null if audit passes, or an error object if violation detected
   */
  auditResponse(
    sessionId: string,
    responseText: string,
  ): { violation: boolean; message?: string; suggestedCorrection?: string } {
    // Check if response contains price-like numbers (e.g., "$123.45", "665.23", etc.)
    const priceRegex = /\$?\d{2,4}\.\d{2,4}|\b\d{3,4}\.\d{1,2}\b/g;
    const matches = responseText.match(priceRegex);

    if (!matches || matches.length === 0) {
      // No price-like numbers detected
      return { violation: false };
    }

    // Check if there was a recent tool call
    const now = Date.now();
    const lastDataToolCall = this.lastToolCallTimestamps.get(`${sessionId}:_any_data_tool`);

    if (lastDataToolCall && now - lastDataToolCall < this.config.violationWindowMs) {
      // Recent tool call found - audit passes
      return { violation: false };
    }

    // Violation detected: price-like number without recent tool call
    const violationMessage = `Voice response contains price data (${matches.join(", ")}) without recent tool call within ${this.config.violationWindowMs}ms window.`;
    
    console.warn(`[PHASE-6] Audit violation detected for session ${sessionId}: ${violationMessage}`);
    
    // Record violation in metrics
    perfMetrics.recordVoiceToolViolation();

    if (this.config.enableAutoCorrect) {
      // Auto-correct by removing specific price numbers and adding disclaimer
      const correctedText = responseText.replace(
        priceRegex,
        "[checking live price]",
      );
      
      const suggestedCorrection = `${correctedText} Let me check the current price for you...`;
      
      return {
        violation: true,
        message: violationMessage,
        suggestedCorrection,
      };
    }

    return {
      violation: true,
      message: violationMessage,
    };
  }

  /**
   * Clear audit state for a session (on disconnect)
   */
  clearSession(sessionId: string): void {
    const keysToDelete: string[] = [];
    
    this.lastToolCallTimestamps.forEach((_, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.lastToolCallTimestamps.delete(key);
    });
  }

  /**
   * Cleanup old timestamps periodically
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.violationWindowMs * 2; // Keep for 2x the window

    this.lastToolCallTimestamps.forEach((timestamp, key) => {
      if (now - timestamp > maxAge) {
        this.lastToolCallTimestamps.delete(key);
      }
    });
  }
}

// Singleton instance
export const voiceAuditMiddleware = new VoiceAuditMiddleware({
  enableAutoCorrect: false, // Disabled by default - just log violations
  violationWindowMs: 2000,
});

// Cleanup every 10 seconds
setInterval(() => {
  voiceAuditMiddleware.cleanup();
}, 10000);
