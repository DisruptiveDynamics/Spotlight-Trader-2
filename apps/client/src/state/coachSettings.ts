import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CoachSettings {
  agentName: string;
  voice: string;
  tonePreset: 'balanced' | 'friendly' | 'tough' | 'mentor';
  jargon: number; // 0-100
  decisiveness: number; // 0-100
}

interface CoachSettingsState {
  settings: CoachSettings;
  updateSettings: (partial: Partial<CoachSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: CoachSettings = {
  agentName: 'Coach',
  voice: 'alloy',
  tonePreset: 'balanced',
  jargon: 50,
  decisiveness: 50,
};

export const useCoachSettings = create<CoachSettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),
      resetSettings: () =>
        set({ settings: defaultSettings }),
    }),
    {
      name: 'coach-settings-storage',
    }
  )
);
