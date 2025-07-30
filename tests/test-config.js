/**
 * Test configuration module for integration tests
 * Centralizes test-specific paths and environment variable handling
 */

/**
 * Test configuration with environment variable support for better portability
 */
export const TEST_CONFIG = {
  // Use environment variable for writable metadata path, fallback to default
  WRITABLE_METADATA_PATH: process.env.XPP_METADATA_FOLDER || 
                          process.env.WRITABLE_METADATA_PATH || 
                          "C:\\CustomXppMetadata1x4ye02p.ocz",
  
  // Default D365 codebase path (typically from mcp.json)
  DEFAULT_XPP_PATH: process.env.XPP_CODEBASE_PATH || null,
  
  // Test timeouts
  DEFAULT_TIMEOUT: 30000,
  LONG_TIMEOUT: 60000
};

/**
 * Initialize test configuration and log warnings for missing environment variables
 */
export function initializeTestConfig() {
  // Log configuration warnings for better test debugging
  if (!process.env.XPP_METADATA_FOLDER && !process.env.WRITABLE_METADATA_PATH) {
    console.warn('⚠️ Environment variables XPP_METADATA_FOLDER/WRITABLE_METADATA_PATH not set. Using default path.');
  }

  if (!process.env.XPP_CODEBASE_PATH) {
    console.warn('⚠️ Environment variable XPP_CODEBASE_PATH not set. Will use mcp.json configuration.');
  }
  
  console.log(`🔧 Test config initialized - Writable metadata path: ${TEST_CONFIG.WRITABLE_METADATA_PATH}`);
}

/**
 * Get the argument array for AppConfig.initialize() with configurable paths
 */
export function getTestArgs(xppPath, metadataPath = TEST_CONFIG.WRITABLE_METADATA_PATH) {
  return [
    'node', 'index.js',
    '--xpp-path', xppPath,
    '--xpp-metadata-folder', metadataPath
  ];
}
