interface Counter {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

interface Histogram {
  name: string;
  values: number[];
  labels?: Record<string, string>;
}

interface Gauge {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private gauges: Map<string, Gauge> = new Map();

  counter(name: string, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value++;
    } else {
      this.counters.set(key, labels ? { name, value: 1, labels } : { name, value: 1 });
    }
  }

  incrementCounter(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, labels ? { name, value, labels } : { name, value });
    }
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.values.push(value);
      if (existing.values.length > 1000) {
        existing.values.shift();
      }
    } else {
      this.histograms.set(
        key,
        labels ? { name, values: [value], labels } : { name, values: [value] },
      );
    }
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, labels ? { name, value, labels } : { name, value });
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  getMetrics() {
    const countersData = Array.from(this.counters.values());
    const histogramsData = Array.from(this.histograms.values()).map((h) => ({
      name: h.name,
      labels: h.labels,
      count: h.values.length,
      sum: h.values.reduce((a, b) => a + b, 0),
      avg: h.values.length > 0 ? h.values.reduce((a, b) => a + b, 0) / h.values.length : 0,
      p50: this.percentile(h.values, 50),
      p95: this.percentile(h.values, 95),
      p99: this.percentile(h.values, 99),
      min: h.values.length > 0 ? Math.min(...h.values) : 0,
      max: h.values.length > 0 ? Math.max(...h.values) : 0,
    }));
    const gaugesData = Array.from(this.gauges.values());

    return {
      counters: countersData,
      histograms: histogramsData,
      gauges: gaugesData,
      timestamp: Date.now(),
    };
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  reset() {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

export const metrics = new MetricsRegistry();

const activeSSEByUser = new Map<string, number>();
const activeWSByUser = new Map<string, number>();

export function recordSSEConnection(userId: string) {
  metrics.counter("sse_connections_total", { userId });
  const current = activeSSEByUser.get(userId) || 0;
  activeSSEByUser.set(userId, current + 1);
  metrics.gauge("sse_active_connections", current + 1, { userId });

  const total = Array.from(activeSSEByUser.values()).reduce((a, b) => a + b, 0);
  metrics.gauge("sse_active_connections_total", total);
}

export function recordSSEDisconnection(userId: string) {
  const current = activeSSEByUser.get(userId) || 0;
  const newCount = Math.max(0, current - 1);
  if (newCount === 0) {
    activeSSEByUser.delete(userId);
  } else {
    activeSSEByUser.set(userId, newCount);
  }
  metrics.gauge("sse_active_connections", newCount, { userId });

  const total = Array.from(activeSSEByUser.values()).reduce((a, b) => a + b, 0);
  metrics.gauge("sse_active_connections_total", total);
}

export function recordSSEEvent(eventType: string) {
  metrics.counter("sse_events_total", { type: eventType });
}

export function recordSSEBackpressure(buffered: number, dropped: number, prevDropped: number) {
  metrics.histogram("sse_buffer_size", buffered);
  const newDrops = dropped - prevDropped;
  if (newDrops > 0) {
    metrics.incrementCounter("sse_events_dropped_total", newDrops, { reason: "backpressure" });
  }
}

export function recordWSConnection(userId: string) {
  metrics.counter("ws_connections_total", { userId });
  const current = activeWSByUser.get(userId) || 0;
  activeWSByUser.set(userId, current + 1);
  metrics.gauge("ws_active_connections", current + 1, { userId });

  const total = Array.from(activeWSByUser.values()).reduce((a, b) => a + b, 0);
  metrics.gauge("ws_active_connections_total", total);
}

export function recordWSDisconnection(userId: string, reason: string) {
  const current = activeWSByUser.get(userId) || 0;
  const newCount = Math.max(0, current - 1);
  if (newCount === 0) {
    activeWSByUser.delete(userId);
  } else {
    activeWSByUser.set(userId, newCount);
  }
  metrics.gauge("ws_active_connections", newCount, { userId });

  const total = Array.from(activeWSByUser.values()).reduce((a, b) => a + b, 0);
  metrics.gauge("ws_active_connections_total", total);

  metrics.counter("ws_disconnections_total", { reason });
}

export function recordWSLRUEviction() {
  metrics.counter("ws_lru_evictions_total");
}

export function recordWebVital(name: string, value: number, rating: string) {
  metrics.histogram(`web_vitals_${name.toLowerCase()}`, value, { rating });
}

export function recordFPS(fps: number) {
  metrics.histogram("client_fps", fps);
}
