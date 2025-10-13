import { isMarketQuestion, extractSymbol, extractTimeframe } from './marketClassifier.js';
import { toolHandlers } from '../copilot/tools/handlers.js';

export interface SnapshotContext {
  symbol: string;
  timeframe: string;
  snapshotJSON: string;
}

export async function ensureMarketContext(
  userId: string, 
  userUtterance: string
): Promise<SnapshotContext | null> {
  if (!isMarketQuestion(userUtterance)) {
    return null;
  }

  // Extract symbol and timeframe from user question
  const symbol = extractSymbol(userUtterance) ?? 'SPY';
  const timeframe = extractTimeframe(userUtterance);

  try {
    // Fetch real-time snapshot from ring buffer via tool handler
    const snapshot = await toolHandlers.get_chart_snapshot({
      symbol,
      timeframe,
      barCount: 50
    });

    // Build context payload
    const payload = {
      symbol,
      timeframe,
      bars: snapshot.bars,
      indicators: snapshot.indicators,
      session: snapshot.session,
      volatility: snapshot.volatility,
      regime: snapshot.regime,
      lastUpdate: Date.now()
    };

    return {
      symbol,
      timeframe,
      snapshotJSON: JSON.stringify(payload)
    };
  } catch (error) {
    console.error('[ensureMarketContext] Failed to fetch snapshot:', error);
    return null;
  }
}
