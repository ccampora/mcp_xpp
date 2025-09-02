import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment configuration
    globals: true,
    environment: 'node',
    
    // Test file patterns
    include: [
      'tests/**/*.test.js'
    ],
    
    // Exclude patterns
    exclude: [
      'node_modules/**',
      'build/**',
      'cache/**'
    ],
    
    // Timeout configuration
    testTimeout: 30000,     // 30 seconds default
    hookTimeout: 10000,     // 10 seconds for hooks
    
    // Reporter configuration
    reporter: ['verbose'],
    
    // Coverage configuration (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'build/**',
        '**/*.d.ts'
      ]
    },
    
    // Retry configuration
    retry: 0,  // No retries for cleaner test results
    
    // Serial execution configuration
    threads: false,         // Run tests sequentially within files
    fileParallelism: false, // Run test files sequentially (prevents service connection conflicts)
    
    // Setup files
    setupFiles: [],
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true
  }
});
