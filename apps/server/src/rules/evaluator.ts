import { create, all, type ConfigOptions, type EvalFunction } from "mathjs";
import type { Rule, EvaluatedRule, RuleContext } from "@shared/types/rules";

const ALLOWED_FUNCTIONS = new Set(["abs", "max", "min", "mean", "sqrt", "pow", "log", "exp"]);

const ALLOWED_OPERATORS = new Set([
  "+",
  "-",
  "*",
  "/",
  ">",
  "<",
  ">=",
  "<=",
  "==",
  "!=",
  "&&",
  "||",
  "!",
  "(",
  ")",
  ",",
]);

const ALLOWED_SCOPE_VARS = new Set([
  "open",
  "high",
  "low",
  "close",
  "volume",
  "vwap",
  "ema20",
  "ema50",
  "ema200",
  "sma20",
  "sma50",
  "rsi",
  "atr",
]);

const mathConfig: ConfigOptions = {
  epsilon: 1e-12,
  matrix: "Matrix",
  number: "number",
  precision: 64,
  predictable: false,
  randomSeed: null,
};

const math = create(all ?? {}, mathConfig);

function validateExpression(expr: string, allowedParams: Set<string> = new Set()): void {
  const tokenRegex = /[a-zA-Z_]\w*|\d+\.?\d*|>=|<=|==|!=|&&|\|\||[+\-*/><!(),]/g;
  const tokens = expr.match(tokenRegex) || [];

  for (const token of tokens) {
    if (/^\d+\.?\d*$/.test(token)) continue;
    if (ALLOWED_OPERATORS.has(token)) continue;
    if (ALLOWED_FUNCTIONS.has(token)) continue;
    if (ALLOWED_SCOPE_VARS.has(token)) continue;
    if (allowedParams.has(token)) continue;

    if (/^[a-zA-Z_]\w*$/.test(token)) {
      throw new Error(`Disallowed identifier in expression: ${token}`);
    }

    throw new Error(`Invalid token in expression: ${token}`);
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function calculateConfidence(value: number, threshold: number): number {
  const distance = Math.abs(value - threshold);
  const normalized = distance / Math.max(Math.abs(threshold), 1);
  return sigmoid(normalized * 2);
}

export class RuleEvaluator {
  private compiledCache = new Map<string, EvalFunction>();

  compile(rule: Rule): EvalFunction {
    const cacheKey = `${rule.id}:${rule.version}`;

    if (this.compiledCache.has(cacheKey)) {
      return this.compiledCache.get(cacheKey)!;
    }

    try {
      const allowedParams = new Set(Object.keys(rule.parameters || {}));
      validateExpression(rule.expression, allowedParams);
      const compiled = math.compile(rule.expression);
      this.compiledCache.set(cacheKey, compiled);
      return compiled;
    } catch (error) {
      throw new Error(
        `Failed to compile rule ${rule.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  evaluate(rule: Rule, context: RuleContext, barSeq: number): EvaluatedRule {
    const compiled = this.compile(rule);

    try {
      const scope = { ...context, ...rule.parameters };
      const result = compiled.evaluate(scope);

      const passed = Boolean(result);
      const confidence = this.calculateRuleConfidence(rule, context);
      const signal = this.determineSignal(rule, context);

      const evaluatedRule: EvaluatedRule = {
        id: rule.id,
        name: rule.name,
        passed,
        confidence,
        barSeq,
        timestamp: Date.now(),
      };

      if (signal) {
        evaluatedRule.signal = signal;
      }

      return evaluatedRule;
    } catch (error) {
      console.error(`Rule evaluation error for ${rule.id}:`, error);
      return {
        id: rule.id,
        name: rule.name,
        passed: false,
        confidence: 0,
        barSeq,
        timestamp: Date.now(),
      };
    }
  }

  private calculateRuleConfidence(rule: Rule, context: RuleContext): number {
    if (rule.expression.includes(">")) {
      const parts = rule.expression.split(">").map((s) => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        const leftValue = this.evaluateSimpleExpression(parts[0], context);
        const rightValue = this.evaluateSimpleExpression(parts[1], context);
        if (leftValue !== null && rightValue !== null) {
          return calculateConfidence(leftValue, rightValue);
        }
      }
    }

    if (rule.expression.includes("<")) {
      const parts = rule.expression.split("<").map((s) => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        const leftValue = this.evaluateSimpleExpression(parts[0], context);
        const rightValue = this.evaluateSimpleExpression(parts[1], context);
        if (leftValue !== null && rightValue !== null) {
          return calculateConfidence(leftValue, rightValue);
        }
      }
    }

    return 0.5;
  }

  private evaluateSimpleExpression(expr: string, context: RuleContext): number | null {
    if (context[expr] !== undefined) {
      return context[expr] ?? null;
    }

    const numValue = parseFloat(expr);
    if (!isNaN(numValue)) {
      return numValue;
    }

    return null;
  }

  private determineSignal(rule: Rule, context: RuleContext): "long" | "short" | "flat" | undefined {
    const expr = rule.expression.toLowerCase();

    if (expr.includes("long") || (expr.includes(">") && context.close)) {
      return "long";
    }

    if (expr.includes("short") || (expr.includes("<") && context.close)) {
      return "short";
    }

    return undefined;
  }

  invalidateCache(ruleId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.compiledCache.keys()) {
      if (key.startsWith(`${ruleId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.compiledCache.delete(key));
  }

  clearCache(): void {
    this.compiledCache.clear();
  }
}

export const ruleEvaluator = new RuleEvaluator();
