import { enforceRealtimeClaim } from "./guards/noDataGuard";
import { ensureFreshTools } from "./guards/freshnessGuard";

type ToolCaller = (name: string, input: unknown) => Promise<any>;

const freshnessCache = new Map<string, { snapshotAt?: number; rulesAt?: number }>();
const ttsDebounceCache = new Map<string, number>();
const TTS_DEBOUNCE_MS = 10000; // 10 seconds per symbol

/** Main helper: guarantees tool-first, then sanitizes any 'no realtime data' drafts */
export async function verifyThenSpeak(
  symbol: string,
  timeframe: string,
  draft: string,
  callTool: ToolCaller,
): Promise<string> {
  await ensureFreshTools(symbol, timeframe, callTool, freshnessCache);
  const line = await enforceRealtimeClaim(draft, symbol, callTool, timeframe);
  return line;
}

/** Check if symbol is in TTS debounce period */
export function shouldDebounce(symbol: string): boolean {
  const now = Date.now();
  const lastSpoke = ttsDebounceCache.get(symbol);

  if (lastSpoke && now - lastSpoke < TTS_DEBOUNCE_MS) {
    return true;
  }

  return false;
}

/** Mark symbol as having just spoken (for debounce tracking) */
export function markSpoken(symbol: string): void {
  ttsDebounceCache.set(symbol, Date.now());
}
