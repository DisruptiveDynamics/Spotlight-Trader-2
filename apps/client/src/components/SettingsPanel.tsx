import { useState, useEffect } from "react";

import { AccessibilityControls } from "./AccessibilityControls";
import { useCoachSettings } from "../state/coachSettings";
import { useAuthStore } from "../stores/authStore";

interface Voice {
  id: string;
  name: string;
  description: string;
}

interface SettingsPanelProps {
  onClose: () => void;
}

type Tab = "coach" | "accessibility";

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings, resetSettings, loadSettings } = useCoachSettings();
  const { logout } = useAuthStore();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("coach");

  useEffect(() => {
    fetchVoices();
    loadSettings();
  }, []);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const response = await fetch("/api/voice/voices");
      if (response.ok) {
        const data = await response.json();
        setVoices(data.voices || []);
      }
    } catch (error) {
      console.error("Failed to fetch voices:", error);
      // Fallback to default voices
      setVoices([
        { id: "alloy", name: "Alloy", description: "Neutral and clear" },
        { id: "echo", name: "Echo", description: "Warm and friendly" },
        { id: "fable", name: "Fable", description: "Professional and articulate" },
        { id: "onyx", name: "Onyx", description: "Deep and authoritative" },
        { id: "nova", name: "Nova", description: "Energetic and engaging" },
        { id: "shimmer", name: "Shimmer", description: "Soft and calming" },
      ]);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const handlePreviewVoice = async () => {
    setIsPlayingPreview(true);
    try {
      const response = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: settings.voice }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          setIsPlayingPreview(false);
          URL.revokeObjectURL(audioUrl);
        };

        audio.onerror = () => {
          setIsPlayingPreview(false);
          URL.revokeObjectURL(audioUrl);
        };

        await audio.play();
      } else {
        setIsPlayingPreview(false);
      }
    } catch (error) {
      console.error("Failed to preview voice:", error);
      setIsPlayingPreview(false);
    }
  };

  const getToneDescription = (preset: string) => {
    switch (preset) {
      case "balanced":
        return "Professional and objective analysis";
      case "friendly":
        return "Supportive and encouraging";
      case "tough":
        return "Direct and challenging feedback";
      case "mentor":
        return "Teaching and guiding approach";
      default:
        return "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
              aria-label="Close settings"
            >
              <svg
                className="w-5 h-5 text-gray-500 dark:text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("coach")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "coach"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              Coach
            </button>
            <button
              onClick={() => setActiveTab("accessibility")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "accessibility"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              Accessibility
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === "coach" && (
            <>
              {/* Agent Name */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={settings.agentName}
                  onChange={(e) => updateSettings({ agentName: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Coach, Mentor, Guide"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  How you'd like to address your trading coach
                </p>
              </div>

              {/* Voice Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Voice
                </label>
                <select
                  value={settings.voice}
                  onChange={(e) => updateSettings({ voice: e.target.value })}
                  disabled={isLoadingVoices}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} - {voice.description}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handlePreviewVoice}
                  disabled={isPlayingPreview}
                  className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {isPlayingPreview ? "Playing..." : "Preview Voice"}
                </button>
              </div>

              {/* Tone Preset */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Tone Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["balanced", "friendly", "tough", "mentor"] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateSettings({ tonePreset: preset })}
                      className={`px-4 py-3 rounded-lg border-2 text-left transition-all ${
                        settings.tonePreset === preset
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                      }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                        {preset}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {getToneDescription(preset)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Jargon Level */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Trading Jargon
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({settings.jargon}%)
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.jargon}
                  onChange={(e) => updateSettings({ jargon: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Simple terms</span>
                  <span>Technical language</span>
                </div>
              </div>

              {/* Decisiveness */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Decisiveness
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({settings.decisiveness}%)
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.decisiveness}
                  onChange={(e) => updateSettings({ decisiveness: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span>Exploratory & questioning</span>
                  <span>Direct & actionable</span>
                </div>
              </div>

              {/* Reset Button */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={resetSettings}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Reset to Defaults
                </button>
              </div>

              {/* Logout Button */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}

          {activeTab === "accessibility" && <AccessibilityControls />}
        </div>
      </div>
    </div>
  );
}
