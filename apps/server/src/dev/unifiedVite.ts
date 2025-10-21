/**
 * Unified Dev Server - Vite Middleware
 * 
 * Attaches Vite dev server as Express middleware for single-port development.
 * This eliminates the need for proxy configuration and inter-process networking.
 */

import type { Application } from "express";
import fs from "fs/promises";
import type { Server } from "http";
import path from "path";
import { createServer as createViteServer } from "vite";

export async function attachViteMiddleware(app: Application, server: Server) {
  const clientRoot = path.resolve(process.cwd(), "../client");
  
  console.log("🔧 Starting Vite in middleware mode...");
  console.log(`   Client root: ${clientRoot}`);

  // Detect HTTPS mode: auto-detect Replit OR explicit VITE_HTTPS override
  const useHostedHttps = !!process.env.REPLIT_DOMAINS || process.env.VITE_HTTPS === "1";
  
  // Build HMR config with single-port design
  const hmrConfig = {
    server, // Always use shared Express server
    ...(useHostedHttps && {
      protocol: "wss" as const,
      clientPort: 443,
    }),
  };
  
  console.log(`   HMR config: protocol=${hmrConfig.protocol || 'default'}, clientPort=${hmrConfig.clientPort || 'default'}, useHTTPS=${useHostedHttps}`);
  
  // Create Vite dev server in middleware mode
  const vite = await createViteServer({
    root: clientRoot,
    server: {
      middlewareMode: true,
      hmr: hmrConfig,
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
