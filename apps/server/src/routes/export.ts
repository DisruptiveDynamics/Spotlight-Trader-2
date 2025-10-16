import { eq } from "drizzle-orm";
import { Router } from "express";

import { db } from "../db/index.js";
import { userRules, userRuleVersions, coachMemories, coachProfiles } from "../db/schema.js";
import { requireUser, AuthRequest } from "../middleware/requireUser.js";

const router: Router = Router();

router.get("/all", requireUser, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;

    const rules = await db.select().from(userRules).where(eq(userRules.userId, userId));

    const ruleVersions = await db
      .select()
      .from(userRuleVersions)
      .where(eq(userRuleVersions.userRuleId, rules.map((r) => r.id)[0] || ""));

    const memories = await db.select().from(coachMemories).where(eq(coachMemories.userId, userId));

    const profiles = await db.select().from(coachProfiles).where(eq(coachProfiles.userId, userId));

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      rules: rules.map((rule) => ({
        id: rule.id,
        baseRuleId: rule.baseRuleId,
        versions: ruleVersions.filter((v) => v.userRuleId === rule.id),
      })),
      memories: memories.map((m) => ({
        id: m.id,
        kind: m.kind,
        text: m.text,
        tags: m.tags,
        createdAt: m.createdAt,
      })),
      coachProfile: profiles[0] || null,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="spotlight-export-${Date.now()}.json"`,
    );
    res.json(exportData);
  } catch (error) {
    console.error("Export failed:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

export default router;
