/**
 * Web Vitals Tracking
 * Captures Core Web Vitals and sends to server
 */

import { onCLS, onFID, onLCP, onINP, type Metric } from "web-vitals";

interface VitalsData {
  cls?: number;
  fid?: number;
  lcp?: number;
  inp?: number;
}

let vitalsData: VitalsData = {};
let reportTimer: NodeJS.Timeout | null = null;

/**
 * Report vitals to server
 */
async function reportVitals() {
  if (Object.keys(vitalsData).length === 0) {
    return;
  }

  try {
    await fetch("/api/metrics/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vitalsData),
      credentials: "include",
    });

    // Reset after reporting
    vitalsData = {};
  } catch (error) {
    console.error("Failed to report web vitals:", error);
  }
}

/**
 * Schedule vitals report (debounced)
 */
function scheduleReport() {
  if (reportTimer) {
    clearTimeout(reportTimer);
  }

  // Report after 5 seconds of inactivity
  reportTimer = setTimeout(reportVitals, 5000);
}

/**
 * Handle a web vital metric
 */
function handleMetric(metric: Metric) {
  const { name, value } = metric;

  switch (name) {
    case "CLS":
      vitalsData.cls = value;
      break;
    case "FID":
      vitalsData.fid = value;
      break;
    case "LCP":
      vitalsData.lcp = value;
      break;
    case "INP":
      vitalsData.inp = value;
      break;
  }

  scheduleReport();
}

/**
 * Initialize web vitals tracking
 */
export function initWebVitals() {
  onCLS(handleMetric);
  onFID(handleMetric);
  onLCP(handleMetric);
  onINP(handleMetric);
}

/**
 * Manually report current vitals
 */
export function reportCurrentVitals() {
  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
  reportVitals();
}
