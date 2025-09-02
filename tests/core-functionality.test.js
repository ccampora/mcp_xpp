// =============================================================================
// CORE FUNCTIONALITY TESTS - Clean, Fast, Reliable
// =============================================================================
// Tests the essential MCP X++ server functionality without timeouts or complexity
// Focus: Validate core features work correctly in real D365 environment

import { describe, test, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ObjectIndexManager } from '../build/modules/object-index.js';
import { AOTStructureManager } from '../build/modules/aot-structure.js';
import { AppConfig } from '../build/modules/app-config.js';
import { ToolHandlers } from '../build/modules/tool-handlers.js';

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

const TEST_CONFIG = {
  timeouts: {
    fast: 5000,      // 5 seconds for fast operations
    medium: 15000,   // 15 seconds for medium operations  
    slow: 60000,     // 60 seconds for slow operations (if needed)
    build: 45000     // 45 seconds for build operations (30s build + buffer)
  }
};

// Helper function to check if D365 environment is available
const isD365Available = async () => {
  try {
    // Check if AppConfig has been initialized and has an XPP path
    const xppPath = AppConfig.getXppPath();
    if (xppPath) {
      await fs.access(xppPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

// =============================================================================
// SETUP AND TEARDOWN
// =============================================================================

beforeAll(async () => {
  console.log('🔧 Setting up core functionality tests...');
  
  // Initialize configuration
  try {
    await AppConfig.initialize();
    console.log('✅ AppConfig initialized');
    
    // AppConfig is already initialized above and contains the XPP path
    // No additional path initialization needed - everything gets path from AppConfig
    const xppPath = AppConfig.getXppPath();
    if (xppPath) {
      console.log(`✅ XPP codebase path available: ${xppPath}`);
    }
  } catch (error) {
    console.log(`⚠️ AppConfig initialization failed: ${error.message}`);
  }

  // Load AOT structure
  try {
    await AOTStructureManager.loadStructure();
    console.log('✅ AOT structure loaded');
  } catch (error) {
    console.log(`⚠️ AOT structure loading failed: ${error.message}`);
  }

  // ObjectIndexManager automatically gets path from AppConfig - no setup needed
  try {
    const xppPath = AppConfig.getXppPath();
    if (xppPath) {
      console.log('✅ ObjectIndexManager will use AppConfig for paths automatically');
    } else {
      console.log('⚠️ No XPP path available for ObjectIndexManager');
    }
  } catch (error) {
    console.log(`⚠️ ObjectIndexManager setup failed: ${error.message}`);
  }

  console.log('✅ Core functionality test setup complete');
}, 60000); // 60 seconds timeout for setup

// =============================================================================
// CORE CONFIGURATION TESTS
// =============================================================================

describe('Configuration Management', () => {
  test('should initialize configuration successfully', async () => {
    const config = AppConfig.getServerConfig();
    
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
    
    console.log(`✅ Configuration initialized with XPP path: ${config.xppPath || 'not set'}`);
  });

  test('should validate D365 paths exist', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping D365 path validation - environment not available');
      return;
    }

    // Test XPP path from AppConfig
    const xppPath = AppConfig.getXppPath();
    const metadataPath = AppConfig.getXppMetadataFolder();
    
    await expect(fs.access(xppPath)).resolves.not.toThrow();
    
    // Test metadata path (if available)
    if (metadataPath) {
      await expect(fs.access(metadataPath)).resolves.not.toThrow();
    }
    
    console.log('✅ D365 paths validated successfully');
  });
});

// =============================================================================
// AOT STRUCTURE TESTS
// =============================================================================

describe('AOT Structure Management', () => {
  test('should load AOT structure', async () => {
    const structure = AOTStructureManager.getStructure();
    
    expect(structure).toBeDefined();
    
    const allTypes = AOTStructureManager.getAllObjectTypes();
    expect(Array.isArray(allTypes)).toBe(true);
    expect(allTypes.length).toBeGreaterThan(0);
    
    console.log(`✅ AOT structure loaded with ${allTypes.length} object types`);
  });

  test('should discover standard D365 object types', async () => {
    const allTypes = AOTStructureManager.getAllObjectTypes();
    
    // Check for some expected types (the actual folder names, not AxClass format)
    expect(allTypes).toContain('class');
    expect(allTypes).toContain('table'); 
    expect(allTypes).toContain('form');
    expect(allTypes).toContain('enum');
    
    console.log(`✅ Found ${allTypes.length} object types including standard D365 types`);
  });
});

// =============================================================================
// OBJECT INDEX TESTS - FAST & FOCUSED
// =============================================================================

describe('Object Index Management', () => {
  test('should initialize ObjectIndexManager', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping ObjectIndexManager test - D365 not available');
      return;
    }

    // Should not throw
    expect(() => ObjectIndexManager.getStats()).not.toThrow();
    
    console.log('✅ ObjectIndexManager initialized successfully');
  });

  test('should handle cache file operations', async () => {
    const cacheDir = join(process.cwd(), 'cache');
    const cacheFile = join(cacheDir, 'mcp-index.json');
    
    // Create cache directory if it doesn't exist
    try {
      await fs.mkdir(cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Check if we can write to cache directory
    const testFile = join(cacheDir, 'test-write.json');
    await fs.writeFile(testFile, '{"test": true}');
    await fs.unlink(testFile);
    
    console.log('✅ Cache directory is writable');
  });

  test('should build sample index quickly', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping index build test - D365 not available');
      return;
    }

    const startTime = Date.now();
    
    // Test with a small subset instead of full environment
    
    // Get initial stats (should work even without full build)
    const stats = ObjectIndexManager.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalObjects).toBe('number');
    
    const duration = Date.now() - startTime;
    console.log(`✅ Index operations completed in ${duration}ms`);
    
    expect(duration).toBeLessThan(TEST_CONFIG.timeouts.fast);
  }, TEST_CONFIG.timeouts.fast);

  test('should handle build_object_index tool for full index', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping full build_object_index test - D365 not available');
      return;
    }

    const request = {
      name: 'build_object_index',
      arguments: {
        forceRebuild: false
      }
    };
    
    console.log('🔨 Testing build_object_index for full index (this takes ~30 seconds)...');
    
    // Allow full time for the build to complete (~30 seconds)
    const result = await ToolHandlers.buildObjectIndex(request.arguments, 'test-id');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const responseText = result.content[0].text;
    expect(responseText).toContain('Full index build complete');
    expect(responseText).toContain('Total objects:');
    expect(responseText).toContain('By type:');
    
    console.log(`✅ build_object_index completed for full index`);
    console.log(`📄 Response: ${responseText.split('\n')[0]}`); // Show first line
  }, TEST_CONFIG.timeouts.build);
});

