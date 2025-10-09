import { defineConfig } from 'drizzle-kit';
import { validateEnv } from '@spotlight/shared/env';

const env = validateEnv(process.env);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
