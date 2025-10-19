import { Router } from "express";
import { metrics } from "../metrics/registry";

const router: Router = Router();

/**
 * Prometheus-compatible metrics endpoint at /api/metrics/prometheus
 * Returns metrics in Prometheus text exposition format
 */
router.get("/prometheus", (_req, res) => {
  const data = metrics.getMetrics();
  const lines: string[] = [];

  // Helper to format Prometheus metric name
  const formatName = (name: string) => {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
  };

  // Helper to format labels
  const formatLabels = (labels?: Record<string, string>) => {
    if (!labels || Object.keys(labels).length === 0) return "";
    const labelPairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `{${labelPairs}}`;
  };

  // Export counters
  for (const counter of data.counters) {
    const metricName = formatName(counter.name);
    lines.push(`# TYPE ${metricName} counter`);
    lines.push(`${metricName}${formatLabels(counter.labels)} ${counter.value}`);
  }

  // Export gauges
  for (const gauge of data.gauges) {
    const metricName = formatName(gauge.name);
    lines.push(`# TYPE ${metricName} gauge`);
    lines.push(`${metricName}${formatLabels(gauge.labels)} ${gauge.value}`);
  }

  // Export histograms as summaries (count, sum, quantiles)
  for (const hist of data.histograms) {
    const metricName = formatName(hist.name);
    const labels = formatLabels(hist.labels);
    
    lines.push(`# TYPE ${metricName} summary`);
    lines.push(`${metricName}_count${labels} ${hist.count}`);
    lines.push(`${metricName}_sum${labels} ${hist.sum}`);
    
    // Quantiles
    const baseLabels = hist.labels ? { ...hist.labels } : {};
    lines.push(`${metricName}${formatLabels({ ...baseLabels, quantile: "0.5" })} ${hist.p50}`);
    lines.push(`${metricName}${formatLabels({ ...baseLabels, quantile: "0.95" })} ${hist.p95}`);
    lines.push(`${metricName}${formatLabels({ ...baseLabels, quantile: "0.99" })} ${hist.p99}`);
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(lines.join("\n") + "\n");
});

export { router as metricsPromRouter };