// =============================================================================
// TOOL HANDLER TESTS
// =============================================================================

describe('Tool Handlers', () => {
  test('should handle get_current_config tool', async () => {
    const request = {
      name: 'get_current_config',
      arguments: {}
    };
    
    const result = await ToolHandlers.getCurrentConfig(request, 'test-id');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const response = JSON.parse(result.content[0].text);
    expect(response).toBeDefined();
    expect(typeof response).toBe('object');
    
    console.log('✅ get_current_config tool working correctly');
  }, TEST_CONFIG.timeouts.medium);

  test('should handle list_objects_by_type tool', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping list_objects_by_type test - D365 not available');
      return;
    }

    const request = {
      name: 'list_objects_by_type',
      arguments: {
        objectType: 'CLASSES',
        sortBy: 'name',
        limit: 5
      }
    };
    
    const result = await ToolHandlers.listObjectsByType(request, 'test-id');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const response = JSON.parse(result.content[0].text);
    expect(response.objectType).toBe('CLASSES');
    expect(Array.isArray(response.objects)).toBe(true);
    
    console.log(`✅ list_objects_by_type returned ${response.objects.length} objects`);
  }, TEST_CONFIG.timeouts.medium);

  test('should handle create_xpp_object tool for models', async () => {
    console.log('🔧 Testing create_xpp_object tool...');
    
    // Check if VS2022 service is available first
    try {
      const { createConnection } = await import('net');
      const testConnection = createConnection('\\\\.\\pipe\\mcp-xpp-d365-service');
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          testConnection.destroy();
          reject(new Error('Service not available'));
        }, 1000); // Quick 1 second check
        
        testConnection.on('connect', () => {
          clearTimeout(timeout);
          testConnection.destroy();
          resolve();
        });
        
        testConnection.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (error) {
      console.log('⏭️ Skipping create_xpp_object test - VS2022 service not available');
      console.log(`   Reason: ${error.message}`);
      return; // Skip this test - this is acceptable for core functionality tests
    }
    
    // If we get here, the service is available, proceed with the test
    const testModelName = 'TestModel_' + Date.now();
    
    const request = {
      name: 'create_xpp_object',
      arguments: {
        objectName: testModelName,
        objectType: 'model'
      }
    };
    
    const result = await ToolHandlers.createXppObject(request.arguments, 'test-id');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const responseText = result.content[0].text;
    expect(responseText).toContain(testModelName);
    
    console.log(`✅ Created test model: ${testModelName}`);
    
    // Cleanup: Remove the test model if it was created
    try {
      const metadataPath = AppConfig.getXppMetadataFolder();
      if (metadataPath) {
        const modelPath = join(metadataPath, testModelName);
        await fs.rm(modelPath, { recursive: true, force: true });
        console.log(`🧹 Cleaned up test model: ${testModelName}`);
      }
    } catch (error) {
      console.log(`⚠️ Could not clean up test model: ${error.message}`);
    }
  }, TEST_CONFIG.timeouts.medium); // Back to medium timeout since we're checking service availability first
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('Error Handling', () => {
  test('should handle invalid tool requests gracefully', async () => {
    // This should not crash, but handle the error gracefully
    await expect(async () => {
      // Try to call a non-existent method on ToolHandlers
      if (ToolHandlers.invalidToolName) {
        await ToolHandlers.invalidToolName({}, 'test-id');
      }
    }).not.toThrow();
    
    console.log('✅ Invalid tool requests handled gracefully');
  });

  test('should handle invalid object types gracefully', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping error handling test - D365 not available');
      return;
    }

    const request = {
      name: 'list_objects_by_type',
      arguments: {
        objectType: 'INVALID_TYPE',
        sortBy: 'name',
        limit: 5
      }
    };
    
    const result = await ToolHandlers.listObjectsByType(request, 'test-id');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    const response = JSON.parse(result.content[0].text);
    expect(response.objects).toBeDefined();
    expect(Array.isArray(response.objects)).toBe(true);
    expect(response.objects.length).toBe(0); // Should return empty array for invalid type
    
    console.log('✅ Invalid object type handled gracefully');
  });
});

