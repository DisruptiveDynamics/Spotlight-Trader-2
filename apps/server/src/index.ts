import { validateEnv } from "@shared/env";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import { createServer } from "http";

import { proactiveCoachingEngine } from "./coach/proactiveCoaching";
import { setupSecurity } from "./config/security";
import { triggerManager } from "./copilot/triggers/manager";
import { loadFlags } from "./flags/store";
import { liveness, readiness, healthz } from "./health";
import { startEodScheduler } from "./journals/eod";
import { initializeLearningLoop } from "./learning/loop";
import { rateLimit } from "./middleware/rateLimit";
import { adminRouter } from "./routes/admin";
import { backtestRouter } from "./routes/backtest";
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
import authRouter from "./routes/auth";
import exportRouter from "./routes/export";
import importRouter from "./routes/import";
import coachSettingsRouter from "./routes/coachSettings";
import { copilotToolsRouter } from "./routes/copilotTools";
import copilotActionsRouter from "./routes/copilotActions";
import triggerTestRouter from "./routes/triggerTest";
import voicePreviewRouter from "./routes/voicePreview";
// TODO: Apply requireUser middleware to protected routes
// import { requireUser } from "./middleware/requireUser";
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

// Configure server timeouts for better dev restart stability
server.keepAliveTimeout = 75000; // 75 seconds
server.headersTimeout = 80000; // 80 seconds

// [PERFORMANCE] Enable gzip compression for all responses
app.use(compression());

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

app.use("/api/auth", authRouter);
app.use("/auth", authRouter);

app.use("/api/flags", flagsRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/admin", adminRouter);

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
  console.error("[CRITICAL] Uncaught Exception:", {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
  console.error("[CRITICAL] Process exiting due to uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRITICAL] Unhandled Rejection:", {
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });
  console.error("[CRITICAL] Process exiting due to unhandled rejection");
  process.exit(1);
});

// Graceful shutdown handlers
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, closing server gracefully...");
  server.close(() => {
    console.log("[Server] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, closing server gracefully...");
  server.close(() => {
    console.log("[Server] Server closed");
    process.exit(0);
  });
});
