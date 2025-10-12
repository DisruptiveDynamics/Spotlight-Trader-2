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
  test: {
    globals: true,
    css: false,
  },
  projects: [
    // Server: pure Node
    defineProject({
      test: {
        name: 'server',
        environment: 'node',
        include: ['apps/server/src/**/*.test.ts'],
      },
    }),

    // Client: jsdom + setup for DOM-ish APIs
    defineProject({
      test: {
        name: 'client',
        environment: 'jsdom',
        include: [
          'apps/client/src/**/*.test.ts',
          'apps/client/src/**/*.test.tsx'
        ],
        setupFiles: ['./test/setup.client.ts'],
      },
    }),
  ],
});
