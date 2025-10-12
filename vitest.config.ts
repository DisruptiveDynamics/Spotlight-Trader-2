import { defineConfig, defineProject } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      // monorepo aliases (adjust if your structure differs)
      '@shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)),
      '@server': fileURLToPath(new URL('./apps/server/src', import.meta.url)),
      '@client': fileURLToPath(new URL('./apps/client/src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    css: false,
  },
  projects: [
    defineProject({
      test: {
        name: 'server',
        environment: 'node',
        include: ['apps/server/src/**/*.test.ts'],
      },
    }),
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
