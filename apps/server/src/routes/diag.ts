import { Router } from "express";
import type { Router as RouterType } from "express";
import { getEpochId, getEpochStartMs } from "../stream/epoch.js";
import { getMarketSource, getMarketReason } from "../market/bootstrap.js";
import { metrics } from "../metrics/registry.js";

const router: RouterType = Router();

/**
 * Diagnostic snapshot endpoint
 * GET /api/diag
 * 
 * Provides quick troubleshooting data for 5-minute triage:
 * - Current epoch and uptime
 * - Market data source status
 * - Memory usage
 * - Key metrics summary
 */
router.get("/", (_req, res) => {
  const allMetrics = metrics.getMetrics();
  
  // Extract key metrics for quick triage
  const sseConnections = allMetrics.gauges.find((g: any) => g.name === "sse_connections")?.value ?? 0;
  const sseDropped = allMetrics.counters.find((c: any) => c.name === "sse_events_dropped")?.value ?? 0;
  const polygonEmpty = allMetrics.counters.find((c: any) => c.name === "polygon_empty_responses")?.value ?? 0;
  const toolCalls = allMetrics.counters.find((c: any) => c.name === "voice_tool_calls")?.value ?? 0;

  const diag = {
    timestamp: new Date().toISOString(),
    
    epoch: {
      id: getEpochId(),
      startMs: getEpochStartMs(),
      startedAt: new Date(getEpochStartMs()).toISOString(),
      uptime: Date.now() - getEpochStartMs(),
    },
    
    market: {
      source: getMarketSource(),
      reason: getMarketReason(),
    },
    
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
      external: Math.round(process.memoryUsage().external / 1024 / 1024) + "MB",
    },
    
    process: {
      uptime: Math.round(process.uptime()) + "s",
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
    
    metrics: {
      sseConnections,
      sseDroppedTotal: sseDropped,
      polygonEmptyTotal: polygonEmpty,
      voiceToolCalls: toolCalls,
    },
  };

  res.json(diag);
});

export default router;
