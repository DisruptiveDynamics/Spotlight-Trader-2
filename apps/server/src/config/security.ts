import cors from "cors";
import helmet from "helmet";
import { type Express } from "express";
import { validateEnv } from "@shared/env";

const env = validateEnv(process.env);

const allowedOrigins = new Set([env.APP_ORIGIN, env.ADMIN_ORIGIN].filter(Boolean));

export function setupSecurity(app: Express) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", ...Array.from(allowedOrigins)],
          frameSrc: ["'none'"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        if (allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        const isReplitDev = process.env.REPL_ID && origin.endsWith(".replit.dev");
        if (isReplitDev) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
}
