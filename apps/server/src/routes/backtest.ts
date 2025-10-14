import { Router } from "express";
import { z } from "zod";
import { runBacktest, getBacktestPresets, BacktestValidationError } from "../backtest/engine";
import { ruleRegistry } from "../rules/registry";
import { isEnabled } from "../flags";
import { AuthRequest } from "../middleware/requireUser.js";

export const backtestRouter: Router = Router();

const BacktestSchema = z
  .object({
    symbol: z.string().min(1, "Symbol is required"),
    timeframe: z.enum(["1m"]), // Only 1m supported for now
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

/**
 * POST /api/backtest/run
 * Run a backtest with specified parameters
 */
backtestRouter.post("/run", async (req: AuthRequest, res) => {
  if (!isEnabled("enableBacktest")) {
    return res.status(403).json({ error: "Backtest feature is disabled" });
  }

  try {
    // Validate input schema
    const parsed = BacktestSchema.parse(req.body);
    const userId = req.user!.userId;

    // Fetch all active rules and filter by IDs
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
    // Distinguish validation errors from runtime errors
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

/**
 * GET /api/backtest/presets
 * Get common backtest presets
 */
backtestRouter.get("/presets", (_req, res) => {
  const presets = getBacktestPresets();
  res.json({ presets });
});
