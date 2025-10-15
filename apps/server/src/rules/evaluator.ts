import type { Rule, EvaluatedRule, RuleContext } from "@shared/types/rules";
import { create, all, type ConfigOptions, type EvalFunction } from "mathjs";

/**
 * Enhancements:
 * - Normalizes human-friendly DSL before validation/compile:
 *   • "price between A..B" → (price >= A && price <= B)
 *   • "5%" → 0.05
 *   • Numeric underscores/commas allowed: 1_000, 1,000
 * - Keeps your mathjs pipeline and types unchanged.
 */

const ALLOWED_FUNCTIONS = new Set(["abs", "max", "min", "mean", "sqrt", "pow", "log", "exp"]);

const ALLOWED_OPERATORS = new Set([
  "+", "-", "*", "/", ">", "<", ">=", "<=", "==", "!=", "&&", "||", "!", "(", ")", ",",
]);

const ALLOWED_SCOPE_VARS = new Set([
  "open", "high", "low", "close", "volume", "vwap",
  "ema20", "ema50", "ema200", "sma20", "sma50", "rsi", "atr",
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

function stripNumDecorators(n: string) {
  return n.replace(/[_ ,]/g, "");
}

function normalizeExpression(input: string): string {
  let expr = (input ?? "").trim();

  // Lowercase common identifiers to avoid case sensitivity issues
  expr = expr.replace(/\b(PRICE|CLOSE|OPEN|HIGH|LOW|VOLUME|VWAP)\b/gi, (m) => m.toLowerCase());

  // "price between A..B" → (price >= A && price <= B)
  expr = expr.replace(
    /\b(price|close|open|high|low|volume|vwap)\s+between\s+([0-9][0-9_,.]*%?)\s*\.\.\s*([0-9][0-9_,.]*%?)/gi,
    (_m, ident, a, b) => {
      const A = String(a).endsWith("%") ? String(Number(stripNumDecorators(a)) / 100) : stripNumDecorators(a);
      const B = String(b).endsWith("%") ? String(Number(stripNumDecorators(b)) / 100) : stripNumDecorators(b);
      return `(${ident} >= ${A} && ${ident} <= ${B})`;
    }
  );

  // Convert percent literals "5%" → 0.05
  expr = expr.replace(/([0-9][0-9_,.]*)%/g, (_m, n) => String(Number(stripNumDecorators(n)) / 100));

  // Remove numeric underscores/commas in plain number tokens
  expr = expr.replace(/\b([0-9][0-9_,.]*)\b/g, (m) => stripNumDecorators(m));

  // Basic sanity: no forbidden chars after normalization
  if (/[^0-9a-zA-Z_\s.+\-*/%<>=!&|(),]/.test(expr)) {
    throw new Error(`Unsupported character in expression after normalization: ${expr}`);
  }
  if (/[+\-*/%<>=!&|,]$/.test(expr)) {
    throw new Error(`Expression appears to end with an operator: "${expr}"`);
  }
  return expr;
}

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
    const cacheKey = `${rule.id}:${(rule as any).version ?? ""}`;

    if (this.compiledCache.has(cacheKey)) {
      return this.compiledCache.get(cacheKey)!;
    }

    try {
      const allowedParams = new Set(Object.keys((rule as any).parameters || {}));
      const normalized = normalizeExpression((rule as any).expression);
      validateExpression(normalized, allowedParams);
      const compiled = math.compile(normalized);
      this.compiledCache.set(cacheKey, compiled);
      return compiled;
    } catch (error) {
      throw new Error(
        `Failed to compile rule ${rule.id}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  evaluate(rule: Rule, context: RuleContext, barSeq: number): EvaluatedRule {
    const compiled = this.compile(rule);

    try {
      const scope = { ...context, ...(rule as any).parameters };
      const result = compiled.evaluate(scope);

      const passed = Boolean(result);
      const confidence = this.calculateRuleConfidence((rule as any), context);
      const signal = this.determineSignal((rule as any), context);

      const evaluatedRule: EvaluatedRule = {
        id: rule.id,
        name: (rule as any).name,
        passed,
        confidence,
        barSeq,
        timestamp: Date.now(),
      };

      if (signal) evaluatedRule.signal = signal;
      return evaluatedRule;
    } catch (error) {
      console.error(`Rule evaluation error for ${rule.id}:`, error);
      return {
        id: rule.id,
        name: (rule as any).name,
        passed: false,
        confidence: 0,
        barSeq,
        timestamp: Date.now(),
      };
    }
  }

  private calculateRuleConfidence(rule: any, context: RuleContext): number {
    if (rule.expression?.includes(">")) {
      const parts = rule.expression.split(">").map((s: string) => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        const leftValue = this.evaluateSimpleExpression(parts[0], context);
        const rightValue = this.evaluateSimpleExpression(parts[1], context);
        if (leftValue !== null && rightValue !== null) {
          return calculateConfidence(leftValue, rightValue);
        }
      }
    }

    if (rule.expression?.includes("<")) {
      const parts = rule.expression.split("<").map((s: string) => s.trim());
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
    if ((context as any)[expr] !== undefined) return (context as any)[expr] ?? null;
    const numValue = parseFloat(expr);
    if (!isNaN(numValue)) return numValue;
    return null;
  }

  private determineSignal(rule: any, context: RuleContext): "long" | "short" | "flat" | undefined {
    const expr = String(rule.expression || "").toLowerCase();
    if (expr.includes("long") || (expr.includes(">") && (context as any).close)) return "long";
    if (expr.includes("short") || (expr.includes("<") && (context as any).close)) return "short";
    return undefined;
  }
}
export const ruleEvaluator = new RuleEvaluator();
