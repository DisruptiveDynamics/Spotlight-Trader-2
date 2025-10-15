import type { Request, Response } from "express";

import { getEpochInfo } from "./stream/epoch";

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
