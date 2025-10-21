import type { Rule } from "@shared/types/rules";
import { eq, and } from "drizzle-orm";

import { ruleEvaluator } from "./evaluator";
import { db } from "../db";
import { rules, ruleVersions, userRules, userRuleVersions } from "../db/schema";

export class RuleRegistry {
  private activeRulesCache = new Map<string, Rule[]>();

  async getActiveRules(userId: string): Promise<Rule[]> {
    const cached = this.activeRulesCache.get(userId);
    if (cached) {
      return cached;
    }

    const userRulesList = await db
      .select({
        id: userRules.id,
        baseRuleId: userRules.baseRuleId,
        version: userRuleVersions.version,
        doc: userRuleVersions.doc,
      })
      .from(userRules)
      .leftJoin(userRuleVersions, eq(userRules.id, userRuleVersions.userRuleId))
      .where(eq(userRules.userId, userId));

    const activeRules: Rule[] = userRulesList.filter((r) => r.doc).map((r) => r.doc as Rule);

    this.activeRulesCache.set(userId, activeRules);
    return activeRules;
  }

  async createRule(userId: string, rule: Omit<Rule, "id" | "createdAt">): Promise<Rule> {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const versionId = `rv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const userRuleId = `ur_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const userVersionId = `urv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const newRule: Rule = {
      ...rule,
      id: ruleId,
      createdAt: Date.now(),
    };

    await db.transaction(async (tx) => {
      await tx.insert(rules).values({
        id: ruleId,
        latestVersion: versionId,
        ownerUserId: userId,
      });

      await tx.insert(ruleVersions).values({
        id: versionId,
        ruleId,
        version: `${rule.version}`,
        doc: newRule as unknown as Record<string, unknown>,
      });

      await tx.insert(userRules).values({
        id: userRuleId,
        userId,
        baseRuleId: ruleId,
      });

      await tx.insert(userRuleVersions).values({
        id: userVersionId,
        userRuleId,
        version: `${rule.version}`,
        doc: newRule as unknown as Record<string, unknown>,
      });
    });

    this.invalidateUserCache(userId);
    return newRule;
  }

  async updateRule(
    ruleId: string,
    userId: string,
    updates: Partial<Omit<Rule, "id" | "createdAt">>,
  ): Promise<Rule> {
    const existingRules = await this.getActiveRules(userId);
    const existing = existingRules.find((r) => r.id === ruleId);

    if (!existing) {
      throw new Error(`Rule ${ruleId} not found for user ${userId}`);
    }

    const updatedRule: Rule = {
      ...existing,
      ...updates,
      version: (existing.version || 0) + 1,
      updatedAt: Date.now(),
    };

    const newVersionId = `rv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const userVersionId = `urv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const userRuleRecord = await db
      .select()
      .from(userRules)
      .where(and(eq(userRules.userId, userId), eq(userRules.baseRuleId, ruleId)))
      .limit(1);

    if (userRuleRecord.length === 0) {
      throw new Error(`User rule not found for ${ruleId}`);
    }

    const userRule = userRuleRecord[0];
    if (!userRule) {
      throw new Error(`User rule not found for ${ruleId}`);
    }

    await db.transaction(async (tx) => {
      await tx.insert(ruleVersions).values({
        id: newVersionId,
        ruleId,
        version: `${updatedRule.version}`,
        doc: updatedRule as unknown as Record<string, unknown>,
      });

      await tx.update(rules).set({ latestVersion: newVersionId }).where(eq(rules.id, ruleId));

      await tx.insert(userRuleVersions).values({
        id: userVersionId,
        userRuleId: userRule.id,
        version: `${updatedRule.version}`,
        doc: updatedRule as unknown as Record<string, unknown>,
      });
    });

    ruleEvaluator.invalidateCache(ruleId);
    this.invalidateUserCache(userId);

    return updatedRule;
  }

  async deleteRule(ruleId: string, userId: string): Promise<void> {
    await db
      .delete(userRules)
      .where(and(eq(userRules.userId, userId), eq(userRules.baseRuleId, ruleId)));

    ruleEvaluator.invalidateCache(ruleId);
    this.invalidateUserCache(userId);
  }

  invalidateUserCache(userId: string): void {
    this.activeRulesCache.delete(userId);
  }

  clearCache(): void {
    this.activeRulesCache.clear();
  }
}

export const ruleRegistry = new RuleRegistry();
