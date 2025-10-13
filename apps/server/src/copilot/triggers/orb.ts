import { BaseTrigger, TriggerCondition, TriggerEvent } from "./base";
import { type Candle } from "@shared/indicators";
import { nanoid } from "nanoid";

export class OrbTrigger extends BaseTrigger {
  private sessionStartMs: number;
  private bars: Candle[] = [];
  private orbHigh: number = 0;
  private orbLow: number = 0;
  private orbEstablished: boolean = false;

  constructor(symbol: string, timeframe: string, sessionStartMs: number) {
    super(symbol, timeframe, "orb_breakout");
    this.sessionStartMs = sessionStartMs;
    this.requiredConfirmations = 1;
    this.cooldownMs = 300000; // 5 min cooldown
  }

  updateBars(bars: Candle[]): void {
    this.bars = bars;
    this.calculateOrb();
  }

  private calculateOrb(): void {
    const sessionBars = this.bars.filter((bar) => bar.t >= this.sessionStartMs);

    if (sessionBars.length < 2) {
      this.orbEstablished = false;
      return;
    }

    const firstTwoBars = sessionBars.slice(0, 2);
    this.orbHigh = Math.max(...firstTwoBars.map((b) => b.ohlcv.h));
    this.orbLow = Math.min(...firstTwoBars.map((b) => b.ohlcv.l));
    this.orbEstablished = true;
  }

  checkConditions(): TriggerCondition[] {
    if (!this.orbEstablished || this.bars.length < 3) {
      return [{ name: "orb_not_established", evaluate: () => false }];
    }

    const lastBar = this.bars[this.bars.length - 1];
    const sessionBars = this.bars.filter((bar) => bar.t >= this.sessionStartMs);

    const avgVolume =
      sessionBars.slice(0, -1).reduce((sum, b) => sum + b.ohlcv.v, 0) /
      Math.max(sessionBars.length - 1, 1);

    const condition1: TriggerCondition = {
      name: "price_breaks_orb_high",
      evaluate: () => {
        return !!lastBar && lastBar.ohlcv.c > this.orbHigh;
      },
    };

    const condition2: TriggerCondition = {
      name: "volume_surge",
      evaluate: () => {
        return !!lastBar && lastBar.ohlcv.v > avgVolume * 2;
      },
    };

    const condition3: TriggerCondition = {
      name: "clean_break",
      evaluate: () => {
        return !!lastBar && lastBar.ohlcv.l > this.orbHigh * 0.999;
      },
    };

    return [condition1, condition2, condition3];
  }

  createEvent(): TriggerEvent {
    const lastBar = this.bars[this.bars.length - 1];
    const orbRange = this.orbHigh - this.orbLow;

    return {
      triggerId: nanoid(),
      symbol: this.symbol,
      timeframe: this.timeframe,
      setup: this.setup,
      entryZone: {
        low: this.orbHigh,
        high: this.orbHigh + orbRange * 0.1,
      },
      stop: this.orbLow,
      confidence: 0.75,
      timestamp: lastBar?.t || Date.now(),
    };
  }

  getOrbLevels(): { high: number; low: number; established: boolean } {
    return {
      high: this.orbHigh,
      low: this.orbLow,
      established: this.orbEstablished,
    };
  }
}
