// [OBS] In-memory tool execution metrics with rolling window
// Tracks latency (p50, p95), error rate, and call count for observability

type ToolExecution = {
  latencyMs: number;
  success: boolean;
  timestamp: number;
};

const WINDOW_SIZE = 200; // Keep last 200 calls per tool
const metricsStore = new Map<string, ToolExecution[]>();

export function recordToolExecution(
  toolName: string,
  latencyMs: number,
  success: boolean,
) {
  const executions = metricsStore.get(toolName) || [];
  
  executions.push({
    latencyMs,
    success,
    timestamp: Date.now(),
  });
  
  // Keep only last WINDOW_SIZE executions
  if (executions.length > WINDOW_SIZE) {
    executions.shift();
  }
  
  metricsStore.set(toolName, executions);
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

export function getToolMetrics(toolName: string) {
  const executions = metricsStore.get(toolName) || [];
  
  if (executions.length === 0) {
    return {
      count: 0,
      errorRate: 0,
      p50: 0,
      p95: 0,
    };
  }
  
  const latencies = executions.map((e) => e.latencyMs);
  const errors = executions.filter((e) => !e.success).length;
  
  return {
    count: executions.length,
    errorRate: errors / executions.length,
    p50: calculatePercentile(latencies, 50),
    p95: calculatePercentile(latencies, 95),
  };
}

export function getAllToolMetrics() {
  const result: Record<string, ReturnType<typeof getToolMetrics>> = {};
  
  for (const [toolName] of metricsStore) {
    result[toolName] = getToolMetrics(toolName);
  }
  
  return result;
}
