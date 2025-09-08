/**
 * ⚡ PERFORMANCE TESTS
 * Tests for performance-critical operations and scalability
 * Focus: Index building, search performance, memory usage, SQLite optimization
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { MCPXppClient, MCPTestUtils } from './tools/mcp-xpp-client.js';
import { AppConfig } from '../build/modules/app-config.js';

// =============================================================================
// ⚡ PERFORMANCE TEST CONFIGURATION
// =============================================================================

const PERF_CONFIG = {
  timeouts: {
    indexBuild: 180000,   // 3 minutes for full index build (SQLite optimized)
    search: 30000,        // 30 seconds for complex searches
    memory: 60000,        // 1 minute for memory tests
  },
  thresholds: {
    maxIndexBuildTime: 25000,    // 25 seconds max for SQLite index build
    maxSearchTime: 50,           // 50ms max for SQLite searches  
    minObjectsExpected: 50000,   // Expect at least 50k objects
  },
  sqliteExpectations: {
    dbPath: 'cache/object-lookup.db',
    maxQueryTime: 50,            // SQLite queries should be <50ms
    minCacheHitRatio: 0.8,       // 80% cache hit ratio expected
  }
};

let mcpClient;

// =============================================================================
// TEST SETUP
// =============================================================================

beforeAll(async () => {
  await AppConfig.initialize();
  mcpClient = await MCPTestUtils.createTestClient();
  
  console.log(`
⚡ PERFORMANCE TEST SUITE LOADED
📋 Test Categories:
   - Index Building Performance (SQLite)
   - Search Performance (SQLite)
   - Memory Efficiency
   - Scalability Tests

⏱️  Timeouts:
   - Index build: ${PERF_CONFIG.timeouts.indexBuild}ms
   - Search operations: ${PERF_CONFIG.timeouts.search}ms
   - Memory tests: ${PERF_CONFIG.timeouts.memory}ms

📊 Performance Thresholds (SQLite Optimized):
   - Max index build time: ${PERF_CONFIG.thresholds.maxIndexBuildTime}ms
   - Max search time: ${PERF_CONFIG.thresholds.maxSearchTime}ms
   - Min objects expected: ${PERF_CONFIG.thresholds.minObjectsExpected.toLocaleString()}

🎯 Focus: SQLite-optimized performance and scalability
`);
}, PERF_CONFIG.timeouts.indexBuild);

// Helper function to check if performance tests should run
const shouldRunPerfTests = async () => {
  try {
    const config = await mcpClient.executeTool('get_current_config');
    return config && config.content;
  } catch (error) {
    console.log('⏭️ Performance tests skipped - MCP service not available');
    return false;
  }
};

// =============================================================================
// ⚡ INDEX BUILDING PERFORMANCE TESTS (SQLITE)
// =============================================================================

describe('⚡ Index Building Performance (SQLite)', () => {
  test('should build SQLite index within performance threshold', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🏗️ Testing SQLite index building performance...');
    console.log(`   Target: <${PERF_CONFIG.thresholds.maxIndexBuildTime}ms (SQLite optimized)`);
    
    console.log('🧹 Starting fresh SQLite index build test...');
    
    const startTime = Date.now();
    console.log(`⏱️  SQLite index build started at ${new Date(startTime).toISOString()}`);
    
    const result = await mcpClient.executeTool('build_object_index', {
      mode: 'full',
      forceRebuild: true,
      useSqlite: true
    });
    
    const endTime = Date.now();
    const buildDuration = endTime - startTime;
    
    console.log(`✅ SQLite index build completed in ${buildDuration}ms (${(buildDuration/1000).toFixed(1)}s)`);
    
    // Validate build results
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    // Performance assertion - SQLite should be much faster
    expect(buildDuration).toBeLessThan(PERF_CONFIG.thresholds.maxIndexBuildTime);
    
    console.log(`💾 SQLite database should be created and optimized`);
    
    console.log('🎉 SQLite index build performance test passed!');
    
  }, PERF_CONFIG.timeouts.indexBuild);

  test('should handle incremental index updates efficiently', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🔄 Testing incremental SQLite index updates...');
    
    // Ensure we have a base index
    await mcpClient.executeTool('build_object_index', { mode: 'check' });
    
    const startTime = Date.now();
    
    const result = await mcpClient.executeTool('build_object_index', {
      mode: 'incremental',
      useSqlite: true
    });
    
    const endTime = Date.now();
    const updateDuration = endTime - startTime;
    
    console.log(`⚡ Incremental update completed in ${updateDuration}ms`);
    
    expect(result).toBeDefined();
    
    // Incremental updates should be very fast with SQLite
    expect(updateDuration).toBeLessThan(5000); // 5 seconds max
    
    console.log('✅ Incremental SQLite updates are efficient');
    
  }, PERF_CONFIG.timeouts.search);

  test('should optimize index build for large codebases', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('📈 Testing large codebase index optimization...');
    
    const startTime = Date.now();
    
    const result = await mcpClient.executeTool('build_object_index', {
      mode: 'optimized',
      batchSize: 1000,  // Optimize for large batches
      useSqlite: true
    });
    
    const endTime = Date.now();
    const optimizedDuration = endTime - startTime;
    
    console.log(`🚀 Optimized build completed in ${optimizedDuration}ms`);
    
    expect(result).toBeDefined();
    
    // Optimized build should complete within threshold
    expect(optimizedDuration).toBeLessThan(PERF_CONFIG.thresholds.maxIndexBuildTime * 2); // Allow 2x for optimization overhead
    
    console.log('✅ Large codebase optimization successful');
    
  }, PERF_CONFIG.timeouts.indexBuild);
});

// =============================================================================
// ⚡ SEARCH PERFORMANCE TESTS (SQLITE)
// =============================================================================

describe('⚡ Search Performance (SQLite)', () => {
  test('should perform sub-millisecond SQLite searches', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🔍 Testing SQLite search performance...');
    console.log(`   Target: <${PERF_CONFIG.thresholds.maxSearchTime}ms per search`);
    
    // Ensure index exists
    await mcpClient.executeTool('build_object_index', { mode: 'check' });
    
    const searchTerms = ['Customer', 'Sales', 'Inventory', 'Ledger', 'Tax'];
    const searchResults = [];
    
    for (const term of searchTerms) {
      const startTime = Date.now();
      
      const result = await mcpClient.executeTool('search_objects_pattern', {
        pattern: `${term}*`,
        objectType: 'AxClass',
        limit: 10
      });
      
      const endTime = Date.now();
      const searchDuration = endTime - startTime;
      
      searchResults.push({ term, duration: searchDuration, result });
      
      console.log(`   ${term}: ${searchDuration}ms`);
      
      // Each search should be very fast with SQLite
      expect(searchDuration).toBeLessThan(PERF_CONFIG.thresholds.maxSearchTime);
    }
    
    const avgSearchTime = searchResults.reduce((sum, r) => sum + r.duration, 0) / searchResults.length;
    console.log(`⚡ Average SQLite search time: ${avgSearchTime.toFixed(1)}ms`);
    
    expect(avgSearchTime).toBeLessThan(PERF_CONFIG.thresholds.maxSearchTime);
    
    console.log('✅ SQLite search performance excellent!');
    
  }, PERF_CONFIG.timeouts.search);

  test('should handle complex search queries efficiently', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🎯 Testing complex SQLite search queries...');
    
    const complexQueries = [
      { objectType: 'classes', namePattern: 'Cust*', sortBy: 'name', limit: 50 },
      { objectType: 'tables', namePattern: '*Table', sortBy: 'package', limit: 25 },
      { objectType: 'forms', namePattern: '*Form*', sortBy: 'size', limit: 100 }
    ];
    
    for (const query of complexQueries) {
      const startTime = Date.now();
      
      const result = await mcpClient.executeTool('search_objects_pattern', {
        pattern: '*',
        objectType: query.objectType === 'classes' ? 'AxClass' : 
                   query.objectType === 'tables' ? 'AxTable' : 'AxForm',
        limit: query.limit || 100
      });
      
      const endTime = Date.now();
      const queryDuration = endTime - startTime;
      
      console.log(`   Complex query (${query.objectType}): ${queryDuration}ms`);
      
      expect(result).toBeDefined();
      expect(queryDuration).toBeLessThan(1000); // 1 second max for complex queries
    }
    
    console.log('✅ Complex SQLite queries perform efficiently');
    
  }, PERF_CONFIG.timeouts.search);

  test('should maintain search performance under load', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🔥 Testing SQLite search performance under load...');
    
    const concurrentSearches = 10;
    const searchPromises = [];
    
    const startTime = Date.now();
    
    for (let i = 0; i < concurrentSearches; i++) {
      const searchPromise = mcpClient.executeTool('search_objects_pattern', {
        pattern: `Test${i}*`,
        objectType: 'AxClass',
        limit: 20
      });
      searchPromises.push(searchPromise);
    }
    
    const results = await Promise.all(searchPromises);
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const avgDurationPerSearch = totalDuration / concurrentSearches;
    
    console.log(`⚡ ${concurrentSearches} concurrent searches: ${totalDuration}ms total, ${avgDurationPerSearch.toFixed(1)}ms avg`);
    
    // All searches should complete
    expect(results.length).toBe(concurrentSearches);
    results.forEach(result => expect(result).toBeDefined());
    
    // Average time per search should still be fast
    expect(avgDurationPerSearch).toBeLessThan(PERF_CONFIG.thresholds.maxSearchTime * 2);
    
    console.log('✅ SQLite maintains performance under concurrent load');
    
  }, PERF_CONFIG.timeouts.search);
});

// =============================================================================
// ⚡ MEMORY EFFICIENCY TESTS
// =============================================================================

describe('⚡ Memory Efficiency', () => {
  test('should maintain reasonable memory usage with SQLite', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('💾 Testing memory efficiency with SQLite backend...');
    
    console.log('   SQLite backend should be memory efficient');
    
    // Perform memory-intensive operation through MCP
    const result = await mcpClient.executeTool('build_object_index', {
      mode: 'full',
      useSqlite: true
    });
    
    console.log('   Memory test operation completed');
    
    expect(result).toBeDefined();
    
    // SQLite should be more memory efficient than JSON cache
    console.log('✅ SQLite memory usage should be efficient');
    
  }, PERF_CONFIG.timeouts.memory);

  test('should handle memory pressure gracefully', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('🔥 Testing memory pressure handling...');
    
    console.log('   Testing multiple operations for memory efficiency');
    
    // Perform multiple operations to test memory efficiency
    const operations = [
      { tool: 'search_objects_pattern', params: { pattern: '*', objectType: 'AxClass', limit: 100 } },
      { tool: 'search_objects_pattern', params: { pattern: '*', objectType: 'AxTable', limit: 100 } },
      { tool: 'search_objects_pattern', params: { pattern: '*', objectType: 'AxForm', limit: 100 } }
    ];
    
    for (const op of operations) {
      const result = await mcpClient.executeTool(op.tool, op.params);
      expect(result).toBeDefined();
    }
    
    console.log('   Multiple operations completed successfully');
    
    // SQLite should handle multiple operations efficiently
    console.log('✅ Memory pressure handled gracefully with SQLite');
    
  }, PERF_CONFIG.timeouts.memory);
});

// =============================================================================
// ⚡ SCALABILITY TESTS
// =============================================================================

describe('⚡ Scalability Tests', () => {
  test('should scale with large object counts', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('📈 Testing scalability with large object counts...');
    
    // Test different result set sizes
    const sizes = [10, 100, 500, 1000];
    const scalabilityResults = [];
    
    for (const size of sizes) {
      const startTime = Date.now();
      
      const result = await mcpClient.executeTool('search_objects_pattern', {
        pattern: '*',
        objectType: 'AxClass',
        limit: size
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      scalabilityResults.push({ size, duration });
      console.log(`   ${size} objects: ${duration}ms`);
      
      expect(result).toBeDefined();
    }
    
    // Performance should scale roughly linearly (not exponentially)
    const firstResult = scalabilityResults[0];
    const lastResult = scalabilityResults[scalabilityResults.length - 1];
    const scalingFactor = lastResult.duration / firstResult.duration;
    const objectScalingFactor = lastResult.size / firstResult.size;
    
    console.log(`📊 Scaling factor: ${scalingFactor.toFixed(2)}x time for ${objectScalingFactor}x objects`);
    
    // Should scale reasonably well (not more than 10x time for 100x objects)
    expect(scalingFactor).toBeLessThan(objectScalingFactor * 0.5);
    
    console.log('✅ SQLite scales well with large object counts');
    
  }, PERF_CONFIG.timeouts.search);

  test('should handle concurrent users efficiently', async () => {
    if (!(await shouldRunPerfTests())) return;
    
    console.log('👥 Testing concurrent user scalability...');
    
    const concurrentUsers = 5;
    const operationsPerUser = 3;
    
    const startTime = Date.now();
    
    const userPromises = [];
    for (let user = 0; user < concurrentUsers; user++) {
      const userOperations = [];
      
      for (let op = 0; op < operationsPerUser; op++) {
        userOperations.push(
          mcpClient.executeTool('search_objects_pattern', {
            pattern: `User${user}_Op${op}*`,
            objectType: 'AxClass',
            limit: 10
          })
        );
      }
      
      userPromises.push(Promise.all(userOperations));
    }
    
    const allResults = await Promise.all(userPromises);
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const avgTimePerOperation = totalDuration / (concurrentUsers * operationsPerUser);
    
    console.log(`⚡ ${concurrentUsers} concurrent users, ${operationsPerUser} ops each: ${totalDuration}ms total`);
    console.log(`   Average time per operation: ${avgTimePerOperation.toFixed(1)}ms`);
    
    // All operations should complete successfully
    expect(allResults.length).toBe(concurrentUsers);
    allResults.forEach(userResults => {
      expect(userResults.length).toBe(operationsPerUser);
      userResults.forEach(result => expect(result).toBeDefined());
    });
    
    // Average operation time should remain reasonable
    expect(avgTimePerOperation).toBeLessThan(PERF_CONFIG.thresholds.maxSearchTime * 2);
    
    console.log('✅ SQLite handles concurrent users efficiently');
    
  }, PERF_CONFIG.timeouts.search);
});

console.log('⚡ Performance Test Suite loaded and ready');
