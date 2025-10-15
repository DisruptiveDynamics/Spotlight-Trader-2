import { EventEmitter } from "node:events";

import type { AppEvent, ChartSnapshot, CoachMessage, JournalEntry, Toolbelt } from "./types";

const bus = new EventEmitter();
bus.setMaxListeners(50);

// Mirrors
const charts = new Map<string, ChartSnapshot>(); // key: `${symbol}|${timeframe}`
const journal: JournalEntry[] = [];
const metrics: { latencyRTT?: number; sseReconnects?: number; market?: string } = {};
const coachFeed: CoachMessage[] = [];

function keyOf(symbol: string, timeframe: string) {
  return `${symbol}|${timeframe}`;
}

export function pushEvent(ev: AppEvent) {
  switch (ev.type) {
    case "chart:update": {
      const k = keyOf(ev.snapshot.symbol, ev.snapshot.timeframe);
      charts.set(k, ev.snapshot);
      break;
    }
    case "chart:append": {
      const k = keyOf(ev.symbol, ev.timeframe);
      const snap = charts.get(k) ?? { symbol: ev.symbol, timeframe: ev.timeframe, points: [] };
      snap.points = [...snap.points, ev.point].slice(-2000); // cap
      charts.set(k, snap);
      break;
    }
    case "journal:append":
      journal.push(ev.entry);
      if (journal.length > 2000) journal.shift();
      break;
    case "latency":
      metrics.latencyRTT = ev.rtt;
      if (typeof ev.sseReconnects === "number") metrics.sseReconnects = ev.sseReconnects;
      break;
    case "market":
      metrics.market = ev.status;
      break;
    case "custom":
      // add custom metrics under their key if they’re primitives
      if (
        typeof ev.value === "string" ||
        typeof ev.value === "number" ||
        typeof ev.value === "boolean"
      ) {
        // @ts-expect-error index ok
        metrics[ev.key] = ev.value;
      }
      break;
  }
  bus.emit("event", ev);
}

export function publishCoach(msg: CoachMessage) {
  coachFeed.push(msg);
  while (coachFeed.length > 1000) coachFeed.shift();
  bus.emit("coach", msg);
}

export const toolbelt: Toolbelt = {
  getSnapshot() {
    const chartsObj: Record<string, ChartSnapshot> = {};
    for (const [k, v] of charts) chartsObj[k] = v;
    const journalTail = journal.slice(-200);
    return { charts: chartsObj, metrics: { ...metrics }, journalTail };
  },
  listCoachMessages(since) {
    if (!since) return [...coachFeed];
    return coachFeed.filter((m) => m.ts >= since);
  },
  pushEvent,
};

export function onEvent(cb: (e: AppEvent) => void) {
  bus.on("event", cb);
  return () => bus.off("event", cb);
}
export function onCoach(cb: (m: CoachMessage) => void) {
  bus.on("coach", cb);
  return () => bus.off("coach", cb);
}
