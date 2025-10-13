// Feature flags for Spotlight Trader
// Controls gradual rollout of new features and system behavior

export const flags = {
  // Voice assistant routes through our proxy (not direct to OpenAI)
  // Enables server-side tool enforcement and numeric validation
  voiceViaProxy: true,
  
  // Server is authoritative for timeframe state
  // Client requests timeframe changes via API instead of local state
  timeframeServerSource: true,
  
  // Build higher timeframes (2m, 5m, 10m, 15m, 30m, 1h) by rolling up 1m bars
  // Ensures single source of truth: ticks → 1m → roll-ups
  timeframeRollups: true,
  
  // Optional audit logging to validate bar/tape/vwap consistency
  // Logs only, no functional impact - useful for debugging
  marketAudit: false,
} as const;

export type FeatureFlags = typeof flags;
