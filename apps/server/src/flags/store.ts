/**
 * Feature Flags Store
 * Runtime-togglable flags for safe rollouts and experiments
 * Supports optional DB persistence
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface Flags {
  // Existing flags
  enableRiskGovernorV2: boolean;
  enableExplainV2: boolean;
  enableTapePeek: boolean;
  enableLearningLoop: boolean;
  enableBacktest: boolean;
  enableGoldenTests: boolean;

  // New performance flags
  governorTight: boolean;
  chartMaxFps: number;
}

const defaults: Flags = {
  enableRiskGovernorV2: false,
  enableExplainV2: false,
  enableTapePeek: false,
  enableLearningLoop: false,
  enableBacktest: true,
  enableGoldenTests: true,
  governorTight: false,
  chartMaxFps: 60,
};

let currentFlags: Flags = { ...defaults };

/**
 * Get current feature flags
 * @param _userId Optional user ID for user-scoped flags (currently global)
 */
export function getFlags(_userId?: string): Flags {
  return { ...currentFlags };
}

/**
 * Update feature flags
 * @param patch Partial flags to update
 * @param persist Whether to persist to DB (if available)
 */
export async function updateFlags(patch: Partial<Flags>, persist = true): Promise<Flags> {
  currentFlags = { ...currentFlags, ...patch };

  if (persist && process.env.DATABASE_URL) {
    try {
      await persistFlags(currentFlags);
    } catch (error) {
      console.error("Failed to persist flags:", error);
    }
  }

  return { ...currentFlags };
}

/**
 * Load flags from database on startup
 */
export async function loadFlags(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const result = await db.execute(sql`
      SELECT value FROM feature_flags WHERE key = 'global' LIMIT 1
    `);

    if (result.rows.length > 0 && result.rows[0]) {
      const stored = result.rows[0].value as Partial<Flags>;
      currentFlags = { ...defaults, ...stored };
      console.log("✅ Feature flags loaded from database");
    }
  } catch {
    // Table might not exist yet, that's ok
    console.log("ℹ️  Feature flags using defaults (DB table not found)");
  }
}

/**
 * Persist flags to database
 */
async function persistFlags(flags: Flags): Promise<void> {
  await db.execute(sql`
    INSERT INTO feature_flags (key, value, updated_at)
    VALUES ('global', ${JSON.stringify(flags)}::jsonb, NOW())
    ON CONFLICT (key) 
    DO UPDATE SET value = ${JSON.stringify(flags)}::jsonb, updated_at = NOW()
  `);
}

/**
 * Reset flags to defaults
 */
export async function resetFlags(): Promise<Flags> {
  currentFlags = { ...defaults };

  if (process.env.DATABASE_URL) {
    try {
      await db.execute(sql`DELETE FROM feature_flags WHERE key = 'global'`);
    } catch (error) {
      console.error("Failed to reset flags:", error);
    }
  }

  return { ...currentFlags };
}

/**
 * Check if a specific flag is enabled
 */
export function isEnabled(flag: keyof Flags): boolean {
  const value = currentFlags[flag];
  return typeof value === "number" ? value > 0 : Boolean(value);
}
