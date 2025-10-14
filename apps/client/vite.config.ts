import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Use env var or fallback to 0.0.0.0:8080 (Replit-compatible)
const API_TARGET = process.env.VITE_SERVER_URL || "http://0.0.0.0:8080";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      protocol: "ws",
      host: "0.0.0.0",
      port: 5000,
      path: "/__vite_hmr",
      clientPort: 5000,
    },
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/stream": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: API_TARGET,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
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
