import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { runBacktest, getBacktestPresets, BacktestValidationError } from "../backtest/engine";
import { isEnabled } from "../flags";
import { requirePin } from "../middleware/requirePin";
import { ruleRegistry } from "../rules/registry";

export const backtestRouter: Router = Router();

const BacktestSchema = z
  .object({
    symbol: z.string().min(1, "Symbol is required"),
    timeframe: z.enum(["1m"]),
    start: z.string(),
    end: z.string(),
    ruleIds: z.array(z.string()).min(1, "At least one rule ID is required"),
  })
  .refine(
    (data) => {
      const startMs = new Date(data.start).getTime();
      const endMs = new Date(data.end).getTime();
      return !isNaN(startMs) && !isNaN(endMs) && startMs < endMs;
    },
    {
      message: "Invalid date range: start must be before end and both must be valid ISO dates",
    },
  );

backtestRouter.post("/run", requirePin, async (req: Request, res: Response) => {
  if (!isEnabled("enableBacktest")) {
    return res.status(403).json({ error: "Backtest feature is disabled" });
  }

  try {
    const parsed = BacktestSchema.parse(req.body);
    const userId = (req as any).userId;

    const allRules = await ruleRegistry.getActiveRules(userId);
    const validRules = allRules.filter((r) => parsed.ruleIds.includes(r.id));

    if (validRules.length === 0) {
      return res.status(400).json({ error: "No valid rules found for the provided IDs" });
    }

    const result = await runBacktest({
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      start: parsed.start,
      end: parsed.end,
      rules: validRules,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request parameters",
        details: error.errors,
      });
    }

    if (error instanceof BacktestValidationError) {
      return res.status(400).json({
        error: error.message,
      });
    }

    console.error("Backtest error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Backtest failed",
    });
  }
});

backtestRouter.get("/presets", requirePin, async (_req: Request, res: Response) => {
  const presets = getBacktestPresets();
  res.json({ presets });
});
