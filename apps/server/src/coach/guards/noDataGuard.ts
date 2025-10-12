/**
 * Runtime guard to prevent AI from claiming "no real-time data"
 * Forces tool calls when uncertainty detected
 */

const NO_DATA_REGEX = /\b(no|don't|do not|can't|cannot|unable|lack|missing)\b.*\b(real[- ]?time|live|market|data|feed|access|information)\b/i;

export interface GuardContext {
  symbol?: string;
  timeframe?: string;
  callTool: (toolName: string, params: Record<string, any>) => Promise<any>;
}

/**
 * Checks if the AI response claims "no data" and forces verification
 * @param draft - The AI's draft response text
 * @param context - Context including symbol and tool caller
 * @returns Corrected response or original if no issue detected
 */
export async function guardNoData(
  draft: string,
  context: GuardContext
): Promise<string> {
  // Check if draft contains "no data" language
  if (NO_DATA_REGEX.test(draft)) {
    console.warn('[NoDataGuard] Detected "no data" claim, forcing tool verification');

    try {
      // Force chart snapshot to verify real-time data access
      const symbol = context.symbol || 'SPY'; // Default to SPY if no symbol provided
      const timeframe = context.timeframe || '1m';

      const snapshot = await context.callTool('get_chart_snapshot', {
        symbol,
        timeframe,
        barCount: 50,
      });

      // Construct verified response with actual data
      const regime = snapshot?.regime || 'unknown';
      const volumeFactor = snapshot?.volumeFactor || snapshot?.volume_ma 
        ? `${((snapshot.volume / snapshot.volume_ma) * 100).toFixed(0)}%` 
        : 'n/a';

      return `Live check OK. ${symbol} ${regime} regime, volume ${volumeFactor}.`;
    } catch (error) {
      console.error('[NoDataGuard] Tool call failed:', error);
      // If tool fails, at least acknowledge the attempt
      return 'Snapshot unavailable — waiting for bars.';
    }
  }

  // No issue detected, return original draft
  return draft;
}

/**
 * Extended guard for multiple forbidden phrases
 */
const FORBIDDEN_PHRASES = [
  /\bI don'?t have real[- ]?time data\b/i,
  /\bI can'?t access the market\b/i,
  /\bI don'?t have access to\b/i,
  /\bno live data available\b/i,
  /\bunable to retrieve market data\b/i,
];

export function containsForbiddenPhrase(text: string): boolean {
  return FORBIDDEN_PHRASES.some((regex) => regex.test(text));
}
