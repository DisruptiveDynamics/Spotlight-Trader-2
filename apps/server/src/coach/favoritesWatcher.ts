import { getHistory } from "../history/service";

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
        const _prev = bars[bars.length - 2] ?? last;

        const vwapReclaim = last.close > (last.open + last.high + last.low + last.close) / 4; // stub
        const nearORB = Math.abs(last.close - bars[0]!.high) / Math.max(1, bars[0]!.high) < 0.002;

        const interesting = vwapReclaim || nearORB;

        const burstSpan = this.opts.burstDurationMs ?? 180_000;
        const burst = this.opts.burstIntervalMs ?? 15_000;

        if (interesting) {
          this.burstUntil.set(symbol, now + burstSpan);
          // TODO: Restore signal emission with proper Signal type
          // eventBus.emit("signal:new", {
          //   symbol,
          //   direction: vwapReclaim ? "long" : "short",
          //   confidence: vwapReclaim ? 0.65 : 0.55,
          //   summary: vwapReclaim ? "VWAP reclaim" : "Opening range proximity",
          // });
        }

        // If in burst window, schedule a quick re-scan
        const until = this.burstUntil.get(symbol) ?? 0;
        if (until > now) {
          setTimeout(() => void this.scan(), burst);
        }
      } catch (_e) {
        // log and continue
      }
    }
  }
}
