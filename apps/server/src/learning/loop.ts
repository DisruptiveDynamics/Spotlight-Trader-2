/**
 * Continuous learning loop for rules
 * Listens to feedback and maintains per-rule rolling metrics
 */

import { eq, and, gte, sql } from "drizzle-orm";

import { db } from "../db";
import { feedback, ruleMetricsDaily } from "../db/schema";
import { eventBus } from "../market/eventBus";


interface RuleMetrics {
  ruleId: string;
  fired7d: number;
  actionable7d: number;
  good7d: number;
  bad7d: number;
  fired30d: number;
  actionable30d: number;
  good30d: number;
  bad30d: number;
  lastUpdated: Date;
}

// In-memory cache of rule metrics
const metricsCache = new Map<string, RuleMetrics>();

/**
 * Initialize the learning loop
 */
export function initializeLearningLoop() {
  // Listen to signal:new events to open feedback slots
  eventBus.on("signal:new", (signal) => {
    console.log(`📊 Feedback slot opened for signal: ${signal.id} (rule: ${signal.ruleId})`);
    // The slot is implicitly "open" - user can POST feedback at any time
  });

  console.log("✅ Learning loop initialized");
}

export interface FeedbackInput {
  userId: string;
  symbol: string;
  seq: number;
  ruleId: string;
  label: "good" | "bad" | "missed" | "late";
  notes?: string | null;
}

/**
 * Save feedback and update aggregates
 */
export async function saveFeedback(input: FeedbackInput): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;

  // Save feedback
  await db.insert(feedback).values({
    userId: input.userId,
    symbol: input.symbol,
    seq: input.seq,
    ruleId: input.ruleId,
    label: input.label,
    notes: input.notes || null,
  });

  // Update or insert daily metrics
  const existing = await db
    .select()
    .from(ruleMetricsDaily)
    .where(
      and(
        eq(ruleMetricsDaily.userId, input.userId),
        eq(ruleMetricsDaily.ruleId, input.ruleId),
        eq(ruleMetricsDaily.day, today),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing record
    const updates: any = {
      fired: sql`${ruleMetricsDaily.fired} + 1`,
    };

    if (input.label === "good") {
      updates.good = sql`${ruleMetricsDaily.good} + 1`;
      updates.actionable = sql`${ruleMetricsDaily.actionable} + 1`;
    } else if (input.label === "bad") {
      updates.bad = sql`${ruleMetricsDaily.bad} + 1`;
      updates.actionable = sql`${ruleMetricsDaily.actionable} + 1`;
    }

    await db
      .update(ruleMetricsDaily)
      .set(updates)
      .where(
        and(
          eq(ruleMetricsDaily.userId, input.userId),
          eq(ruleMetricsDaily.ruleId, input.ruleId),
          eq(ruleMetricsDaily.day, today),
        ),
      );
  } else {
    // Insert new record
    await db.insert(ruleMetricsDaily).values({
      userId: input.userId,
      ruleId: input.ruleId,
      day: today,
      fired: 1,
      actionable: input.label === "good" || input.label === "bad" ? 1 : 0,
      good: input.label === "good" ? 1 : 0,
      bad: input.label === "bad" ? 1 : 0,
      expectancy: null,
    });
  }

  // Invalidate cache for this rule
  const cacheKey = `${input.userId}:${input.ruleId}`;
  metricsCache.delete(cacheKey);

  console.log(`📊 Feedback saved: ${input.label} for rule ${input.ruleId}`);
}

/**
 * Get rule score in range [-1, +1]
 * Positive score = good performance, negative = poor performance
 */
export async function getRuleScore(userId: string, ruleId: string): Promise<number> {
  const cacheKey = `${userId}:${ruleId}`;

  // Check cache first
  const cached = metricsCache.get(cacheKey);
  if (cached && Date.now() - cached.lastUpdated.getTime() < 60000) {
    // Cache valid for 1 minute
    return calculateScore(cached);
  }

  // Fetch from DB
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [metrics7d, metrics30d] = await Promise.all([
    db
      .select({
        fired: sql<number>`SUM(${ruleMetricsDaily.fired})::int`,
        actionable: sql<number>`SUM(${ruleMetricsDaily.actionable})::int`,
        good: sql<number>`SUM(${ruleMetricsDaily.good})::int`,
        bad: sql<number>`SUM(${ruleMetricsDaily.bad})::int`,
      })
      .from(ruleMetricsDaily)
      .where(
        and(
          eq(ruleMetricsDaily.userId, userId),
          eq(ruleMetricsDaily.ruleId, ruleId),
          gte(ruleMetricsDaily.day, sevenDaysAgo.toISOString().split("T")[0]!),
        ),
      ),
    db
      .select({
        fired: sql<number>`SUM(${ruleMetricsDaily.fired})::int`,
        actionable: sql<number>`SUM(${ruleMetricsDaily.actionable})::int`,
        good: sql<number>`SUM(${ruleMetricsDaily.good})::int`,
        bad: sql<number>`SUM(${ruleMetricsDaily.bad})::int`,
      })
      .from(ruleMetricsDaily)
      .where(
        and(
          eq(ruleMetricsDaily.userId, userId),
          eq(ruleMetricsDaily.ruleId, ruleId),
          gte(ruleMetricsDaily.day, thirtyDaysAgo.toISOString().split("T")[0]!),
        ),
      ),
  ]);

  const metrics: RuleMetrics = {
    ruleId,
    fired7d: metrics7d[0]?.fired || 0,
    actionable7d: metrics7d[0]?.actionable || 0,
    good7d: metrics7d[0]?.good || 0,
    bad7d: metrics7d[0]?.bad || 0,
    fired30d: metrics30d[0]?.fired || 0,
    actionable30d: metrics30d[0]?.actionable || 0,
    good30d: metrics30d[0]?.good || 0,
    bad30d: metrics30d[0]?.bad || 0,
    lastUpdated: new Date(),
  };

  metricsCache.set(cacheKey, metrics);

  return calculateScore(metrics);
}

/**
 * Calculate score from metrics
 * Score = (good - bad) / total_actionable, clamped to [-1, +1]
 * Weighted: 70% recent (7d), 30% historical (30d)
 */
function calculateScore(metrics: RuleMetrics): number {
  const score7d =
    metrics.actionable7d > 0 ? (metrics.good7d - metrics.bad7d) / metrics.actionable7d : 0;

  const score30d =
    metrics.actionable30d > 0 ? (metrics.good30d - metrics.bad30d) / metrics.actionable30d : 0;

  const weightedScore = score7d * 0.7 + score30d * 0.3;

  return Math.max(-1, Math.min(1, weightedScore));
}

/**
 * Get aggregated metrics for a rule
 */
export async function getRuleMetrics(
  userId: string,
  ruleId: string,
): Promise<{
  fired7d: number;
  actionable7d: number;
  good7d: number;
  bad7d: number;
  fired30d: number;
  actionable30d: number;
  good30d: number;
  bad30d: number;
  score: number;
}> {
  const cacheKey = `${userId}:${ruleId}`;
  const cached = metricsCache.get(cacheKey);

  if (cached && Date.now() - cached.lastUpdated.getTime() < 60000) {
    return {
      ...cached,
      score: calculateScore(cached),
    };
  }

  // Refresh cache
  const score = await getRuleScore(userId, ruleId);
  const metrics = metricsCache.get(cacheKey)!;

  return {
    ...metrics,
    score,
  };
}
