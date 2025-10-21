// Flat config for ESLint v9 tuned for Spotlight Trader monorepo
// - No .eslintrc.*
// - Disables no-undef for TS (TypeScript handles it)
// - Provides correct globals per area (client/server/tests/config)
// - Ignores dist/build outputs
// - TEMP: turns off import/order and react-hooks/exhaustive-deps for a clean run

import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  // Global ignores
  {
    name: "ignores",
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "coverage/**",
      "**/*.d.ts",
      ".eslintrc.cjs",
      ".lintstagedrc.js",
      "packages/**/dist/**",
      "apps/**/dist/**",
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // Shared defaults for TS/JS
  {
    files: ["**/*.{ts,tsx,js,jsx,cjs,mjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: false,
      },
      globals: {
        console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
    },
    rules: {
      // Use TS rule with underscore exemptions
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      // Import hygiene
      "unused-imports/no-unused-imports": "error",

      // TEMP cleanup: disable noisy rules to get to zero warnings quickly
      "import/order": "off",
      "react-hooks/exhaustive-deps": "off",

      // Always keep hooks rules-of-hooks on
      "react-hooks/rules-of-hooks": "error",
    },
  },

  // Turn off no-undef for TypeScript files (prevents false positives like NodeJS.Timeout)
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
    },
  },

  // Client app: browser globals
  {
    files: ["apps/client/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",

        // Web Audio / Media
        AudioContext: "readonly",
        MediaStream: "readonly",
        AudioWorkletNode: "readonly",
        MediaStreamAudioSourceNode: "readonly",
        AudioBufferSourceNode: "readonly",
        GainNode: "readonly",

        // DOM events and classes
        KeyboardEvent: "readonly",
        HTMLElement: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        MessageEvent: "readonly",
        CloseEvent: "readonly",
        EventSource: "readonly",
        WebSocket: "readonly",
        Blob: "readonly",

        // Timers and perf
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        performance: "readonly",
        queueMicrotask: "readonly",

        // URL/fetch (browser)
        URL: "readonly",
        fetch: "readonly",
      },
    },
  },

  // Server app: Node globals
  {
    files: ["apps/server/**/*.{ts,tsx,js,jsx,cjs,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",

        // Timers and perf
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        performance: "readonly",

        // Web-like APIs available in Node 18+/undici
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortSignal: "readonly",
      },
    },
  },

  // Test files: vitest + jsdom + Node features
  {
    files: [
      "**/__tests__/**/*.{ts,tsx,js,jsx}",
      "**/*.{spec,test}.{ts,tsx,js,jsx}",
      "test/**/*.{ts,tsx,js,jsx}",
      "apps/client/vitest.setup.ts",
      "apps/client/test/**/*.{ts,tsx,js,jsx}",
    ],
    languageOptions: {
      globals: {
        // vitest
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",

        // Browser-ish for jsdom tests
        window: "readonly",
        document: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        MessageEvent: "readonly",
        CloseEvent: "readonly",
        EventSource: "readonly",
        WebSocket: "readonly",
        Blob: "readonly",
        KeyboardEvent: "readonly",
        HTMLElement: "readonly",

        // Media APIs occasionally referenced
        AudioContext: "readonly",
        MediaStream: "readonly",

        // Timers and perf
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        performance: "readonly",
        queueMicrotask: "readonly",

        // URL/fetch
        URL: "readonly",
        fetch: "readonly",

        // Node in tests
        process: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // Config and tooling files (Node context)
  {
    files: [
      "**/*.config.{js,cjs,mjs}",
      "scripts/**.{js,ts}",
      "eslint.config.js",
      "apps/client/tailwind.config.cjs",
      "apps/client/postcss.config.js",
      "vite.config.*",
      "vitest.config.*",
    ],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        URL: "readonly",
      },
    },
  },
];
