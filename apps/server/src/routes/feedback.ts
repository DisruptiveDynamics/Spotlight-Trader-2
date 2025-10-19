import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { saveFeedback, getRuleMetrics } from "../learning/loop";
import { requirePin } from "../middleware/requirePin";

export const feedbackRouter: Router = Router();

const FeedbackSchema = z.object({
  symbol: z.string(),
  seq: z.number(),
  ruleId: z.string(),
  label: z.enum(["good", "bad", "missed", "late"]),
  notes: z.string().optional(),
});

feedbackRouter.post("/", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = FeedbackSchema.parse(req.body);
    const userId = (req as any).userId;

    await saveFeedback({
      userId,
      symbol: parsed.symbol,
      seq: parsed.seq,
      ruleId: parsed.ruleId,
      label: parsed.label,
      notes: parsed.notes || null,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(400).json({ error: "Invalid feedback" });
  }
});

feedbackRouter.get("/rules/metrics", requirePin, async (req: Request, res: Response) => {
  try {
    const ruleId = req.query.ruleId as string;
    if (!ruleId) {
      return res.status(400).json({ error: "Missing ruleId" });
    }

    const userId = (req as any).userId;
    const metrics = await getRuleMetrics(userId, ruleId);

    res.json({ metrics });
  } catch (error) {
    console.error("Metrics error:", error);
    res.status(500).json({ error: "Failed to get metrics" });
  }
});
