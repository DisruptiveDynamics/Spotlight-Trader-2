import { randomUUID } from "node:crypto";

import { onEvent, publishCoach } from "./state";
import type { AppEvent } from "./types";

// Simple, transparent rules that generate coach messages.
// You can expand/replace with LLM once plumbing is verified.
export function startProactiveRules() {
  const off = onEvent((ev: AppEvent) => {
    if (ev.type === "latency") {
      const rtt = ev.rtt;
      if (rtt > 180) {
        publishCoach({
          id: randomUUID(),
          ts: Date.now(),
          level: "warn",
          title: `High latency: ${rtt}ms`,
          body: "Your RTT is above 180ms. Consider switching networks or pausing entries.",
          tags: ["latency", "network"],
          data: { rtt },
        });
      }
    }

    if (ev.type === "market" && ev.status === "halted") {
      publishCoach({
        id: randomUUID(),
        ts: Date.now(),
        level: "error",
        title: "Market Halt Detected",
        body: "Order flow paused. Review existing positions and alerts.",
        tags: ["market", "halt"],
        data: { status: ev.status },
      });
    }

    if (ev.type === "chart:append") {
      // Example: 5-candle momentum poke on the active symbol/timeframe
      // (toy logic: last 5 closes increasing)
      // This is intentionally light-weight; replace with your real calc later.
      // NOTE: We don’t fetch global state here to keep this O(1) — rely on SSE in UI for richer stats.
    }
  });

  return () => off();
}
