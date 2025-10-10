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
  updateSettings: (partial: Partial<CoachSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;
}

const defaultSettings: CoachSettings = {
  agentName: 'Coach',
  voice: 'alloy',
  tonePreset: 'balanced',
  jargon: 50,
  decisiveness: 50,
};

async function saveSettingsToAPI(settings: CoachSettings): Promise<void> {
  try {
    const response = await fetch('/api/coach/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      console.error('Failed to save settings:', response.statusText);
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

async function loadSettingsFromAPI(): Promise<CoachSettings> {
  try {
    const response = await fetch('/api/coach/settings');

    if (!response.ok) {
      return defaultSettings;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to load settings:', error);
    return defaultSettings;
  }
}

export const useCoachSettings = create<CoachSettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      updateSettings: async (partial) => {
        const newSettings = { ...get().settings, ...partial };
        set({ settings: newSettings });
        await saveSettingsToAPI(newSettings);
      },
      resetSettings: async () => {
        set({ settings: defaultSettings });
        await saveSettingsToAPI(defaultSettings);
      },
      loadSettings: async () => {
        const settings = await loadSettingsFromAPI();
        set({ settings });
      },
    }),
    {
      name: 'coach-settings-storage',
    }
  )
);
