import type { Config } from 'drizzle-kit';
import { validateEnv } from '@spotlight/shared/env';

const env = validateEnv(process.env);

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config;
