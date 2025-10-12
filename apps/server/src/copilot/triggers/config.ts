export interface TriggerConfig {
  vwapReclaim: {
    requiredConfirmations: number;
    cooldownMs: number;
    volumeMultiplier: number;
  };
  vwapReject: {
    requiredConfirmations: number;
    cooldownMs: number;
    volumeMultiplier: number;
  };
  orb: {
    requiredConfirmations: number;
    cooldownMs: number;
    volumeSurgeMultiplier: number;
  };
  emaPullback: {
    requiredConfirmations: number;
    cooldownMs: number;
    volumeShrinkThreshold: number;
  };
}

export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  vwapReclaim: {
    requiredConfirmations: 2,
    cooldownMs: 300000, // 5 minutes
    volumeMultiplier: 1.2,
  },
  vwapReject: {
    requiredConfirmations: 2,
    cooldownMs: 300000,
    volumeMultiplier: 1.2,
  },
  orb: {
    requiredConfirmations: 1,
    cooldownMs: 300000,
    volumeSurgeMultiplier: 2.0,
  },
  emaPullback: {
    requiredConfirmations: 2,
    cooldownMs: 300000,
    volumeShrinkThreshold: 0.8,
  },
};
