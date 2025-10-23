import { validateEnv } from "@shared/env";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import { createServer } from "http";

import { proactiveCoachingEngine } from "./coach/proactiveCoaching";
import { setupSecurity } from "./config/security";
import { triggerManager } from "./copilot/triggers/manager";
import { loadFlags } from "./flags/store";
import { liveness, readiness, healthz, toolsHealth, setServerReady } from "./health";
import { startEodScheduler } from "./journals/eod";
import { initializeLearningLoop } from "./learning/loop";
import { rateLimit } from "./middleware/rateLimit";
import { adminRouter } from "./routes/admin";
import { backtestRouter } from "./routes/backtest";
import { epochRouter } from "./routes/epoch";
import { feedbackRouter } from "./routes/feedback";
import { flagsRouter } from "./routes/flags";
import insightRouter from "./routes/insight";
import journalsRouter from "./routes/journals";
import { setupNexaKnowledgeRoutes } from "./routes/nexaKnowledge";
import { setupPreferencesRoutes } from "./routes/preferences";
import { rulesRouter } from "./routes/rules";
import memoryRouter from "./routes/memory";
import { signalsRouter } from "./routes/signals";
import { metricsRouter } from "./routes/metrics";
import { pinAuthRouter } from "./routes/pinAuth";
import exportRouter from "./routes/export";
import importRouter from "./routes/import";
import coachSettingsRouter from "./routes/coachSettings";
import { copilotToolsRouter } from "./routes/copilotTools";
import copilotActionsRouter from "./routes/copilotActions";
import triggerTestRouter from "./routes/triggerTest";
import voicePreviewRouter from "./routes/voicePreview";
import { voiceDebugRouter } from "./routes/voiceDebug";
import replayRouter from "./routes/replay";
import metricsPromRouter from "./routes/metricsProm";
import diagRouter from "./routes/diag";
import symbolsRouter from "./routes/symbols";
import { requirePin } from "./middleware/requirePin";
import { initializeMarketSource } from "./market/bootstrap";
import { errorHandler, notFound } from "./middleware/error";
import { setupVoiceProxy } from "./realtime/voiceProxy";
import { setupVoiceTokenRoute } from "./routes/voiceToken";
import { getEpochInfo } from "./stream/epoch"; // [OBS] For health endpoint
import { initializeTelemetryBridge } from "./telemetry/bridge";
import { telemetryBus } from "./telemetry/bus";
import { setupToolsBridge } from "./voice/toolsBridge";
import { initializeMarketPipeline } from "./wiring";

const env = validateEnv(process.env);
const app = express();
const server = createServer(app);

// Mark server as not ready during initialization
setServerReady(false);

// Configure server timeouts for better dev restart stability
server.keepAliveTimeout = 75000; // 75 seconds
server.headersTimeout = 80000; // 80 seconds

// [PERFORMANCE] Enable gzip compression for all responses EXCEPT SSE streams
// SSE requires unbuffered streaming, compression would buffer events
app.use(
  compression({
    filter: (req, res) => {
      // Never compress Server-Sent Events (SSE) - they require unbuffered streaming
      if (req.path.startsWith("/stream/") || req.path.startsWith("/realtime/sse")) {
        return false;
      }
      // Use default compression filter for everything else
      return compression.filter(req, res);
    },
  }),
);

app.use(express.json());
app.use(cookieParser());
setupSecurity(app);

// Health and readiness probes
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    now: Date.now(),
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get("/api/livez", liveness);
app.get("/api/readyz", readiness);
app.get("/api/healthz", healthz);
app.get("/health/tools", toolsHealth);

// Legacy health endpoints for compatibility
app.get("/api/health", (_req, res) => {
  const epoch = getEpochInfo();
  res.json({
    ok: true,
    epochId: epoch.epochId,
    startedAt: new Date(epoch.epochStartMs).toISOString(),
    uptimeMs: epoch.uptime,
    timestamp: Date.now(),
  });
});

