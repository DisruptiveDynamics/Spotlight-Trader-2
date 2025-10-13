/**
 * Spotlight Trader — Agent Context Composer
 * Keep context tiny (1–2KB). Fetch larger data via tools on-demand.
 */

export type MiniSnapshot = {
  focusSymbol?: string; // e.g., "ES"
  timeframe?: "1m" | "5m" | "1h" | "1d"; // e.g., "1m"
  lastAction?: string; // e.g., "entered long @ 5023.25"
  constraints?: string[]; // e.g., ["no live orders", "explain in 2 lines"]
  hud?: {
    rtt?: number | null;
    sseReconnects?: number | null;
    market?: "open" | "closed" | "unknown";
  };
};

/** Returns a compact string you can prepend to the user turn. */
export function composeMiniContext(s: MiniSnapshot = {}): string {
  const lines: string[] = [];
  if (s.focusSymbol) lines.push(`focusSymbol: ${s.focusSymbol}`);
  if (s.timeframe) lines.push(`timeframe: ${s.timeframe}`);
  if (s.lastAction) lines.push(`lastAction: ${s.lastAction}`);
  if (s.constraints?.length) lines.push(`constraints: ${s.constraints.join("; ")}`);
  const hud = s.hud ?? {};
  if (hud.rtt != null || hud.sseReconnects != null || hud.market) {
    lines.push(
      `hud: rtt=${hud.rtt ?? "n/a"}, sseReconnects=${hud.sseReconnects ?? "n/a"}, market=${hud.market ?? "unknown"}`,
    );
  }
  return lines.length ? `[[session_context]]\n${lines.join("\n")}\n[[/session_context]]\n` : "";
}
