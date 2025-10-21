import type { Request, Response } from "express";

import { getEpochInfo } from "./stream/epoch";
import { getAllToolMetrics } from "./voice/toolMetrics";

let serverReady = true;

export function setServerReady(ready: boolean) {
  serverReady = ready;
}

export function liveness(_req: Request, res: Response) {
  res.status(200).json({ ok: true, status: "live" });
}

export function readiness(_req: Request, res: Response) {
  const status = serverReady ? 200 : 503;
  res.status(status).json({
    ok: serverReady,
    status: serverReady ? "ready" : "starting",
  });
}

export function healthz(_req: Request, res: Response) {
  const epoch = getEpochInfo();
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    epochId: epoch.epochId,
    startedAt: new Date(epoch.epochStartMs).toISOString(),
    uptimeMs: epoch.uptime,
    version: "1.0.0",
    timestamp: Date.now(),
  });
}

export function toolsHealth(_req: Request, res: Response) {
  const metrics = getAllToolMetrics();
  
  const toolNames = Object.keys(metrics);
  const totalCalls = toolNames.reduce((sum, name) => {
    const m = metrics[name];
    return sum + (m?.count || 0);
  }, 0);
  const totalErrors = toolNames.reduce((sum, name) => {
    const m = metrics[name];
    return sum + (m ? m.count * m.errorRate : 0);
  }, 0);
  const overallErrorRate = totalCalls > 0 ? totalErrors / totalCalls : 0;
  
  const microToolP95s = ['get_last_price', 'get_last_vwap', 'get_last_ema']
    .map(name => metrics[name]?.p95 || 0)
    .filter(v => v > 0);
  const avgMicroToolP95 = microToolP95s.length > 0 
    ? microToolP95s.reduce((sum, v) => sum + v, 0) / microToolP95s.length 
    : 0;
  
  const ok = overallErrorRate < 0.1 && avgMicroToolP95 < 1000;
  
  res.status(ok ? 200 : 503).json({
    ok,
    summary: {
      totalCalls,
      errorRate: overallErrorRate,
      microToolP95Avg: Math.round(avgMicroToolP95),
      toolCount: toolNames.length,
    },
    tools: metrics,
    timestamp: Date.now(),
  });
}
