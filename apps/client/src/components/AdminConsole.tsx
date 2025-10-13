import { useState, useEffect } from "react";

interface Metric {
  name: string;
  value?: number;
  count?: number;
  avg?: number;
  p50?: number;
  p95?: number;
  p99?: number;
  labels?: Record<string, string>;
}

interface Snapshot {
  timestamp: number;
  metrics: {
    counters: Metric[];
    histograms: Metric[];
    gauges: Metric[];
  };
  flags: Record<string, boolean>;
  system: {
    nodeVersion: string;
    uptime: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
    };
    platform: string;
    arch: string;
  };
}

export function AdminConsole() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = async () => {
    try {
      const res = await fetch("/api/admin/snapshot");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch snapshot");
      }
      const data = await res.json();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFlagToggle = async (key: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });

      if (!res.ok) {
        throw new Error("Failed to update flag");
      }

      fetchSnapshot();
    } catch (err) {
      console.error("Error updating flag:", err);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-900 text-white min-h-screen">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Admin Console</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-gray-900 text-white min-h-screen">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Admin Console</h1>
          <div className="bg-red-900/20 border border-red-500 rounded p-4">
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const uptimeHours = Math.floor(snapshot.system.uptime / 3600);
  const uptimeMinutes = Math.floor((snapshot.system.uptime % 3600) / 60);

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Admin Console</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Feature Flags</h2>
            <div className="space-y-2">
              {Object.entries(snapshot.flags).map(([key, enabled]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 px-3 bg-gray-700 rounded"
                >
                  <span className="font-mono text-sm">{key}</span>
                  <button
                    onClick={() => handleFlagToggle(key, !enabled)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      enabled ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 hover:bg-gray-500"
                    }`}
                  >
                    {enabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">System Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Node Version:</dt>
                <dd className="font-mono">{snapshot.system.nodeVersion}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Uptime:</dt>
                <dd className="font-mono">
                  {uptimeHours}h {uptimeMinutes}m
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Memory (Heap):</dt>
                <dd className="font-mono">
                  {Math.round(snapshot.system.memory.heapUsed / 1024 / 1024)}MB /
                  {Math.round(snapshot.system.memory.heapTotal / 1024 / 1024)}MB
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Platform:</dt>
                <dd className="font-mono">
                  {snapshot.system.platform} ({snapshot.system.arch})
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Counters</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {snapshot.metrics.counters.map((counter, idx) => (
                <div key={idx} className="flex justify-between text-sm py-1">
                  <span className="text-gray-400 font-mono text-xs truncate">{counter.name}</span>
                  <span className="font-mono">{counter.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Histograms</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {snapshot.metrics.histograms.map((hist, idx) => (
                <div key={idx} className="border-b border-gray-700 pb-2">
                  <div className="text-xs font-mono text-gray-400 mb-1">{hist.name}</div>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div>
                      <span className="text-gray-500">p50:</span> {hist.p50?.toFixed(1)}
                    </div>
                    <div>
                      <span className="text-gray-500">p95:</span> {hist.p95?.toFixed(1)}
                    </div>
                    <div>
                      <span className="text-gray-500">p99:</span> {hist.p99?.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Gauges</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {snapshot.metrics.gauges.map((gauge, idx) => (
                <div key={idx} className="flex justify-between text-sm py-1">
                  <span className="text-gray-400 font-mono text-xs truncate">{gauge.name}</span>
                  <span className="font-mono">{gauge.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          Last updated: {new Date(snapshot.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
