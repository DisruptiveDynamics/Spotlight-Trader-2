import pino from "pino";
import { validateEnv } from "@shared/env";

const env = validateEnv(process.env);

// Create base logger with LOG_LEVEL from env
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

// Export HTTP request logger middleware (pino-http)
export function createHttpLogger() {
  // Use pino directly for HTTP logging without pino-http dependency
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const log = {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
        userAgent: req.headers["user-agent"],
      };

      if (res.statusCode >= 500) {
        logger.error(log, "HTTP request error");
      } else if (res.statusCode >= 400) {
        logger.warn(log, "HTTP request warning");
      } else {
        logger.debug(log, "HTTP request");
      }
    });
    next();
  };
}
