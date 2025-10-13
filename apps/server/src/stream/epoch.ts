// [RESILIENCE] Epoch tracking for self-healing SSE streams
// Generates a unique ID on server boot to help clients detect restarts

import { randomUUID } from "crypto";

const epochId = randomUUID();
const epochStartMs = Date.now();

export function getEpochId(): string {
  return epochId;
}

export function getEpochStartMs(): number {
  return epochStartMs;
}

export function getEpochInfo() {
  return {
    epochId,
    epochStartMs,
    uptime: Date.now() - epochStartMs,
  };
}
