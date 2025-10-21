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
    // [PHASE-6] Multi-stage price detection with contextual filtering
    
    // Stage 1: Find all potential price-like patterns
    const pricePatterns = this.extractPricePatterns(responseText);
    
    if (pricePatterns.length === 0) {
      // No price-like numbers detected
      return { violation: false };
    }

    // Stage 2: Filter by context to reduce false positives
    const likelyPrices = this.filterByContext(responseText, pricePatterns);

    if (likelyPrices.length === 0) {
      // Patterns detected, but likely not prices based on context
      return { violation: false };
    }

    // Stage 3: Check if there was a recent tool call
    const now = Date.now();
    const lastDataToolCall = this.lastToolCallTimestamps.get(`${sessionId}:_any_data_tool`);

    if (lastDataToolCall && now - lastDataToolCall < this.config.violationWindowMs) {
      // Recent tool call found - audit passes
      return { violation: false };
    }

    // Violation detected: price-like number without recent tool call
    const violationMessage = `Voice response contains price data (${likelyPrices.join(", ")}) without recent tool call within ${this.config.violationWindowMs}ms window.`;
    
    console.warn(`[PHASE-6] Audit violation detected for session ${sessionId}: ${violationMessage}`);
    
    // Record violation in metrics
    perfMetrics.recordVoiceToolViolation();

    if (this.config.enableAutoCorrect) {
      // Auto-correct by removing specific price numbers and adding disclaimer
      let correctedText = responseText;
      likelyPrices.forEach((price) => {
        correctedText = correctedText.replace(price, "[checking live price]");
      });
      
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
   * Extract all potential price patterns from text with indices
   * Returns structured matches to analyze each occurrence separately
   */
  private extractPricePatterns(text: string): Array<{ value: string; start: number; end: number }> {
    // [PHASE-6] Ultra-comprehensive pattern matching covering ALL price formats:
    // 1. Currency symbols: $123.45, €1,234, £18k, $5M, $85
    // 2. Magnitude suffixes (1+ digits): 18k, 5K, 1.2M, 3.5B, 500m
    // 3. Decimal numbers (any size): 5.25, 85.30, 123.45, 17890.55
    // 4. Comma-separated numbers: 1,234, 18,000, 1,234.56
    // 5. Plain integers (1+ digits): 85, 665, 18000, 17890
    // 6. Signed numbers: +123.45, -50.25
    const pattern = /[$€£¥]\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?(?:\s*[kmb])?|\b\d{1,3}(?:\.\d+)?\s*[kmb]\b|[+-]?\b\d{1,2}\.\d{1,4}\b|[+-]?\b\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|[+-]?\b\d{1,}(?:\.\d{1,4})?\b/gi;

    const matches: Array<{ value: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;

    // Reset lastIndex to start from beginning
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return matches;
  }

  /**
   * Filter price patterns by context to reduce false positives
   * Analyzes each match independently based on surrounding text
   * 
   * Strategy: Permissive filtering prioritizes catching hallucinations over avoiding false positives
   * since violations are warnings/logs, not blocking errors
   */
  private filterByContext(
    text: string,
    matches: Array<{ value: string; start: number; end: number }>,
  ): string[] {
    return matches
      .filter((match) => {
        const { value, start, end } = match;

        // Always flag: currency symbols
        if (/[$€£¥]/.test(value)) {
          return true;
        }

        // Always flag: any decimal number (likely a price)
        if (/\d+\.\d+/.test(value)) {
          return true;
        }

        // Always flag: magnitude suffixes (k/m/b)
        if (/[kmb]$/i.test(value)) {
          return true;
        }

        // Always flag: comma-separated numbers (e.g., 1,234)
        if (/,/.test(value)) {
          return true;
        }

        // Extract context (50 chars before, 50 chars after)
        const contextStart = Math.max(0, start - 50);
        const contextEnd = Math.min(text.length, end + 50);
        const contextOriginal = text.slice(contextStart, contextEnd); // Keep original casing for ticker detection
        const context = contextOriginal.toLowerCase(); // Lowercase for keyword matching

        // Positive signals (price-related context)
        const priceKeywords = [
          // Explicit price keywords
          "price", "trading", "quote", "bid", "ask", "spread",
          // Market levels
          "level", "levels", "support", "resistance", "target",
          "high", "low", "entry", "exit", "stop",
          // Price movements & verbs
          "hit", "reached", "broke", "broke out", "bounced",
          "up to", "down to", "around", "near", "about",
          // Generic verbs (common in price mentions)
          " at ", " is ", " was ", "currently", "now",
          // Markets
          "nasdaq", "s&p", "dow", "russell",
          // Currency
          "usd", "dollar", "dollars", "eur", "euro", "gbp", "pound", "yen",
          // Value
          "value", "worth", "cost", "valued",
        ];

        // Specific ticker symbols (futures/indices/ETFs) - case insensitive
        const tickerRegex = /\b(es|nq|ym|rty|spy|qqq|iwm|dia|vix|cl|gc|ng|zb|si)\b/i;
        
        // Generic equity ticker pattern (2-5 letters, case insensitive for lowercased context)
        // But check against original casing for uppercase detection
        const equityTickerRegex = /\b[A-Z]{2,5}\b/;

        // Check for price keywords (in lowercase context)
        const hasPriceKeyword = priceKeywords.some((keyword) => context.includes(keyword));
        
        // Check for specific tickers (in lowercase context)
        const hasSpecificTicker = tickerRegex.test(context);
        
        // Check for generic equity tickers (in ORIGINAL casing)
        const hasEquityTicker = equityTickerRegex.test(contextOriginal);
        
        // Combined: has price signal if any indicator present
        const hasPriceSignal = hasPriceKeyword || hasSpecificTicker || hasEquityTicker;

        // Negative signals (likely NOT prices) - only exclude if NO price signal present
        const excludePatterns = [
          "year 20", // e.g., "year 2025" not "price 2025"
          " ago", // e.g., "5 minutes ago"
          "last ", // e.g., "last 15 signals" (but allow "last price")
        ];

        const hasExcludePattern = excludePatterns.some((pattern) => context.includes(pattern));

        // Only exclude if strong negative signal AND no price signal
        if (hasExcludePattern && !hasPriceSignal) {
          return false;
        }

        // For plain integers (ANY digits without decimals or suffixes)
        if (/^\d+$/.test(value)) {
          // Small integers (1-2 digits) are noisy, require strong price signal
          if (value.length <= 2) {
            return hasPriceSignal && (hasEquityTicker || hasSpecificTicker || context.includes("price"));
          }
          
          // Larger integers (3+ digits) require any price signal
          return hasPriceSignal;
        }

        // Default: flag it (permissive approach)
        return true;
      })
      .map((match) => match.value);
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
