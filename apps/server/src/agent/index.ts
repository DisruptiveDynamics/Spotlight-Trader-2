import type { Express } from "express";

import { startProactiveRules } from "./proactive";
import { buildAgentRouter } from "./router";

let stopRules: (() => void) | null = null;

export function registerAgent(app: Express) {
  if (process.env.COACH_ENABLED !== "1") {
    // Not enabled; mount nothing.
    return;
  }

  // Use your existing JSON body parser upstream
  app.use("/api/agent", buildAgentRouter());

  if (!stopRules) stopRules = startProactiveRules();
}

export function unregisterAgent() {
  if (stopRules) {
    stopRules();
    stopRules = null;
  }
}
