import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // server-only throws outside a React Server environment, which a test runner is not.
      'server-only': fileURLToPath(new URL('./tests/server-only.ts', import.meta.url)),
    },
  },
  test: {
    globalSetup: './tests/globalSetup.ts',
    exclude: ['tests/e2e/**', '**/node_modules/**'],
    // The first run downloads the in-memory MongoDB binary.
    hookTimeout: 120_000,
  },
});
