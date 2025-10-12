import { defineConfig, defineProject } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  // Common (both projects)
  resolve: {
    alias: {
      // Map @shared/* to your shared src (adjust if your path differs)
      '@shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    css: false,
  },
  projects: [
    // Server tests -> Node env
    defineProject({
      test: {
        name: 'server',
        environment: 'node',
        include: ['apps/server/src/**/*.test.ts'],
        setupFiles: [],
      },
    }),
    // Client tests -> jsdom env with setup shims
    defineProject({
      test: {
        name: 'client',
        environment: 'jsdom',
        include: ['apps/client/src/**/*.test.ts', 'apps/client/src/**/*.test.tsx'],
        setupFiles: ['./test/setup.client.ts'],
      },
    }),
  ],
});
