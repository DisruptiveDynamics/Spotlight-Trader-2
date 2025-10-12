import { defineConfig, defineProject } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)),
      '@server': fileURLToPath(new URL('./apps/server/src', import.meta.url)),
      '@client': fileURLToPath(new URL('./apps/client/src', import.meta.url)),
    },
  },
  // Shared defaults
  test: {
    globals: true,
    css: false,
  },
  projects: [
    // Server tests (node)
    defineProject({
      test: {
        name: 'server',
        environment: 'node',
        // cover both *.test.* and __tests__ patterns
        include: [
          'apps/server/src/**/*.{test,spec}.{ts,tsx,js,jsx}',
          'apps/server/src/**/__tests__/**/*.{ts,tsx,js,jsx}',
        ],
      },
    }),

    // Client tests (jsdom + setup)
    defineProject({
      test: {
        name: 'client',
        environment: 'jsdom',
        setupFiles: ['./test/setup.client.ts'],
        include: [
          'apps/client/src/**/*.{test,spec}.{ts,tsx,js,jsx}',
          'apps/client/src/**/__tests__/**/*.{ts,tsx,js,jsx}',
        ],
      },
    }),
  ],
});
