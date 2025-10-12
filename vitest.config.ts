import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      // keep aliases if you use them in tests
      '@shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)),
      '@server': fileURLToPath(new URL('./apps/server/src', import.meta.url)),
      '@client': fileURLToPath(new URL('./apps/client/src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    css: false,

    // Default to node; we'll switch to jsdom for client paths below
    environment: 'node',

    // Route env by file path (reliable & simple)
    environmentMatchGlobs: [
      ['**/apps/client/**', 'jsdom'],
    ],

    // Always run our safety setup (works in both envs)
    setupFiles: ['test/setup.global.ts'],

    // Make sure Vitest finds your tests in BOTH apps
    include: [
      'apps/**/src/**/*.{test,spec}.{ts,tsx,js,jsx}',
      'apps/**/src/**/__tests__/**/*.{ts,tsx,js,jsx}',
      // in case your client moved tests under apps/client/src/...
      'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
      'src/**/__tests__/**/*.{ts,tsx,js,jsx}',
    ],
  },
});
