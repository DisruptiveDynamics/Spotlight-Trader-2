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
  test: { globals: true, css: false },

  projects: [
    defineProject({
      name: 'server',
      root: fileURLToPath(new URL('./apps/server', import.meta.url)),
      test: {
        environment: 'node',
        include: [
          'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
          'src/**/__tests__/**/*.{ts,tsx,js,jsx}',
        ],
      },
    }),

    defineProject({
      name: 'client',
      root: fileURLToPath(new URL('./apps/client', import.meta.url)),
      test: {
        environment: 'jsdom',
        setupFiles: ['../../test/setup.client.ts'], // path from apps/client/
        include: [
          'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
          'src/**/__tests__/**/*.{ts,tsx,js,jsx}',
        ],
      },
    }),
  ],
});
