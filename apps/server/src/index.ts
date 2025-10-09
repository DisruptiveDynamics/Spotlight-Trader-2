import express from 'express';
import { createServer } from 'http';
import { validateEnv } from '@shared/env';
import { setupSecurity } from './config/security';
import { initializeMarketPipeline } from './wiring';
import { setupVoiceProxy } from './realtime/voiceProxy';
import { setupVoiceTokenRoute } from './routes/voiceToken';
import { rulesRouter } from './routes/rules';
import journalsRouter from './routes/journals';
import memoryRouter from './routes/memory';
import insightRouter from './routes/insight';
import { startEodScheduler } from './journals/eod';

const env = validateEnv(process.env);
const app = express();
const server = createServer(app);

app.use(express.json());
setupSecurity(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

initializeMarketPipeline(app);
setupVoiceTokenRoute(app);
setupVoiceProxy(app, server);

app.use('/api', rulesRouter);
app.use('/api/journals', journalsRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/insight', insightRouter);

startEodScheduler();

const PORT = 8000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Log level: ${env.LOG_LEVEL}`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}/ws/realtime`);
});
