import { eventBus } from "../market/eventBus";
import type { EvaluatedRule, Signal } from "@shared/types/rules";
import { riskGovernor } from "../risk/governor";
import { db } from "../db";
import { signals } from "../db/schema";

export class SignalsService {
  start(): void {
    eventBus.on("rule:evaluated", this.handleRuleEvaluation.bind(this));
  }

  private async handleRuleEvaluation(ruleEval: EvaluatedRule): Promise<void> {
    if (!ruleEval.passed) {
      return;
    }

    if (!riskGovernor.shouldTrigger(ruleEval)) {
      console.log(
        `Signal throttled or risk limit reached for rule ${ruleEval.id} at seq ${ruleEval.barSeq}`,
      );
      return;
    }

    const signal: Signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId: "demo-user",
      symbol: "SPY",
      timeframe: "1m",
      ruleId: ruleEval.id,
      ruleVersion: "1",
      direction: ruleEval.signal ?? "flat",
      confidence: ruleEval.confidence,
      ctx: {
        barSeq: ruleEval.barSeq,
        timestamp: ruleEval.timestamp,
      },
      ts: new Date(ruleEval.timestamp),
    };

    try {
      await db.insert(signals).values({
        id: signal.id,
        userId: signal.userId,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        ruleId: signal.ruleId,
        ruleVersion: signal.ruleVersion,
        confidence: signal.confidence,
        ctx: signal.ctx as Record<string, unknown>,
        ts: signal.ts,
      });

      riskGovernor.registerSignal(signal, ruleEval.barSeq);
      eventBus.emit("signal:new", signal);

      console.log(
        `Signal created: ${signal.id} for rule ${signal.ruleId} (${signal.direction}, confidence: ${signal.confidence.toFixed(2)})`,
      );
    } catch (error) {
      console.error("Failed to create signal:", error);
    }
  }

  stop(): void {
    eventBus.off("rule:evaluated", this.handleRuleEvaluation.bind(this));
  }
}

export const signalsService = new SignalsService();
