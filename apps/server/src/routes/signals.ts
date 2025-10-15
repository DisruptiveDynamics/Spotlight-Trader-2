import { and, eq, gte, lt } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/index.js";
import { signals } from "../db/schema.js";
import { AuthRequest } from "../middleware/requireUser.js";

const router: Router = Router();

const ListSignalsSchema = z.object({
  symbol: z.string().optional(),
  date: z.string().optional(), // YYYY-MM-DD
  ruleId: z.string().optional(),
});

/**
 * GET /api/signals
 * Query signals by symbol, date, and/or ruleId
 */
router.get("/", async (req: AuthRequest, res) => {
  try {
    const parsed = ListSignalsSchema.parse(req.query);
    const userId = req.user!.userId;

    const conditions = [eq(signals.userId, userId)];

    if (parsed.symbol) {
      conditions.push(eq(signals.symbol, parsed.symbol));
    }

    if (parsed.ruleId) {
      conditions.push(eq(signals.ruleId, parsed.ruleId));
    }

    if (parsed.date) {
      const dateStart = new Date(parsed.date);
      dateStart.setHours(0, 0, 0, 0);

      const dateEnd = new Date(parsed.date);
      dateEnd.setHours(23, 59, 59, 999);

      conditions.push(gte(signals.ts, dateStart));
      conditions.push(lt(signals.ts, dateEnd));
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const results = await db
      .select()
      .from(signals)
      .where(whereClause)
      .orderBy(signals.ts)
      .limit(100); // Safety limit

    res.json({
      signals: results.map((s) => ({
        id: s.id,
        symbol: s.symbol,
        timeframe: s.timeframe,
        ruleId: s.ruleId,
        ruleVersion: s.ruleVersion,
        confidence: s.confidence,
        ctx: s.ctx,
        ts: s.ts.toISOString(),
      })),
      count: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to list signals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as signalsRouter };
