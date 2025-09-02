// =============================================================================
// PERFORMANCE TESTS - Optional Long-Running Operations
// =============================================================================
// Tests performance-intensive operations like full index building
// These tests are separate because they take significant time
// Run with: npm run test:performance

import { describe, test, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ObjectIndexManager } from '../build/modules/object-index.js';
import { AOTStructureManager } from '../build/modules/aot-structure.js';
import { AppConfig } from '../build/modules/app-config.js';
import { ToolHandlers } from '../build/modules/tool-handlers.js';
import { toLowerCase } from 'zod/v4';

// =============================================================================
// PERFORMANCE TEST CONFIGURATION
// =============================================================================

const PERF_CONFIG = {
  timeouts: {
    fullIndex: 300000,    // 5 minutes for full index build
    largeQuery: 60000,    // 1 minute for large queries
  },
  thresholds: {
    minObjectsExpected: 50000,  // Expect at least 50k objects in full D365
    minTypesExpected: 20,       // Expect at least 20 object types
    maxIndexBuildTime: 180000,  // Max 3 minutes for index build
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

  console.log('✅ Core functionality test setup complete');
}, 60000); // 60 seconds timeout for setup

// Helper function to check if performance tests should run
const shouldRunPerfTests = async () => {
  try {
    const xppPath = AppConfig.getXppPath();
    if (xppPath) {
      await fs.access(xppPath);
      return true;
    }
    return false;
  } catch {
    console.log('⏭️ Performance tests skipped - D365 environment not available');
    return false;
  }
};

// =============================================================================
// FULL INDEX BUILDING TESTS
// =============================================================================

describe('Full Index Building Performance', () => {
  test('should build complete D365 index within time limit', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🚀 Starting full index build performance test...');
    console.log('   This may take several minutes...');
    
    // Initialize
    await AOTStructureManager.loadStructure();
    
    // Clear any existing cache to ensure fresh build
    const cacheFile = join(process.cwd(), 'cache', 'mcp-index.json');
    try {
      await fs.unlink(cacheFile);
      console.log('🧹 Cleared existing cache for fresh build');
    } catch (error) {
      console.log('📝 No existing cache to clear');
    }
    
    // Build full index with timing
    const startTime = Date.now();
    console.log(`⏱️  Index build started at ${new Date(startTime).toISOString()}`);
    
    await ObjectIndexManager.buildFullIndex(true);
    
    const endTime = Date.now();
    const buildDuration = endTime - startTime;
    
    console.log(`✅ Index build completed in ${buildDuration}ms (${(buildDuration/1000).toFixed(1)}s)`);
    
    // Validate build results
    const stats = ObjectIndexManager.getStats();
    
    console.log('📊 Build Results:');
    console.log(`   📈 Total objects: ${stats.totalObjects.toLocaleString()}`);
    console.log(`   📋 Object types: ${Object.keys(stats.byType).length}`);
    console.log(`   ⏱️  Build time: ${(buildDuration/1000).toFixed(1)} seconds`);
    
    // Performance assertions
    expect(buildDuration).toBeLessThan(PERF_CONFIG.thresholds.maxIndexBuildTime);
    expect(stats.totalObjects).toBeGreaterThan(PERF_CONFIG.thresholds.minObjectsExpected);
    expect(Object.keys(stats.byType).length).toBeGreaterThan(PERF_CONFIG.thresholds.minTypesExpected);
    
    // Verify cache file was created and has reasonable size
    const cacheStats = await fs.stat(cacheFile);
    expect(cacheStats.size).toBeGreaterThan(1024); // At least 1KB
    console.log(`💾 Cache file created: ${Math.round(cacheStats.size / 1024).toLocaleString()}KB`);
    
    // Show top object types
    const topTypes = Object.entries(stats.byType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    console.log('🏆 Top 10 Object Types:');
    topTypes.forEach(([type, count], index) => {
      console.log(`   ${index + 1}. ${type}: ${count.toLocaleString()}`);
    });
    
    console.log('🎉 Full index build performance test completed successfully!');
    
  }, PERF_CONFIG.timeouts.fullIndex);

  test('should handle build_object_index tool with full performance', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🔧 Testing build_object_index tool performance...');
    
    const request = {
      name: 'build_object_index',
      arguments: {
        forceRebuild: true
      }
    };
    
    const startTime = Date.now();
    const result = await ToolHandlers.buildObjectIndex(request.arguments, 'perf-test-id');
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    console.log(`✅ Tool completed in ${duration}ms (${(duration/1000).toFixed(1)}s)`);
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    
    const responseText = result.content[0].text;
    expect(responseText.toLowerCase()).toContain('index build complete');

    console.log(`📊 Tool response: ${responseText.split('\n')[0]}`);
    console.log(`⚡ Tool performance: ${(duration/1000).toFixed(1)} seconds`);
    
  }, PERF_CONFIG.timeouts.fullIndex);
});

