import { useState, useEffect } from "react";

interface LatencyMetrics {
  voiceRTT: number;
  tickToWickP95: number;
  sseReconnects: number;
  marketStatus: "LIVE" | "HALTED" | "PREMARKET" | "CLOSED";
}

interface ToolMetrics {
  count: number;
  errorRate: number;
  p50: number;
  p95: number;
}

export function LatencyHUD() {
  const [metrics, setMetrics] = useState<LatencyMetrics>({
    voiceRTT: 0,
    tickToWickP95: 0,
    sseReconnects: 0,
    marketStatus: "CLOSED",
  });
  
  const [toolMetrics, setToolMetrics] = useState<Record<string, ToolMetrics>>({});

  useEffect(() => {
    const handleMetrics = (e: CustomEvent<Partial<LatencyMetrics>>) => {
      setMetrics((prev) => ({ ...prev, ...e.detail }));
    };

    window.addEventListener("metrics:update" as any, handleMetrics);
    return () => window.removeEventListener("metrics:update" as any, handleMetrics);
  }, []);

  // [OBS] Fetch tool metrics every 5 seconds
  useEffect(() => {
    const fetchToolMetrics = async () => {
      try {
        const res = await fetch("/api/metrics/tools");
        if (res.ok) {
          const data = await res.json();
          setToolMetrics(data.tools || {});
        }
      } catch (err) {
        console.error("Failed to fetch tool metrics:", err);
      }
    };

    fetchToolMetrics();
    const interval = setInterval(fetchToolMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const getRTTColor = (rtt: number) => {
    if (rtt < 120) return "text-green-400";
    if (rtt < 180) return "text-amber-400";
    return "text-red-400";
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 120) return "text-green-400";
    if (latency < 180) return "text-amber-400";
    return "text-red-400";
  };

  const getStatusColor = (status: string) => {
    if (status === "LIVE") return "text-green-400";
    if (status === "PREMARKET") return "text-blue-400";
    if (status === "HALTED") return "text-red-400";
    return "text-gray-400";
  };

  const getTooltip = (metric: string, value: number) => {
    if (metric === "rtt" && value >= 120) {
      return "High latency detected. Check your internet connection or try moving closer to your router.";
    }
    if (metric === "tick" && value >= 120) {
      return "Chart rendering is slow. Consider reducing the number of indicators or closing other browser tabs.";
    }
    return "";
  };

  return (
    <div className="flex items-center gap-4 text-xs font-mono">
      <div
        className={`flex items-center gap-1 ${getRTTColor(metrics.voiceRTT)}`}
        title={getTooltip("rtt", metrics.voiceRTT)}
      >
        <span className="text-gray-400">RTT:</span>
        <span>{metrics.voiceRTT}ms</span>
      </div>

      <div
        className={`flex items-center gap-1 ${getLatencyColor(metrics.tickToWickP95)}`}
        title={getTooltip("tick", metrics.tickToWickP95)}
      >
        <span className="text-gray-400">Tick→Wick:</span>
        <span>{metrics.tickToWickP95}ms</span>
      </div>

      {/* [OBS] Per-tool execution metrics - p50 and p95 */}
      {Object.entries(toolMetrics).map(([toolName, metrics]) => (
        <div
          key={toolName}
          className="flex items-center gap-1 text-gray-400"
          title={`${toolName}: ${metrics.count} calls, ${(metrics.errorRate * 100).toFixed(1)}% errors`}
        >
          <span className="text-gray-400">{toolName}:</span>
          <span className={getLatencyColor(metrics.p50)}>p50:{metrics.p50}ms</span>
          <span className="text-gray-500">/</span>
          <span className={getLatencyColor(metrics.p95)}>p95:{metrics.p95}ms</span>
        </div>
      ))}

      <div className="flex items-center gap-1 text-gray-400">
        <span>SSE:</span>
        <span className={metrics.sseReconnects > 0 ? "text-amber-400" : "text-green-400"}>
          {metrics.sseReconnects}
        </span>
      </div>

      <div
        className={`flex items-center gap-1 font-semibold ${getStatusColor(metrics.marketStatus)}`}
      >
        <span className="w-2 h-2 rounded-full bg-current"></span>
        <span>{metrics.marketStatus}</span>
      </div>
    </div>
  );
}
