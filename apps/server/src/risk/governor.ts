import type { EvaluatedRule, Signal } from "@shared/types/rules";

interface ActiveSignal {
  ruleId: string;
  symbol: string;
  direction: "long" | "short" | "flat";
  barSeq: number;
  timestamp: number;
}

export interface RiskGovernorConfig {
  maxConcurrentSignals: number;
  maxRiskBudget: number;
  throttleWindowMs: number;
}

export class RiskGovernor {
  private activeSignals = new Map<string, ActiveSignal>();
  private recentEvaluations = new Map<string, number>();
  private config: RiskGovernorConfig;

  constructor(config?: Partial<RiskGovernorConfig>) {
    this.config = {
      maxConcurrentSignals: config?.maxConcurrentSignals ?? 5,
      maxRiskBudget: config?.maxRiskBudget ?? 0.1,
      throttleWindowMs: config?.throttleWindowMs ?? 60000,
    };
  }

  shouldTrigger(ruleEval: EvaluatedRule): boolean {
    if (!ruleEval.passed) {
      return false;
    }

    const throttleKey = `${ruleEval.id}:${ruleEval.barSeq}`;
    if (this.recentEvaluations.has(throttleKey)) {
      return false;
    }

    if (this.activeSignals.size >= this.config.maxConcurrentSignals) {
      console.warn(
        `RiskGovernor: Max concurrent signals (${this.config.maxConcurrentSignals}) reached`,
      );
      return false;
    }

    if (this.isRiskBudgetExceeded()) {
      console.warn(
        `RiskGovernor: Risk budget exceeded (${this.getCurrentRiskExposure().toFixed(2)})`,
      );
      return false;
    }

    this.recentEvaluations.set(throttleKey, Date.now());
    this.cleanupThrottleCache();

    return true;
  }

  registerSignal(signal: Signal, barSeq: number): void {
    const key = `${signal.ruleId}:${signal.symbol}`;

    this.activeSignals.set(key, {
      ruleId: signal.ruleId,
      symbol: signal.symbol,
      direction: signal.direction,
      barSeq,
      timestamp: signal.ts.getTime(),
    });
  }

  releaseSignal(ruleId: string, symbol?: string): void {
    if (symbol) {
      const key = `${ruleId}:${symbol}`;
      this.activeSignals.delete(key);
    } else {
      for (const [key, signal] of this.activeSignals.entries()) {
        if (signal.ruleId === ruleId) {
          this.activeSignals.delete(key);
        }
      }
    }
  }

  getActiveSignals(): ActiveSignal[] {
    return Array.from(this.activeSignals.values());
  }

  getCurrentRiskExposure(): number {
    return this.activeSignals.size / this.config.maxConcurrentSignals;
  }

  isRiskBudgetExceeded(): boolean {
    return this.getCurrentRiskExposure() >= this.config.maxRiskBudget;
  }

  private cleanupThrottleCache(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.recentEvaluations.entries()) {
      if (now - timestamp > this.config.throttleWindowMs) {
        this.recentEvaluations.delete(key);
      }
    }
  }

  reset(): void {
    this.activeSignals.clear();
    this.recentEvaluations.clear();
  }
}

export const riskGovernor = new RiskGovernor();
