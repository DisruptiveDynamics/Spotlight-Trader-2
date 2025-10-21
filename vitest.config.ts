import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./packages/shared/src", import.meta.url)),
      "@server": fileURLToPath(new URL("./apps/server/src", import.meta.url)),
      "@client": fileURLToPath(new URL("./apps/client/src", import.meta.url)),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    __DEV__: true,
  },
  test: {
    globals: true,
    css: false,
    environment: "node",
    environmentMatchGlobs: [["**/apps/client/**", "jsdom"]],
    setupFiles: ["test/setup.global.ts", "test/setup.react.ts"],
    include: [
      "apps/**/src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "apps/**/src/**/__tests__/**/*.{ts,tsx,js,jsx}",
      "src/**/*.{test,spec}.{ts,tsx,js,jsx}",
      "src/**/__tests__/**/*.{ts,tsx,js,jsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
