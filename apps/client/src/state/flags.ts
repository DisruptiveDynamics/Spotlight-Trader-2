/**
 * Client-side Feature Flags Store
 * Syncs with server every 30s for runtime flag updates
 */

import { create } from "zustand";

export interface Flags {
  enableRiskGovernorV2: boolean;
  enableExplainV2: boolean;
  enableTapePeek: boolean;
  enableLearningLoop: boolean;
  enableBacktest: boolean;
  enableGoldenTests: boolean;
  governorTight: boolean;
  chartMaxFps: number;
}

interface FlagsStore {
  flags: Flags;
  loading: boolean;
  error: string | null;
  lastSync: number | null;
  setFlags: (flags: Flags) => void;
  syncFlags: () => Promise<void>;
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

export const useFlagsStore = create<FlagsStore>((set) => ({
  flags: defaults,
  loading: false,
  error: null,
  lastSync: null,

  setFlags: (flags) => set({ flags, lastSync: Date.now() }),

  syncFlags: async () => {
    try {
      set({ loading: true, error: null });

      const res = await fetch("/api/flags");

      if (!res.ok) {
        throw new Error(`Failed to fetch flags: ${res.status}`);
      }

      const flags = await res.json();
      set({ flags, loading: false, lastSync: Date.now() });
    } catch (error) {
      console.error("Failed to sync flags:", error);
      set({
        error: error instanceof Error ? error.message : "Unknown error",
        loading: false,
      });
    }
  },
}));

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic flag syncing every 30 seconds
 */
export function startFlagSync() {
  const { syncFlags } = useFlagsStore.getState();

  // Initial sync
  syncFlags();

  // Sync every 30 seconds
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(() => {
    syncFlags();
  }, 30000);
}

/**
 * Stop automatic flag syncing
 */
export function stopFlagSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Hook to get a specific flag value
 */
export function useFlag(flag: keyof Flags): boolean | number {
  return useFlagsStore((state) => state.flags[flag]);
}
