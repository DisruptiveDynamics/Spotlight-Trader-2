import { useState } from "react";

export function ReplayControls() {
  const [symbol, setSymbol] = useState("SPY");
  const [date, setDate] = useState<string>("");
  const [speed, setSpeed] = useState<number>(4);
  const [isPlaying, setIsPlaying] = useState(false);

  const start = async () => {
    try {
      // Default to today if no date selected
      const targetDate = date ? new Date(date) : new Date();
      const toMs = targetDate.getTime();
      const fromMs = toMs - (4 * 60 * 60 * 1000); // 4 hours of market data

      const response = await fetch("/api/replay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          symbol,
          fromMs,
          toMs,
          speed,
        }),
      });

      const result = await response.json();
      if (result.ok) {
        setIsPlaying(true);
        console.log(`🎬 Replay started: ${result.total} bars at ${speed}x speed`);
      } else {
        console.error("Replay failed:", result.error);
      }
    } catch (err) {
      console.error("Failed to start replay:", err);
    }
  };

  const stop = async () => {
    try {
      const response = await fetch("/api/replay/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ symbol }),
      });

      const result = await response.json();
      if (result.ok) {
        setIsPlaying(false);
        console.log("⏹️ Replay stopped");
      }
    } catch (err) {
      console.error("Failed to stop replay:", err);
    }
  };

  const updateSpeed = async (newSpeed: number) => {
    setSpeed(newSpeed);
    if (!isPlaying) return;

    try {
      await fetch("/api/replay/speed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ symbol, speed: newSpeed }),
      });
    } catch (err) {
      console.error("Failed to update speed:", err);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-200">OnDemand Replay</h3>
        <div className="flex-1" />
        {isPlaying && (
          <span className="text-xs text-green-400 animate-pulse">● Playing</span>
        )}
      </div>

      <div className="space-y-3">
        {/* Symbol input */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            disabled={isPlaying}
            className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded text-white disabled:opacity-50"
            placeholder="SPY"
          />
        </div>

        {/* Date picker */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date (leave blank for today)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isPlaying}
            className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded text-white disabled:opacity-50"
          />
        </div>

        {/* Speed control */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Speed: {speed}x
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={speed}
            onChange={(e) => updateSpeed(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1x</span>
            <span>5x</span>
            <span>10x</span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex gap-2">
          {!isPlaying ? (
            <button
              onClick={start}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
            >
              ▶ Start Replay
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
            >
              ⏹ Stop Replay
            </button>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t border-gray-700 pt-3">
        <p>Replay historical market data at your own speed.</p>
        <p className="mt-1">Charts, voice tools, and indicators work identically with replay.</p>
      </div>
    </div>
  );
}