app.get("/api/voice/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Quote tool HTTP probe (for testing)
app.get("/tools/quote", async (_req, res) => {
  try {
    const symbol = (_req.query.symbol as string) || "SPY";
    const { getLastPrice } = await import("./market/quote.js");
    const result = getLastPrice(symbol);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
});

// Production security: protect sensitive routes with PIN auth
const protect = env.NODE_ENV === "production" 
  ? requirePin 
  : (_req: any, _res: any, next: any) => next();

// Debug routes - disable entirely in production
if (env.NODE_ENV !== "production") {
  app.use("/debug", voiceDebugRouter);
}

// Observability endpoints - protect in production
app.use("/api/metrics", protect, metricsPromRouter); // Prometheus format
app.use("/api/diag", protect, diagRouter); // Diagnostic snapshot

// PIN auth routes (public - no middleware)
app.use("/api/auth", pinAuthRouter);
app.use("/auth", pinAuthRouter);

// Public epoch endpoint (no auth required - used for client restart detection)
app.use("/api", epochRouter);

// Sensitive routes - protect in production
app.use("/api/flags", protect, flagsRouter);
app.use("/api/metrics/json", protect, metricsRouter);
app.use("/api/admin", protect, adminRouter);

initializeMarketPipeline(app);
initializeTelemetryBridge();
setupVoiceTokenRoute(app);
setupNexaKnowledgeRoutes(app);
setupPreferencesRoutes(app);
setupVoiceProxy(app, server);
setupToolsBridge(server);

app.use("/api", rulesRouter);
app.use("/api/journals", journalsRouter);
app.use("/api/memory", rateLimit(), memoryRouter);
app.use("/api/insight", rateLimit(), insightRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/backtest", rateLimit(), backtestRouter);
app.use("/api/signals", signalsRouter);
app.use("/api/export", exportRouter);
app.use("/api/import", importRouter);
app.use("/api/coach", coachSettingsRouter);
app.use("/api/copilot", copilotToolsRouter);
app.use("/api/copilot", copilotActionsRouter);
app.use("/api/voice", voicePreviewRouter);
app.use("/api/triggers", triggerTestRouter);
app.use("/api/replay", replayRouter);
app.use("/api/symbols", symbolsRouter);

initializeLearningLoop();
startEodScheduler();
loadFlags();

const sessionStartMs = new Date().setHours(9, 30, 0, 0);
triggerManager.initialize(sessionStartMs);

// Initialize proactive coaching engine
proactiveCoachingEngine.setupMarketMonitoring(telemetryBus);
console.log("✅ Proactive coaching engine initialized");

const PORT = Number(process.env.PORT ?? 8080);

// Initialize market source (Polygon auth check with simulator fallback)
await initializeMarketSource();

// Mark server as ready after initialization completes
setServerReady(true);

// Unified Dev Mode: Attach Vite middleware (BEFORE error handlers)
if (process.env.UNIFIED_DEV === "1") {
  const { attachViteMiddleware } = await import("./dev/unifiedVite.js");
  await attachViteMiddleware(app, server);
}

// Error middleware - must be last
app.use(notFound); // 404 handler
app.use(errorHandler); // Global error handler

server.listen(PORT, "0.0.0.0", () => {
  const proto = env.NODE_ENV === "production" ? "wss" : "ws";
  const mode = process.env.UNIFIED_DEV === "1" ? "unified dev (Express + Vite)" : "API only";
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Log level: ${env.LOG_LEVEL}`);
  console.log(`   Routes: /health (GET), /realtime/sse (SSE), /ws/realtime (WS), /ws/tools (WS)`);
  console.log(`   WebSocket: ${proto}://0.0.0.0:${PORT}/ws/realtime`);
  console.log(`   [SSE] mounted at /realtime/sse`);
  console.log(`   [WS] voice at /ws/realtime, tools at /ws/tools`);
});

// Global process error handlers for crash visibility
process.on("uncaughtException", (error) => {
  const isProd = env.NODE_ENV === "production";
  console.error("[CRITICAL] Uncaught Exception:", {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  
  if (isProd) {
    // In production: mark unhealthy but let process manager handle restart
    setServerReady(false);
    console.error("[CRITICAL] Server marked as unhealthy - process manager will restart");
  } else {
    // In dev: fail fast for immediate feedback
    console.error("[CRITICAL] Process exiting due to uncaught exception");
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  const isProd = env.NODE_ENV === "production";
  console.error("[CRITICAL] Unhandled Rejection:", {
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });
  
  if (isProd) {
    // In production: mark unhealthy but let process manager handle restart
    setServerReady(false);
    console.error("[CRITICAL] Server marked as unhealthy - process manager will restart");
  } else {
    // In dev: fail fast for immediate feedback
    console.error("[CRITICAL] Process exiting due to unhandled rejection");
    process.exit(1);
  }
});

// Graceful shutdown handlers
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, closing server gracefully...");
  setServerReady(false); // Signal readiness probe to stop routing traffic
  server.close(() => {
    console.log("[Server] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, closing server gracefully...");
  setServerReady(false); // Signal readiness probe to stop routing traffic
  server.close(() => {
    console.log("[Server] Server closed");
    process.exit(0);
  });
});
