import { validateEnv } from "@shared/env";
import cors from "cors";
import { type Express } from "express";
import helmet from "helmet";

const env = validateEnv(process.env);

const allowedOrigins = new Set([env.APP_ORIGIN, env.ADMIN_ORIGIN].filter(Boolean));

export function setupSecurity(app: Express) {
  const isUnifiedDev = process.env.UNIFIED_DEV === "1";
  const isProd = env.NODE_ENV === "production" && !isUnifiedDev;
  
  // Disable CSP in development to allow Vite HMR/eval/inline during development
  if (isProd) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            "script-src": ["'self'"],
            "connect-src": ["'self'", ...Array.from(allowedOrigins)],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
  }

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
        const isUnifiedDev = process.env.UNIFIED_DEV === "1" && 
          (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
        if (isUnifiedDev) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
      exposedHeaders: ["X-Market-Source", "X-Market-Reason", "X-Market-Session", "X-Market-Open", "X-Epoch-Id", "X-Epoch-Start-Ms"],
    }),
  );
}
