import { useState, useEffect } from "react";

type AnchorType = "session" | "premarket" | "custom";

interface VWAPConfig {
  anchor: AnchorType;
  customDate?: string;
  enabled: boolean;
}

export function VWAPControls() {
  const [config, setConfig] = useState<VWAPConfig>({
    anchor: "session",
    enabled: false,
  });
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  useEffect(() => {
    const handleToggle = () => {
      setConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
    };

    window.addEventListener("hotkey:toggle-vwap", handleToggle);
    return () => window.removeEventListener("hotkey:toggle-vwap", handleToggle);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("vwap:config-change", {
        detail: config,
      }),
    );
  }, [config]);

  const setAnchor = (anchor: AnchorType) => {
    setConfig((prev) => ({ ...prev, anchor, enabled: true }));
    if (anchor === "custom") {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
    }
  };

  const getActiveColor = (anchor: AnchorType) => {
    return config.anchor === anchor && config.enabled
      ? "bg-purple-500 text-white"
      : "bg-gray-700 text-gray-300";
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Anchored VWAP</h3>
        <button
          onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className={`px-2 py-1 text-xs rounded ${
            config.enabled ? "bg-purple-500" : "bg-gray-700"
          }`}
        >
          {config.enabled ? "ON" : "OFF"}
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setAnchor("session")}
          className={`flex-1 px-3 py-1.5 rounded text-sm ${getActiveColor("session")}`}
        >
          Session
        </button>
        <button
          onClick={() => setAnchor("premarket")}
          className={`flex-1 px-3 py-1.5 rounded text-sm ${getActiveColor("premarket")}`}
        >
          Premarket
        </button>
        <button
          onClick={() => setAnchor("custom")}
          className={`flex-1 px-3 py-1.5 rounded text-sm ${getActiveColor("custom")}`}
        >
          Custom
        </button>
      </div>

      {showCustomPicker && config.anchor === "custom" && (
        <div className="mt-2">
          <input
            type="datetime-local"
            value={config.customDate || ""}
            onChange={(e) => setConfig((prev) => ({ ...prev, customDate: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
          />
        </div>
      )}

      {config.enabled && (
        <div className="mt-3 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>
              Anchor: {config.anchor}
              {config.customDate && ` (${new Date(config.customDate).toLocaleString()})`}
            </span>
          </div>
          <div className="text-gray-500 mt-1">Press G+V to toggle</div>
        </div>
      )}
    </div>
  );
}