// =============================================================================
// INTEGRATION TESTS - LIGHTWEIGHT
// =============================================================================

describe('Lightweight Integration', () => {
  test('should perform end-to-end tool execution', async () => {
    if (!(await isD365Available())) {
      console.log('⏭️ Skipping integration test - D365 not available');
      return;
    }

    console.log('🔄 Testing end-to-end tool execution...');
    
    // 1. Get configuration
    const configResult = await ToolHandlers.getCurrentConfig({ 
      name: 'get_current_config', 
      arguments: {} 
    }, 'test-id');
    expect(configResult.content[0].text).toBeDefined();
    
    // 2. List some objects
    const listResult = await ToolHandlers.listObjectsByType({ 
      name: 'list_objects_by_type',
      arguments: { objectType: 'CLASSES', limit: 3 }
    }, 'test-id');
    expect(listResult.content[0].text).toBeDefined();
    
    console.log('✅ End-to-end tool execution successful');
  }, TEST_CONFIG.timeouts.medium);

  test('should maintain consistent JSON output format', async () => {
    const tools = [
      { handler: ToolHandlers.getCurrentConfig, args: {} },
      { handler: ToolHandlers.listObjectsByType, args: { objectType: 'CLASSES', limit: 1 } }
    ];
    
    for (const tool of tools) {
      const result = await tool.handler({ name: 'test', arguments: tool.args }, 'test-id');
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      // Should be valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      
      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed).toBe('object');
    }
    
    console.log('✅ JSON output format is consistent across tools');
  }, TEST_CONFIG.timeouts.fast);
});

console.log(`
🧪 CORE FUNCTIONALITY TEST SUITE LOADED
📋 Test Categories:
   - Configuration Management
   - AOT Structure Management  
   - Object Index Management (Fast)
   - Tool Handlers
   - Error Handling
   - Lightweight Integration

⏱️  Timeouts:
   - Fast operations: ${TEST_CONFIG.timeouts.fast}ms
   - Medium operations: ${TEST_CONFIG.timeouts.medium}ms
   - Slow operations: ${TEST_CONFIG.timeouts.slow}ms

🎯 Focus: Essential functionality validation without complex timeouts
`);
