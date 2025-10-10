import express from 'express';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import { validateEnv } from '@shared/env';
import { setupSecurity } from './config/security';
import { initializeMarketPipeline } from './wiring';
import { setupVoiceProxy } from './realtime/voiceProxy';
import { setupVoiceTokenRoute } from './routes/voiceToken';
import { rulesRouter } from './routes/rules';
import journalsRouter from './routes/journals';
import memoryRouter from './routes/memory';
import insightRouter from './routes/insight';
import { flagsRouter } from './routes/flags';
import { feedbackRouter } from './routes/feedback';
import { backtestRouter } from './routes/backtest';
import { signalsRouter } from './routes/signals';
import { metricsRouter } from './routes/metrics';
import { adminRouter } from './routes/admin';
import authRouter from './routes/auth';
import exportRouter from './routes/export';
import importRouter from './routes/import';
import coachSettingsRouter from './routes/coachSettings';
import { requireUser } from './middleware/requireUser';
import { rateLimit } from './middleware/rateLimit';
import { startEodScheduler } from './journals/eod';
import { initializeLearningLoop } from './learning/loop';
import { loadFlags } from './flags/store';
import { initializeMarketSource } from './market/bootstrap';

const env = validateEnv(process.env);
const app = express();
const server = createServer(app);

// Configure server timeouts for better dev restart stability
server.keepAliveTimeout = 75000;  // 75 seconds
server.headersTimeout = 80000;    // 80 seconds

app.use(express.json());
app.use(cookieParser());
setupSecurity(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get('/api/voice/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.use('/api/auth', authRouter);
app.use('/auth', authRouter);

app.use('/api/flags', flagsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/admin', requireUser, adminRouter);

initializeMarketPipeline(app);
setupVoiceTokenRoute(app);
setupVoiceProxy(app, server);

app.use('/api', requireUser, rulesRouter);
app.use('/api/journals', requireUser, journalsRouter);
app.use('/api/memory', requireUser, rateLimit(), memoryRouter);
app.use('/api/insight', requireUser, rateLimit(), insightRouter);
app.use('/api/feedback', requireUser, feedbackRouter);
app.use('/api/backtest', requireUser, rateLimit(), backtestRouter);
app.use('/api/signals', requireUser, signalsRouter);
app.use('/api/export', requireUser, exportRouter);
app.use('/api/import', requireUser, importRouter);
app.use('/api/coach', requireUser, coachSettingsRouter);

initializeLearningLoop();
startEodScheduler();
loadFlags();

// Error middleware - must be last, catches all route errors
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API_ERROR:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// Initialize market source (Polygon auth check with simulator fallback)
await initializeMarketSource();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Log level: ${env.LOG_LEVEL}`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws/realtime`);
});
