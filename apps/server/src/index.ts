import express from 'express';
import { validateEnv } from '@shared/env';
import { setupSecurity } from './config/security';
import { initializeMarketPipeline } from './wiring';

const env = validateEnv(process.env);
const app = express();

app.use(express.json());
setupSecurity(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

initializeMarketPipeline(app);

const PORT = 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Log level: ${env.LOG_LEVEL}`);
});
