import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Include test files
    include: ['tests/**/*.{test,spec}.{js,mjs,ts}']
  }
});
