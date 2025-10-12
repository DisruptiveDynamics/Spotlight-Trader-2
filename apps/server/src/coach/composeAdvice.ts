export function composeAdvice(px: {
  symbol: string;
  grade?: string;
  entry: number;
  sl: number;
  tps: number[];
  rr: number;
  note?: string;
}) {
  const tp = px.tps?.[0];
  return `${px.symbol} ${px.grade ?? ""} entry ${px.entry.toFixed(2)}, SL ${px.sl.toFixed(2)}, TP ${tp?.toFixed(2)}, R:R ${px.rr.toFixed(1)}.${px.note ? " " + px.note : ""}`.trim();
}
