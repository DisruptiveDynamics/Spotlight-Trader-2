export interface Rule {
  name: string;
  evaluate: (context: RuleContext) => RuleResult;
}

export interface RuleContext {
  symbol: string;
  timeframe: string;
  riskAmount?: number;
  setupQuality?: "A" | "B" | "C";
  regime?: string;
  breadth?: { advances: number; declines: number };
  accountSize?: number;
  currentPositions?: number;
}

export interface RuleResult {
  pass: boolean;
  reason?: string | undefined;
}

export interface CircuitBreaker {
  active: boolean;
  reason?: string;
  until?: number;
}

export class RulesSentinel {
  private version = "1.0.0";
  private rules: Rule[] = [];
  private circuitBreaker: CircuitBreaker = { active: false };
  private consecutiveLosses: number = 0;
  private dailyPnLR: number = 0;

  private readonly MAX_RISK_PER_TRADE = 0.02; // 2%
  private readonly MAX_DAILY_LOSS = 0.05; // 5%
  private readonly MAX_CONCURRENT_POSITIONS = 3;
  private readonly CONSECUTIVE_LOSS_LIMIT = 2;
  private readonly COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.initializeRules();
  }

  private initializeRules(): void {
    this.rules = [
      {
        name: "max_risk_per_trade",
        evaluate: (ctx) => {
          if (!ctx.riskAmount || !ctx.accountSize) {
            return { pass: true };
          }
          const riskPct = ctx.riskAmount / ctx.accountSize;
          return {
            pass: riskPct <= this.MAX_RISK_PER_TRADE,
            reason:
              riskPct > this.MAX_RISK_PER_TRADE
                ? `Risk ${(riskPct * 100).toFixed(1)}% exceeds max ${this.MAX_RISK_PER_TRADE * 100}%`
                : undefined,
          };
        },
      },
      {
        name: "daily_loss_limit",
        evaluate: (_ctx) => {
          return {
            pass: Math.abs(this.dailyPnLR) < this.MAX_DAILY_LOSS,
            reason:
              Math.abs(this.dailyPnLR) >= this.MAX_DAILY_LOSS
                ? `Daily loss ${(this.dailyPnLR * 100).toFixed(1)}% exceeds limit ${this.MAX_DAILY_LOSS * 100}%`
                : undefined,
          };
        },
      },
      {
        name: "concurrent_positions",
        evaluate: (ctx) => {
          const current = ctx.currentPositions || 0;
          return {
            pass: current < this.MAX_CONCURRENT_POSITIONS,
            reason:
              current >= this.MAX_CONCURRENT_POSITIONS
                ? `Already at max positions (${this.MAX_CONCURRENT_POSITIONS})`
                : undefined,
          };
        },
      },
      {
        name: "a_plus_criteria",
        evaluate: (ctx) => {
          if (ctx.setupQuality === "A") {
            const hasRegime = Boolean(
              ctx.regime && (ctx.regime === "trend-up" || ctx.regime === "trend-down"),
            );
            const hasBreadth = Boolean(ctx.breadth && ctx.breadth.advances > ctx.breadth.declines);
            const meetsAll = hasRegime && hasBreadth;

            return {
              pass: meetsAll,
              reason: !meetsAll ? `A+ requires trending regime and positive breadth` : undefined,
            };
          }
          return { pass: true, reason: undefined };
        },
      },
    ];
  }

  evaluate(context: RuleContext) {
    const results = this.rules.map((rule) => ({
      name: rule.name,
      ...rule.evaluate(context),
    }));

    const pass = results.every((r) => r.pass) && !this.circuitBreaker.active;

    return {
      pass,
      version: this.version,
      rules: results,
      circuitBreaker: this.circuitBreaker,
    };
  }

  recordTrade(realizedR: number): void {
    this.dailyPnLR += realizedR;

    if (realizedR < 0) {
      this.consecutiveLosses++;

      if (this.consecutiveLosses >= this.CONSECUTIVE_LOSS_LIMIT) {
        this.activateCircuitBreaker(
          `${this.consecutiveLosses} consecutive losses - cooling off`,
          this.COOLDOWN_MS,
        );
      }
    } else {
      this.consecutiveLosses = 0;
    }

    if (this.dailyPnLR <= -this.MAX_DAILY_LOSS) {
      this.activateCircuitBreaker(
        `Daily loss limit reached: ${(this.dailyPnLR * 100).toFixed(1)}%`,
        24 * 60 * 60 * 1000, // Rest of day
      );
    }
  }

  private activateCircuitBreaker(reason: string, durationMs: number): void {
    this.circuitBreaker = {
      active: true,
      reason,
      until: Date.now() + durationMs,
    };

    setTimeout(() => {
      this.circuitBreaker = { active: false };
      this.consecutiveLosses = 0;
    }, durationMs);
  }

  resetDaily(): void {
    this.dailyPnLR = 0;
    this.consecutiveLosses = 0;
    this.circuitBreaker = { active: false };
  }

  getVersion(): string {
    return this.version;
  }

  /**
   * [PHASE-8] Get current risk status for gating proactive callouts
   * GREEN: All clear, no restrictions
   * YELLOW: Some warnings, proceed with caution
   * RED: Circuit breaker active or critical failures, no callouts
   */
  getRiskStatus(): "GREEN" | "YELLOW" | "RED" {
    // RED: Circuit breaker active
    if (this.circuitBreaker.active) {
      return "RED";
    }

    // RED: At or near daily loss limit
    if (Math.abs(this.dailyPnLR) >= this.MAX_DAILY_LOSS * 0.9) {
      return "RED";
    }

    // YELLOW: Moderate daily loss (40-90% of limit)
    if (Math.abs(this.dailyPnLR) >= this.MAX_DAILY_LOSS * 0.4) {
      return "YELLOW";
    }

    // YELLOW: One consecutive loss (warning zone)
    if (this.consecutiveLosses >= 1) {
      return "YELLOW";
    }

    // GREEN: All clear
    return "GREEN";
  }
}

export const rulesSentinel = new RulesSentinel();
