import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ORIGIN: z.string().url(),
  ADMIN_ORIGIN: z.string().url(),
  ADMIN_EMAIL: z.string().email().optional(),
  OPENAI_API_KEY: z.string().min(1),
  POLYGON_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SESSION_SECRET: z.string().min(32),
  AUTH_JWT_SECRET: z.string().min(32),
  SESSION_TTL: z.string().default("604800"), // 7 days in seconds
  MAGIC_TTL: z.string().default("900"), // 15 minutes in seconds
  RESEND_API_KEY: z.string().optional(),

  // Performance tuning
  HISTORY_INIT_LIMIT: z.coerce.number().min(50).max(1000).default(300),
  HISTORY_INIT_TIMEFRAME: z.enum(["1m", "2m", "5m", "15m", "30m", "1h"]).default("1m"),
  TOOL_TIMEOUT_MS: z.coerce.number().min(500).max(5000).default(1500),
  RING_BUFFER_CAP: z.coerce.number().min(1000).max(10000).default(5000),
  MICROBAR_MS: z.coerce.number().min(50).max(1000).default(200),
  
  // Market session policy
  SESSION: z.enum(["RTH", "RTH_EXT"]).default("RTH"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    console.error("❌ Environment validation failed:");
    console.error(result.error.format());
    throw new Error("Invalid environment variables");
  }

  return result.data;
}
