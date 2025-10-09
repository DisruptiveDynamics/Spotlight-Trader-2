/**
 * Feature flags for safe rollouts
 * Toggle features at runtime without code changes
 */

export const flags = {
  enableRiskGovernorV2: false,
  enableExplainV2: false,
  enableTapePeek: false,
  enableLearningLoop: false,
  enableBacktest: true,
  enableGoldenTests: true,
} as const;

export type FeatureFlag = keyof typeof flags;

/**
 * Check if a feature flag is enabled
 */
export function isEnabled(flag: FeatureFlag): boolean {
  return flags[flag];
}

/**
 * Execute a function only if the feature flag is enabled
 */
export function ifFlag<T>(flag: FeatureFlag, fn: () => T, fallback?: () => T): T | undefined {
  if (isEnabled(flag)) {
    return fn();
  }
  return fallback?.();
}

/**
 * Get all feature flags
 */
export function getAllFlags(): Record<FeatureFlag, boolean> {
  return { ...flags };
}
