import { Router } from "express";
import type { Router as RouterType } from "express";
import { metrics } from "../metrics/registry.js";

const router: RouterType = Router();

/**
 * Prometheus metrics endpoint
 * GET /api/metrics
 * 
 * Returns metrics in Prometheus text exposition format
 * https://prometheus.io/docs/instrumenting/exposition_formats/
 */
router.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  const metricsData = metrics.getMetrics();
  const lines: string[] = [];

  // Export counters
  const countersByName = new Map<string, typeof metricsData.counters>();
  for (const counter of metricsData.counters) {
    if (!countersByName.has(counter.name)) {
      countersByName.set(counter.name, []);
    }
    countersByName.get(counter.name)!.push(counter);
  }

  for (const [name, counters] of countersByName) {
    lines.push(`# HELP ${name} Counter metric`);
    lines.push(`# TYPE ${name} counter`);
    for (const counter of counters) {
      if (counter.labels && Object.keys(counter.labels).length > 0) {
        const labelStr = Object.entries(counter.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");
        lines.push(`${name}{${labelStr}} ${counter.value}`);
      } else {
        lines.push(`${name} ${counter.value}`);
      }
    }
    lines.push("");
  }

  // Export gauges
  const gaugesByName = new Map<string, typeof metricsData.gauges>();
  for (const gauge of metricsData.gauges) {
    if (!gaugesByName.has(gauge.name)) {
      gaugesByName.set(gauge.name, []);
    }
    gaugesByName.get(gauge.name)!.push(gauge);
  }

  for (const [name, gauges] of gaugesByName) {
    lines.push(`# HELP ${name} Gauge metric`);
    lines.push(`# TYPE ${name} gauge`);
    for (const gauge of gauges) {
      if (gauge.labels && Object.keys(gauge.labels).length > 0) {
        const labelStr = Object.entries(gauge.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(",");
        lines.push(`${name}{${labelStr}} ${gauge.value}`);
      } else {
        lines.push(`${name} ${gauge.value}`);
      }
    }
    lines.push("");
  }

  // Export histograms as summary (Prometheus format)
  const histogramsByName = new Map<string, typeof metricsData.histograms>();
  for (const histogram of metricsData.histograms) {
    if (!histogramsByName.has(histogram.name)) {
      histogramsByName.set(histogram.name, []);
    }
    histogramsByName.get(histogram.name)!.push(histogram);
  }

  for (const [name, histograms] of histogramsByName) {
    lines.push(`# HELP ${name} Histogram summary`);
    lines.push(`# TYPE ${name} summary`);
    for (const hist of histograms) {
      const hasLabels = hist.labels && Object.keys(hist.labels).length > 0;
      const labelEntries = hasLabels 
        ? Object.entries(hist.labels!).map(([k, v]) => `${k}="${v}"`).join(",")
        : "";

      // Quantile metrics with combined labels
      const quantileLabels = hasLabels 
        ? `{${labelEntries},quantile="0.5"}`
        : `{quantile="0.5"}`;
      const quantile95Labels = hasLabels
        ? `{${labelEntries},quantile="0.95"}`
        : `{quantile="0.95"}`;
      const quantile99Labels = hasLabels
        ? `{${labelEntries},quantile="0.99"}`
        : `{quantile="0.99"}`;

      lines.push(`${name}${quantileLabels} ${hist.p50}`);
      lines.push(`${name}${quantile95Labels} ${hist.p95}`);
      lines.push(`${name}${quantile99Labels} ${hist.p99}`);

      // Sum and count without quantile label
      const sumCountLabels = hasLabels ? `{${labelEntries}}` : "";
      lines.push(`${name}_sum${sumCountLabels} ${hist.sum}`);
      lines.push(`${name}_count${sumCountLabels} ${hist.count}`);
    }
    lines.push("");
  }

  // Add metadata
  lines.push(`# HELP spotlight_scrape_timestamp_ms Unix timestamp of this scrape`);
  lines.push(`# TYPE spotlight_scrape_timestamp_ms gauge`);
  lines.push(`spotlight_scrape_timestamp_ms ${metricsData.timestamp}`);

  res.send(lines.join("\n"));
});

export default router;
