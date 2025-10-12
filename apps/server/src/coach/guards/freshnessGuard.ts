export type NowFn = () => number;
export type ToolCaller = (name: string, input: unknown) => Promise<any>;

const DEFAULT_SNAPSHOT_MAX_AGE_MS = 5000; // 5s
const DEFAULT_RULES_MAX_AGE_MS = 7000; // 7s

/** Ensures we have a recent snapshot+rules before speaking; calls tools if stale. */
export async function ensureFreshTools(
  symbol: string,
  timeframe: string,
  callTool: ToolCaller,
  cache: Map<string, { snapshotAt?: number; rulesAt?: number }>,
  now: NowFn = Date.now,
  maxAgeSnapshotMs = DEFAULT_SNAPSHOT_MAX_AGE_MS,
  maxAgeRulesMs = DEFAULT_RULES_MAX_AGE_MS,
) {
  const k = `${symbol}:${timeframe}`;
  const st = cache.get(k) || {};
  const t = now();

  if (!st.snapshotAt || t - st.snapshotAt > maxAgeSnapshotMs) {
    await callTool("get_chart_snapshot", { symbol, timeframe, barCount: 50 });
    st.snapshotAt = t;
  }
  if (!st.rulesAt || t - st.rulesAt > maxAgeRulesMs) {
    await callTool("evaluate_rules", { symbol, timeframe });
    st.rulesAt = t;
  }
  cache.set(k, st);
}
