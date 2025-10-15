import type { Rule, RuleContext } from "@shared/types/rules";
import { Router, type Response } from "express";

import { ringBuffer } from "../cache/ring";
import { AuthRequest } from "../middleware/requireUser.js";
import { ruleEvaluator } from "../rules/evaluator";
import { ruleRegistry } from "../rules/registry";

export const rulesRouter: Router = Router();

rulesRouter.get("/rules", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rules = await ruleRegistry.getActiveRules(userId);
    res.json({ rules });
  } catch (error) {
    console.error("Failed to fetch rules:", error);
    res.status(500).json({ error: "Failed to fetch rules" });
  }
});

rulesRouter.post("/rules", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const ruleData = req.body.rule as Omit<Rule, "id" | "createdAt">;

    if (!ruleData || !ruleData.name || !ruleData.expression) {
      return res.status(400).json({ error: "Invalid rule data" });
    }

    const rule = await ruleRegistry.createRule(userId, ruleData);
    res.json({ rule });
  } catch (error) {
    console.error("Failed to create rule:", error);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

rulesRouter.put("/rules/:ruleId", async (req: AuthRequest, res: Response) => {
  try {
    const { ruleId } = req.params;

    if (!ruleId) {
      return res.status(400).json({ error: "Rule ID required" });
    }

    const userId = req.user!.userId;
    const updates = req.body.updates as Partial<Omit<Rule, "id" | "createdAt">>;

    const rule = await ruleRegistry.updateRule(ruleId, userId, updates);
    res.json({ rule });
  } catch (error) {
    console.error("Failed to update rule:", error);
    res.status(500).json({ error: "Failed to update rule" });
  }
});

rulesRouter.delete("/rules/:ruleId", async (req: AuthRequest, res: Response) => {
  try {
    const { ruleId } = req.params;
    const userId = req.user!.userId;

    if (!ruleId) {
      return res.status(400).json({ error: "Rule ID required" });
    }

    await ruleRegistry.deleteRule(ruleId, userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete rule:", error);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

rulesRouter.get("/rules/dryrun", async (req: AuthRequest, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || "SPY";
    const ruleId = req.query.id as string | undefined;
    const userId = req.user!.userId;

    if (!ruleId) {
      return res.status(400).json({ error: "Rule ID required" });
    }

    const rules = await ruleRegistry.getActiveRules(userId);
    const rule = rules.find((r) => r.id === ruleId);

    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }

    const recentBars = ringBuffer.getRecent(symbol, 20);
    const evaluations = recentBars.map((bar) => {
      const context: RuleContext = {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };

      return ruleEvaluator.evaluate(rule, context, bar.seq);
    });

    res.json({ evaluations });
  } catch (error) {
    console.error("Failed to run dry run:", error);
    res.status(500).json({ error: "Failed to run dry run" });
  }
});
