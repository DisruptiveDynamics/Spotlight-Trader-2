// API configuration for client
export const API_BASE =
  import.meta.env?.VITE_API_BASE ||
  (typeof location !== "undefined" && location.hostname === "localhost"
    ? "http://localhost:8080"
    : "");

export const HISTORY_URL = `${API_BASE}/api/history`;
export const STREAM_URL = `${API_BASE}/stream/market`;
