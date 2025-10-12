interface LatencyMetric {
  timestamp: number;
  source: string;
  latencyMs: number;
}

class PerformanceMonitor {
  private latencies: LatencyMetric[] = [];
  private readonly MAX_SAMPLES = 1000;

  recordLatency(source: string, startTime: number) {
    const latencyMs = Date.now() - startTime;
    
    this.latencies.push({
      timestamp: Date.now(),
      source,
      latencyMs,
    });

    if (this.latencies.length > this.MAX_SAMPLES) {
      this.latencies.shift();
    }

    if (latencyMs > 200) {
      console.warn(`⚠️ High latency detected: ${source} took ${latencyMs}ms`);
    }
  }

  getStats(source?: string) {
    const filtered = source
      ? this.latencies.filter((m) => m.source === source)
      : this.latencies;

    if (filtered.length === 0) {
      return { p50: 0, p95: 0, count: 0 };
    }

    const sorted = filtered.map((m) => m.latencyMs).sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      p50: sorted[p50Index],
      p95: sorted[p95Index],
      count: filtered.length,
    };
  }

  logStats() {
    const calloutsStats = this.getStats('callout-broadcast');
    const totalStats = this.getStats();

    console.log('📊 Copilot Performance Stats:');
    console.log(`   Callout broadcast - p50: ${calloutsStats.p50}ms, p95: ${calloutsStats.p95}ms`);
    console.log(`   Overall - p50: ${totalStats.p50}ms, p95: ${totalStats.p95}ms, samples: ${totalStats.count}`);
  }
}

export const perfMonitor = new PerformanceMonitor();

setInterval(() => {
  perfMonitor.logStats();
}, 60000);
