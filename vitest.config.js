import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/vitest.setup.js'],
    testTimeout: 15000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    globals: true,
    environment: 'node'
  }
});
