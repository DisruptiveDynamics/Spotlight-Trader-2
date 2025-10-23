import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Auto-detect Replit hosted environment
const IS_REPLIT = !!(process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DOMAINS);

// Only enable HTTPS when we're in Replit OR user explicitly sets VITE_HTTPS=1
const USE_HTTPS = process.env.VITE_HTTPS === "1" || IS_REPLIT;

// Extract the public hostname from REPLIT_DOMAINS (format: "host1.repl.co,host2.repl.co")
// In Replit, let the browser use window.location.host - don't specify explicit host
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
    port: 5000,
    strictPort: true,
    hmr: USE_HTTPS
      ? {
          // Replit HTTPS mode: secure WebSocket on port 443
          // Let browser use window.location.host instead of explicit host
          protocol: "wss",
          clientPort: 443,
          path: "/__vite_hmr",
        }
      : {
          // Local dev HTTP mode: use default ws protocol on port 5000
          protocol: "ws",
          path: "/__vite_hmr",
        },
    // NOTE: No proxy config needed - using unified dev server mode
    // (Express serves both API and Vite middleware on port 5000)
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
