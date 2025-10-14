// API configuration for client
// In unified dev mode (VITE_UNIFIED_DEV=1), client and server share the same port,
// so we use relative URLs. Otherwise, default to localhost:8080 for separate servers.
export const API_BASE =
  import.meta.env?.VITE_API_BASE ||
  (import.meta.env?.VITE_UNIFIED_DEV === "1"
    ? "" // Relative URLs for unified dev (same port)
    : typeof location !== "undefined" && location.hostname === "localhost"
      ? "http://localhost:8080"
      : "");

export const HISTORY_URL = `${API_BASE}/api/history`;
export const STREAM_URL = `${API_BASE}/stream/market`;