// =============================================================================
// LARGE QUERY PERFORMANCE TESTS  
// =============================================================================

describe('Large Query Performance', () => {
  test('should handle large object queries efficiently', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('📊 Testing large query performance...');
    
    // Ensure index is loaded
    await ObjectIndexManager.loadIndex();
    const stats = ObjectIndexManager.getStats();
    
    if (stats.totalObjects < 1000) {
      console.log('⏭️ Skipping large query test - insufficient objects in index');
      return;
    }
    
    const testCases = [
      { type: 'CLASSES', limit: 1000 },
      { type: 'TABLES', limit: 500 },
      { type: 'FORMS', limit: 300 },
      { type: 'ENUMS', limit: 200 }
    ];
    
    for (const testCase of testCases) {
      const startTime = Date.now();
      
      const result = await ToolHandlers.listObjectsByType({
        name: 'list_objects_by_type',
        arguments: {
          objectType: testCase.type,
          sortBy: 'name',
          limit: testCase.limit
        }
      }, 'perf-test-id');
      
      const endTime = Date.now();
      const queryDuration = endTime - startTime;
      
      const response = JSON.parse(result.content[0].text);
      
      console.log(`   ${testCase.type}: ${response.objects.length} objects in ${queryDuration}ms`);
      
      // Query should complete quickly
      expect(queryDuration).toBeLessThan(5000); // 5 seconds max
      expect(Array.isArray(response.objects)).toBe(true);
    }
    
    console.log('✅ Large query performance test completed');
    
  }, PERF_CONFIG.timeouts.largeQuery);
});

// =============================================================================
// MEMORY USAGE TESTS
// =============================================================================

describe('Memory Usage', () => {
  test('should maintain reasonable memory usage during large operations', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('💾 Testing memory usage during large operations...');
    
    const initialMemory = process.memoryUsage();
    console.log(`   Initial memory: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
    
    // Perform memory-intensive operation
    await ObjectIndexManager.loadIndex();
    const stats = ObjectIndexManager.getStats();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryIncreaseMB = Math.round(memoryIncrease / 1024 / 1024);
    
    console.log(`   Final memory: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    console.log(`   Memory increase: ${memoryIncreaseMB}MB`);
    console.log(`   Objects loaded: ${stats.totalObjects.toLocaleString()}`);
    
    // Memory usage should be reasonable (less than 500MB increase for typical operations)
    expect(memoryIncreaseMB).toBeLessThan(500);
    
    console.log('✅ Memory usage within acceptable limits');
  });
});

console.log(`
🚀 PERFORMANCE TEST SUITE LOADED
📋 Test Categories:
   - Full Index Building Performance
   - Large Query Performance  
   - Memory Usage

⏱️  Timeouts:
   - Full index build: ${PERF_CONFIG.timeouts.fullIndex / 1000}s
   - Large queries: ${PERF_CONFIG.timeouts.largeQuery / 1000}s

🎯 Thresholds:
   - Min objects expected: ${PERF_CONFIG.thresholds.minObjectsExpected.toLocaleString()}
   - Min types expected: ${PERF_CONFIG.thresholds.minTypesExpected}
   - Max build time: ${PERF_CONFIG.thresholds.maxIndexBuildTime / 1000}s

⚠️  Note: These tests are resource-intensive and may take several minutes
`);
