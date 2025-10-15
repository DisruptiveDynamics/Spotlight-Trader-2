// POST /api/chart/timeframe - Server-authoritative timeframe switching
// Client requests timeframe change, server validates and orchestrates the transition

import { switchTimeframe } from "@server/chart/switchTimeframe";
import { flags } from "@shared/flags";
import type {
  Timeframe,
  TimeframeSwitchRequest,
  TimeframeSwitchResponse,
} from "@shared/types/market";
import type { Request, Response } from "express";

const VALID_TIMEFRAMES: Timeframe[] = ["1m", "2m", "5m", "10m", "15m", "30m", "1h"];

export async function handleChartTimeframe(req: Request, res: Response): Promise<void> {
  // Guard behind feature flag
  if (!flags.timeframeServerSource) {
    res.status(501).json({
      ok: false,
      error: "Timeframe server source is disabled",
    });
    return;
  }

  try {
    const { symbol, timeframe } = req.body as TimeframeSwitchRequest;

    // Validation
    if (!symbol || typeof symbol !== "string") {
      res.status(400).json({
        ok: false,
        error: "symbol is required and must be a string",
      });
      return;
    }

    if (!timeframe || !VALID_TIMEFRAMES.includes(timeframe)) {
      res.status(400).json({
        ok: false,
        error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(", ")}`,
      });
      return;
    }

    // Get userId from session/auth (fallback to 'demo' for now)
    const userId = (req as any).user?.id || (req as any).session?.userId || "demo";

    console.log(`[API] /api/chart/timeframe: ${symbol} → ${timeframe} (user: ${userId})`);

    // Perform atomic timeframe switch
    const result = await switchTimeframe({
      userId,
      symbol: symbol.toUpperCase(),
      timeframe,
    });

    if (result.ok) {
      const response: TimeframeSwitchResponse = {
        ok: true,
        symbol: symbol.toUpperCase(),
        timeframe,
        barsCount: result.barsCount,
      };
      res.json(response);
    } else {
      res.status(500).json({
        ok: false,
        symbol: symbol.toUpperCase(),
        timeframe,
        error: result.error || "Unknown error during timeframe switch",
      } as TimeframeSwitchResponse);
    }
  } catch (error) {
    console.error("[API] /api/chart/timeframe error:", error);
    res.status(500).json({
      ok: false,
      error: String(error),
    });
  }
}
