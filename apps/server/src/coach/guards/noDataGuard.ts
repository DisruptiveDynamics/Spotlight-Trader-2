const NO_DATA_REGEX =
  /\b(?:no|don't|do not|can't|cannot)\b.*\b(?:real[- ]?time|live|market|data|feed)\b/i;

export type ToolCaller = (name: string, input: unknown) => Promise<any>;

/** If draft text claims 'no realtime data', force a snapshot tool call and return a corrected line */
export async function enforceRealtimeClaim(
  draft: string,
  symbol: string,
  callTool: ToolCaller,
  timeframe: string = "1m",
  barCount: number = 50,
): Promise<string> {
  if (!NO_DATA_REGEX.test(draft)) return draft;
  const snap = await callTool("get_chart_snapshot", { symbol, timeframe, barCount });
  const regime = snap?.regime ? ` ${snap.regime}` : "";
  const vol = snap?.volumeFactor != null ? ` vol ${Number(snap.volumeFactor).toFixed(1)}x` : "";
  return `Live check OK.${regime}${vol}`.trim();
}
