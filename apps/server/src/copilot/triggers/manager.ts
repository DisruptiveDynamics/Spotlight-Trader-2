import { telemetryBus } from "../../telemetry/bus";
// TODO: Integrate copilotBroadcaster for trigger notifications
// import { copilotBroadcaster } from "../broadcaster";
import { VwapReclaimTrigger, VwapRejectTrigger } from "./vwapReclaim";
import { OrbTrigger } from "./orb";
import { EmaPullbackTrigger } from "./emaPullback";
import { ringBuffer } from "@server/cache/ring";
import type { Bar } from "@server/market/eventBus";
import type { Candle } from "@shared/indicators";
import { proposeCallout } from "../tools/handlers";
import type { TelemetryEvent } from "../../telemetry/types";

interface TriggerSet {
  vwapReclaim: VwapReclaimTrigger;
  vwapReject: VwapRejectTrigger;
  orb: OrbTrigger;
  emaPullback: EmaPullbackTrigger;
}

class TriggerManager {
  private triggers = new Map<string, TriggerSet>();
  private sessionStartMs: number = 0;
  private eventListener: ((event: TelemetryEvent) => Promise<void>) | null = null;
  private calloutCache = new Set<string>();

  initialize(sessionStartMs: number): void {
    this.sessionStartMs = sessionStartMs;

    this.eventListener = async (event: TelemetryEvent) => {
      if (event.type === "bar:new" && event.data) {
        const barData = event.data as { bar?: Bar };
        if (barData.bar) {
          await this.processNewBar(event.symbol, barData.bar);
        }
      }
    };

    telemetryBus.on("event", this.eventListener);

    console.log("✅ Trigger manager initialized");
  }

  dispose(): void {
    if (this.eventListener) {
      telemetryBus.off("event", this.eventListener);
      this.eventListener = null;
    }
    this.triggers.clear();
    this.calloutCache.clear();
    console.log("✅ Trigger manager disposed");
  }

  private ensureTriggers(symbol: string): TriggerSet {
    if (!this.triggers.has(symbol)) {
      this.triggers.set(symbol, {
        vwapReclaim: new VwapReclaimTrigger(symbol, "1m", this.sessionStartMs),
        vwapReject: new VwapRejectTrigger(symbol, "1m", this.sessionStartMs),
        orb: new OrbTrigger(symbol, "1m", this.sessionStartMs),
        emaPullback: new EmaPullbackTrigger(symbol, "1m"),
      });
    }

    return this.triggers.get(symbol)!;
  }

  private barToCandle(bar: any): Candle {
    if (bar.ohlcv) {
      return {
        t: bar.bar_start,
        ohlcv: bar.ohlcv,
      };
    }
    return {
      t: bar.bar_start,
      ohlcv: {
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume,
      },
    };
  }

  private async processNewBar(symbol: string, _bar: Bar): Promise<void> {
    const triggers = this.ensureTriggers(symbol);

    const recentBars = ringBuffer.getRecent(symbol, 30);
    const candles = recentBars.map((b) => this.barToCandle(b));

    triggers.vwapReclaim.updateBars(candles);
    triggers.vwapReject.updateBars(candles);
    triggers.orb.updateBars(candles);
    triggers.emaPullback.updateBars(candles);

    const vwapReclaimEvent = triggers.vwapReclaim.fire();
    if (vwapReclaimEvent) {
      await this.fireCallout(vwapReclaimEvent, "VWAP reclaim confirmed with volume");
    }

    const vwapRejectEvent = triggers.vwapReject.fire();
    if (vwapRejectEvent) {
      await this.fireCallout(vwapRejectEvent, "VWAP reject confirmed with volume");
    }

    const orbEvent = triggers.orb.fire();
    if (orbEvent) {
      const levels = triggers.orb.getOrbLevels();
      await this.fireCallout(orbEvent, `Opening range breakout at $${levels.high.toFixed(2)}`);
    }

    const emaPullbackEvent = triggers.emaPullback.fire();
    if (emaPullbackEvent) {
      await this.fireCallout(
        emaPullbackEvent,
        "9/20 EMA pullback in uptrend with shrinking volume",
      );
    }
  }

  private async fireCallout(
    event: {
      symbol: string;
      setup: string;
      confidence: number;
      entryZone: { low: number; high: number };
    },
    rationale: string,
  ): Promise<void> {
    const calloutKey = `${event.symbol}:${event.setup}:${Date.now()}`;

    if (this.calloutCache.has(calloutKey)) {
      return;
    }

    this.calloutCache.add(calloutKey);

    setTimeout(() => {
      this.calloutCache.delete(calloutKey);
    }, 60000);

    const urgency = event.confidence > 0.75 ? "now" : "soon";
    const qualityGrade = event.confidence > 0.75 ? "A" : event.confidence > 0.65 ? "B" : "C";

    await proposeCallout({
      kind: "entry",
      context: {
        symbol: event.symbol,
        timeframe: "1m",
        setupTag: event.setup,
        rationale,
        qualityGrade,
        urgency,
      },
    });
  }

  reset(symbol?: string): void {
    if (symbol) {
      this.triggers.delete(symbol);
    } else {
      this.triggers.clear();
      this.calloutCache.clear();
    }
  }
}

export const triggerManager = new TriggerManager();
