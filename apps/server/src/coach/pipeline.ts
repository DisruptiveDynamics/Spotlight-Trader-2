import { enforceRealtimeClaim } from "./guards/noDataGuard";
import { ensureFreshTools } from "./guards/freshnessGuard";

type ToolCaller = (name: string, input: unknown) => Promise<any>;

const freshnessCache = new Map<string, { snapshotAt?: number; rulesAt?: number }>();

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
