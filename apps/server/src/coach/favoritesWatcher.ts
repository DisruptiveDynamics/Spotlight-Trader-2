import { getHistory } from "../history/service";
import { ruleEvaluator } from "../rules/evaluator";
import { eventBus } from "../market/eventBus";

type WatcherOpts = {
  symbols: string[];
  timeframe: "1m";
  baseIntervalMs?: number; // low cadence
  burstIntervalMs?: number; // high cadence when interesting
  burstDurationMs?: number;
};

export class FavoritesWatcher {
  private timer: NodeJS.Timeout | null = null;
  private burstUntil = new Map<string, number>();

  constructor(private opts: WatcherOpts) {}

  start() {
    if (this.timer) return;
    const base = this.opts.baseIntervalMs ?? 120_000;
    this.timer = setInterval(() => this.scan(), base);
    // initial kick
    void this.scan();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async scan() {
    const now = Date.now();
    for (const symbol of this.opts.symbols) {
      try {
        const bars = await getHistory({ symbol, timeframe: "1m", limit: 30, before: now });
        if (!bars.length) continue;

        // Simple heuristics; replace with your curated rule set
        const last = bars[bars.length - 1]!;
        const prev = bars[bars.length - 2] ?? last;

        const vwapReclaim = last.ohlcv.c > (last.ohlcv.o + last.ohlcv.h + last.ohlcv.l + last.ohlcv.c) / 4; // stub
        const nearORB = Math.abs(last.ohlcv.c - bars[0]!.ohlcv.h) / Math.max(1, bars[0]!.ohlcv.h) < 0.002;

        const interesting = vwapReclaim || nearORB;

        const burstSpan = this.opts.burstDurationMs ?? 180_000;
        const burst = this.opts.burstIntervalMs ?? 15_000;

        if (interesting) {
          this.burstUntil.set(symbol, now + burstSpan);
          // Emit a coach callout
          eventBus.emit("signal:new" as any, {
            ruleId: "favorites-watcher",
            symbol,
            ts: now,
            direction: vwapReclaim ? "long" : "short",
            confidence: vwapReclaim ? 0.65 : 0.55,
            summary: vwapReclaim ? "VWAP reclaim" : "Opening range proximity",
          });
        }

        // If in burst window, schedule a quick re-scan
        const until = this.burstUntil.get(symbol) ?? 0;
        if (until > now) {
          setTimeout(() => void this.scan(), burst);
        }
      } catch (e) {
        // log and continue
      }
    }
  }
}
