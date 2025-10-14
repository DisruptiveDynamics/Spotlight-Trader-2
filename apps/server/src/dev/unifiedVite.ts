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

  // Create Vite dev server in middleware mode
  const vite = await createViteServer({
    root: clientRoot,
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: "spa",
  });

  // Use Vite's middleware for asset transformation
  app.use(vite.middlewares);

  // SPA fallback: serve index.html for non-API, non-WS routes
  app.get("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API and WebSocket routes
    if (url.startsWith("/api") || url.startsWith("/ws") || url.startsWith("/stream") || url.startsWith("/health")) {
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
