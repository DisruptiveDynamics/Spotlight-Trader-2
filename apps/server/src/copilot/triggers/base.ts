export type TriggerState = "idle" | "primed" | "fired" | "cooldown";

export interface TriggerCondition {
  name: string;
  evaluate: () => boolean;
}

export interface TriggerEvent {
  triggerId: string;
  symbol: string;
  timeframe: string;
  setup: string;
  entryZone: { low: number; high: number };
  stop: number;
  confidence: number;
  timestamp: number;
}

export abstract class BaseTrigger {
  protected state: TriggerState = "idle";
  protected lastFiredAt: number = 0;
  protected cooldownMs: number = 30000; // 30 seconds default
  protected hysteresisCount: number = 0;
  protected requiredConfirmations: number = 2;

  constructor(
    protected symbol: string,
    protected timeframe: string,
    protected setup: string,
  ) {}

  abstract checkConditions(): TriggerCondition[];

  canFire(): boolean {
    const now = Date.now();
    const inCooldown = now - this.lastFiredAt < this.cooldownMs;

    if (inCooldown) {
      this.state = "cooldown";
      return false;
    }

    const conditions = this.checkConditions();
    const allMet = conditions.every((c) => c.evaluate());

    if (allMet) {
      this.hysteresisCount++;

      if (this.hysteresisCount >= this.requiredConfirmations) {
        this.state = "primed";
        return true;
      } else {
        this.state = "primed";
        return false;
      }
    } else {
      this.hysteresisCount = 0;
      this.state = "idle";
      return false;
    }
  }

  fire(): TriggerEvent | null {
    if (!this.canFire()) {
      return null;
    }

    this.state = "fired";
    this.lastFiredAt = Date.now();
    this.hysteresisCount = 0;

    return this.createEvent();
  }

  abstract createEvent(): TriggerEvent;

  reset(): void {
    this.state = "idle";
    this.hysteresisCount = 0;
  }

  getState(): TriggerState {
    return this.state;
  }
}
