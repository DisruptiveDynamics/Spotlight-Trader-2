import { defineConfig } from 'drizzle-kit';

// Use DATABASE_URL directly from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: DATABASE_URL,
  },
});
