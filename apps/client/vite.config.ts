import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const USE_HTTPS = true;
const HMR_PROTOCOL = USE_HTTPS ? "wss" : "ws";
const HMR_CLIENT_PORT = USE_HTTPS ? 443 : 5000;

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
    hmr: {
      protocol: HMR_PROTOCOL,
      // host: undefined - let client use window.location.host
      clientPort: HMR_CLIENT_PORT,
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
