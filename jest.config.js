export default {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'build/**/*.js',
    '!build/**/*.test.js',
    '!build/**/*.spec.js'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Timeout for tests (increased for MCP operations)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Fail fast on first error
  bail: false,

  // Maximum number of concurrent test suites
  maxConcurrency: 1,

  // Run tests serially (important for MCP server tests)
  maxWorkers: 1,

  // ES modules support
  preset: null,
  transform: {},
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json', 'mjs']
};
