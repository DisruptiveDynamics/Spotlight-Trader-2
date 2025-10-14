/**
 * Unified Dev Server - Vite Middleware
 * 
 * Attaches Vite dev server as Express middleware for single-port development.
 * This eliminates the need for proxy configuration and inter-process networking.
 */

import type { Application } from "express";
import type { Server } from "http";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";

export async function attachViteMiddleware(app: Application, server: Server) {
  const clientRoot = path.resolve(process.cwd(), "../client");
  
  console.log("🔧 Starting Vite in middleware mode...");
  console.log(`   Client root: ${clientRoot}`);

  // In Replit, detect if we're running behind the HTTPS proxy
  const isReplitEnv = Boolean(process.env.REPL_SLUG);
  
  // Create Vite dev server in middleware mode
  const vite = await createViteServer({
    root: clientRoot,
    server: {
      middlewareMode: true,
      hmr: isReplitEnv 
        ? {
            // Replit environment: let HMR connect via the proxy domain
            protocol: "wss",
            port: 443,
          }
        : {
            // Local environment: use the HTTP server directly
            server,
          },
    },
    appType: "spa",
  });

  // Use Vite's middleware for asset transformation ONLY
  // (do not use vite.middlewares directly as it includes catch-all)
  app.use((req, res, next) => {
    // Only apply Vite transformations to client assets, not API routes
    if (req.url.startsWith("/api") || 
        req.url.startsWith("/ws") || 
        req.url.startsWith("/stream") || 
        req.url.startsWith("/health") ||
        req.url.startsWith("/realtime")) {
      return next();
    }
    return vite.middlewares(req, res, next);
  });

  // SPA fallback: serve index.html for client routes ONLY (after all API routes)
  app.get("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip ALL API-related routes - let them 404 properly
    if (url.startsWith("/api") || 
        url.startsWith("/ws") || 
        url.startsWith("/stream") || 
        url.startsWith("/health") ||
        url.startsWith("/realtime")) {
      return next();
    }

    try {
      const indexPath = path.join(clientRoot, "index.html");
      let html = await fs.readFile(indexPath, "utf-8");

      // Transform HTML with Vite (applies HMR client, env vars, etc.)
      html = await vite.transformIndexHtml(url, html);

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      console.error("Error serving SPA:", error);
      next(error);
    }
  });

  console.log("✅ Vite middleware attached (unified dev mode)");
  console.log("   HMR enabled, serving client from same port");

  return vite;
}
