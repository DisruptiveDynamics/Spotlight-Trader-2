import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// Only enable HTTPS when we can derive the public host OR user explicitly sets VITE_HTTPS=1
// Currently only auto-detects Replit - other platforms need explicit VITE_HTTPS=1
const USE_HTTPS = process.env.VITE_HTTPS === "1" || !!process.env.REPLIT_DOMAINS;

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
    hmr: USE_HTTPS
      ? {
          // HTTPS mode: secure WebSocket on port 443
          // host: true means use window.location.hostname
          protocol: "wss",
          host: true,
          clientPort: 443,
          path: "/__vite_hmr",
        }
      : {
          // HTTP mode: use the Express server directly  
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
