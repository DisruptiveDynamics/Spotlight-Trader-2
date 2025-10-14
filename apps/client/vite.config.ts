import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
