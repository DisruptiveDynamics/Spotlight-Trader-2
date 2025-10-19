// API configuration for client
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof location !== "undefined" && location.hostname === "localhost" ? "http://localhost:8080" : "");

export const HISTORY_URL = `${API_BASE}/api/history`;
export const STREAM_URL = `${API_BASE}/stream/market`;

// [UX] Market idle timeout (default 5 minutes = 300000ms)
export const MARKET_IDLE_MS = parseInt(import.meta.env.VITE_MARKET_IDLE_MS || "300000", 10);
