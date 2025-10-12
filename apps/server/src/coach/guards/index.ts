/**
 * Guard utilities for AI coach responses
 * Export all guards and helpers for use in testing and validation
 */

export { enforceRealtimeClaim, type ToolCaller } from './noDataGuard';
export { ensureFreshTools, type NowFn } from './freshnessGuard';
