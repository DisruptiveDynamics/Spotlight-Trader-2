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

function fmt(level: LogLevel): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}]`;
}

export const logger = {
  debug: (msg: any, ...args: any[]) => {
    if (isDev) console.debug(fmt("debug"), msg, ...args);
  },
  info: (msg: any, ...args: any[]) => {
    if (isDev) console.info(fmt("info"), msg, ...args);
  },
  warn: (msg: any, ...args: any[]) => console.warn(fmt("warn"), msg, ...args),
  error: (msg: any, ...args: any[]) => console.error(fmt("error"), msg, ...args),
};
