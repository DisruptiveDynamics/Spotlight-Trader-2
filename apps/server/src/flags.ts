/**
 * Feature flags for safe rollouts
 * Toggle features at runtime without code changes
 *
 * @deprecated Use flags/store.ts for new code. This file maintains backward compatibility.
 */

export { getFlags, updateFlags, loadFlags, resetFlags, isEnabled } from './flags/store';
export type { Flags } from './flags/store';

// Backward compatibility exports
export type FeatureFlag = keyof import('./flags/store').Flags;

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
 * @deprecated Use getFlags() from flags/store.ts
 */
export function getAllFlags() {
  return getFlags();
}
