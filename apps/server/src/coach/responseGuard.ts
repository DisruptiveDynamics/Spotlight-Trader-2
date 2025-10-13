const NUMERIC_MARKET_REGEX = /\b(vwap|price|last|close|open|high|low|volume|atr|rsi|entry|stop|target|trading at)\b/i;
const HAS_NUMBER = /-?\d+(\.\d+)?/;

export function appearsToClaimMarketNumber(text: string): boolean {
  return NUMERIC_MARKET_REGEX.test(text) && HAS_NUMBER.test(text);
}

export class ToolCallTracker {
  private lastToolCallAt = 0;
  private readonly FRESHNESS_WINDOW_MS = 3000; // 3 seconds

  markToolCalled(): void {
    this.lastToolCallAt = Date.now();
  }

  hasRecentToolCall(): boolean {
    return (Date.now() - this.lastToolCallAt) <= this.FRESHNESS_WINDOW_MS;
  }

  shouldBlockResponse(responseText: string): boolean {
    return appearsToClaimMarketNumber(responseText) && !this.hasRecentToolCall();
  }
}
