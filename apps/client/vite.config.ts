import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Only enable HTTPS when we can derive the public host OR user explicitly sets VITE_HTTPS=1
// Currently only auto-detects Replit - other platforms need explicit VITE_HTTPS=1
const USE_HTTPS = process.env.VITE_HTTPS === "1" || !!process.env.REPLIT_DOMAINS;

// Extract the public hostname from REPLIT_DOMAINS (format: "host1.repl.co,host2.repl.co")
const PUBLIC_HOST = process.env.REPLIT_DOMAINS?.split(",")[0];

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(process.env.VITE_BUILD_ID || ""),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  server: {
    host: true,
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    hmr: USE_HTTPS && PUBLIC_HOST
      ? {
          // HTTPS mode with known public host (Replit): secure WebSocket on port 443
          protocol: "wss",
          host: PUBLIC_HOST,
          clientPort: 443,
          path: "/__vite_hmr",
        }
      : {
          // HTTP mode or local dev: use default Express server behavior
          path: "/__vite_hmr",
        },
    // NOTE: No proxy config needed - using unified dev server mode
    // (Express serves both API and Vite middleware on port 8080)
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["lightweight-charts"],
        },
      },
    },
  },
});
