/**
 * Production-safe logger utility
 * - Debug/info logs only appear in development
 * - Warn/error logs always appear with timestamps
 * - Zero overhead in production for debug calls
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const isBrowser = typeof window !== "undefined";
const mode = isBrowser
  ? (import.meta as any)?.env?.MODE
  : process.env.NODE_ENV || "development";
const isDev = mode !== "production";

function fmt(level: LogLevel, msg: any, ...args: any[]) {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level.toUpperCase()}]`, msg, ...args] as const;
}

export const logger = {
  debug: (...args: any[]) => {
    if (isDev) console.debug(...fmt("debug", ...args));
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...fmt("info", ...args));
  },
  warn: (...args: any[]) => console.warn(...fmt("warn", ...args)),
  error: (...args: any[]) => console.error(...fmt("error", ...args)),
};
