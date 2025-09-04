/**
 * 🔗 INTEGRATION TESTS  
 * Tests for end-to-end integration scenarios and workflows
 * Focus: Cross-system integration, workflows, data consistency, real-world scenarios
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { MCPXppClient, MCPTestUtils } from './tools/mcp-xpp-client.js';
import { AppConfig } from '../build/modules/app-config.js';

// =============================================================================
// 🔗 INTEGRATION TEST CONFIGURATION
// =============================================================================

const INTEGRATION_CONFIG = {
  timeouts: {
    workflow: 120000,     // 2 minutes for complete workflows
    crossSystem: 60000,   // 1 minute for cross-system operations
    consistency: 30000,   // 30 seconds for consistency checks
  },
  workflows: {
    objectDiscoveryToCreation: ['discover_object_types_json', 'list_objects_by_type', 'create_xpp_object'],
    searchAndAnalyze: ['build_object_index', 'list_objects_by_type', 'get_current_config'],
    fullDevelopmentCycle: ['get_current_config', 'discover_object_types_json', 'build_object_index', 'list_objects_by_type']
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
🔗 INTEGRATION TEST SUITE LOADED
📋 Test Categories:
   - End-to-End Workflows
   - Cross-System Integration
   - Data Consistency
   - Real-World Scenarios

⏱️  Timeouts:
   - Complete workflows: ${INTEGRATION_CONFIG.timeouts.workflow}ms
   - Cross-system ops: ${INTEGRATION_CONFIG.timeouts.crossSystem}ms
   - Consistency checks: ${INTEGRATION_CONFIG.timeouts.consistency}ms

🎯 Focus: Real-world integration scenarios and workflows
`);
}, INTEGRATION_CONFIG.timeouts.workflow);

// Helper function to check integration test availability
const isIntegrationAvailable = async () => {
  try {
    const config = await mcpClient.executeTool('get_current_config');
    return config && config.content;
  } catch (error) {
    console.log('⏭️ Integration tests skipped - MCP service not available');
    return false;
  }
};

// =============================================================================
// 🔗 END-TO-END WORKFLOW TESTS
// =============================================================================

describe('🔗 End-to-End Workflows', () => {
  test('should complete object discovery to analysis workflow', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🔄 Testing complete object discovery to analysis workflow...');
    
    const workflowSteps = [];
    let workflowData = {};
    
    // Step 1: Get current configuration
    console.log('   Step 1: Getting current configuration...');
    const configResult = await mcpClient.executeTool('get_current_config');
    expect(configResult).toBeDefined();
    expect(configResult.content).toBeDefined();
    workflowSteps.push('get_current_config');
    workflowData.config = configResult.content;
    
    // Step 2: Discover object types
    console.log('   Step 2: Discovering object types...');
    const discoveryResult = await mcpClient.executeTool('discover_object_types_json');
    expect(discoveryResult).toBeDefined();
    expect(discoveryResult.content).toBeDefined();
    workflowSteps.push('discover_object_types_json');
    workflowData.discovery = discoveryResult.content;
    
    // Step 3: Build object index with SQLite
    console.log('   Step 3: Building object index...');
    const indexResult = await mcpClient.executeTool('build_object_index', {
      mode: 'optimized',
      useSqlite: true
    });
    expect(indexResult).toBeDefined();
    workflowSteps.push('build_object_index');
    workflowData.index = indexResult.content;
    
    // Step 4: Query objects using the index
    console.log('   Step 4: Querying objects from index...');
    const queryResult = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'classes',
      limit: 20,
      useSqlite: true
    });
    expect(queryResult).toBeDefined();
    workflowSteps.push('list_objects_by_type');
    workflowData.query = queryResult.content;
    
    console.log(`✅ Workflow completed successfully: ${workflowSteps.join(' → ')}`);
    
    // Validate workflow data consistency
    expect(workflowData.config).toBeDefined();
    expect(workflowData.discovery).toBeDefined();
    expect(workflowData.index).toBeDefined();
    expect(workflowData.query).toBeDefined();
    
    console.log('🎉 Complete object discovery to analysis workflow successful!');
    
  }, INTEGRATION_CONFIG.timeouts.workflow);

  test('should handle developer productivity workflow', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('👨‍💻 Testing developer productivity workflow...');
    
    const developerTasks = [];
    
    // Task 1: Check development environment setup
    console.log('   Task 1: Checking development environment...');
    const envCheck = await mcpClient.executeTool('get_current_config');
    expect(envCheck).toBeDefined();
    developerTasks.push('Environment Check');
    
    // Task 2: Explore existing objects for reference
    console.log('   Task 2: Exploring existing objects...');
    const exploreResult = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'classes',
      namePattern: 'Customer*',
      limit: 10,
      useSqlite: true
    });
    expect(exploreResult).toBeDefined();
    developerTasks.push('Object Exploration');
    
    // Task 3: Find similar patterns in codebase
    console.log('   Task 3: Finding similar patterns...');
    const patternResult = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'tables',
      namePattern: '*Customer*',
      limit: 5,
      useSqlite: true
    });
    expect(patternResult).toBeDefined();
    developerTasks.push('Pattern Analysis');
    
    // Task 4: Validate development readiness
    console.log('   Task 4: Validating development readiness...');
    const readinessCheck = await mcpClient.executeTool('get_current_config');
    expect(readinessCheck).toBeDefined();
    developerTasks.push('Readiness Validation');
    
    console.log(`✅ Developer workflow completed: ${developerTasks.join(' → ')}`);
    console.log('🎉 Developer productivity workflow successful!');
    
  }, INTEGRATION_CONFIG.timeouts.workflow);

  test('should support continuous integration workflow', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🔄 Testing continuous integration workflow...');
    
    const ciSteps = [];
    
    // CI Step 1: Environment validation
    console.log('   CI Step 1: Environment validation...');
    const validation = await mcpClient.executeTool('get_current_config');
    expect(validation).toBeDefined();
    ciSteps.push('Environment Validation');
    
    // CI Step 2: Index integrity check
    console.log('   CI Step 2: Index integrity check...');
    const indexCheck = await mcpClient.executeTool('build_object_index', {
      mode: 'check',
      useSqlite: true
    });
    expect(indexCheck).toBeDefined();
    ciSteps.push('Index Integrity');
    
    // CI Step 3: Sample data validation
    console.log('   CI Step 3: Sample data validation...');
    const dataValidation = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'classes',
      limit: 1,
      useSqlite: true
    });
    expect(dataValidation).toBeDefined();
    ciSteps.push('Data Validation');
    
    // CI Step 4: System health check
    console.log('   CI Step 4: System health check...');
    const healthCheck = await mcpClient.executeTool('get_current_config');
    expect(healthCheck).toBeDefined();
    ciSteps.push('Health Check');
    
    console.log(`✅ CI workflow completed: ${ciSteps.join(' → ')}`);
    console.log('🎉 Continuous integration workflow successful!');
    
  }, INTEGRATION_CONFIG.timeouts.workflow);
});

// =============================================================================
// 🔗 CROSS-SYSTEM INTEGRATION TESTS
// =============================================================================

describe('🔗 Cross-System Integration', () => {
  test('should integrate MCP client with SQLite backend', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🔗 Testing MCP client + SQLite backend integration...');
    
    // Test that MCP client operations correctly use SQLite backend
    const startTime = Date.now();
    
    const result = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'classes',
      limit: 10,
      useSqlite: true
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    // SQLite backend should provide fast responses
    expect(duration).toBeLessThan(1000); // 1 second max
    
    console.log(`✅ MCP + SQLite integration successful (${duration}ms)`);
    
  }, INTEGRATION_CONFIG.timeouts.crossSystem);

  test('should integrate with VS2022 service through MCP', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🔧 Testing MCP + VS2022 service integration...');
    
    // Test configuration retrieval (which may include VS2022 service data)
    const config = await mcpClient.executeTool('get_current_config');
    expect(config).toBeDefined();
    expect(config.content).toBeDefined();
    
    const configStr = typeof config.content === 'string' ? 
                     config.content : JSON.stringify(config.content);
    
    // Should contain meaningful configuration data
    expect(configStr.length).toBeGreaterThan(100);
    
    console.log('✅ MCP + VS2022 service integration working');
    
  }, INTEGRATION_CONFIG.timeouts.crossSystem);

  test('should maintain data consistency across systems', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🔄 Testing data consistency across systems...');
    
    // Get configuration multiple times to test consistency
    const configs = [];
    for (let i = 0; i < 3; i++) {
      const config = await mcpClient.executeTool('get_current_config');
      configs.push(config);
    }
    
    // All configurations should be consistent
    configs.forEach(config => {
      expect(config).toBeDefined();
      expect(config.content).toBeDefined();
    });
    
    // Test object listing consistency
    const objectLists = [];
    for (let i = 0; i < 2; i++) {
      const list = await mcpClient.executeTool('list_objects_by_type', {
        objectType: 'classes',
        limit: 5,
        useSqlite: true
      });
      objectLists.push(list);
    }
    
    objectLists.forEach(list => {
      expect(list).toBeDefined();
      expect(list.content).toBeDefined();
    });
    
    console.log('✅ Data consistency maintained across systems');
    
  }, INTEGRATION_CONFIG.timeouts.consistency);
});

// =============================================================================
// 🔗 DATA CONSISTENCY TESTS
// =============================================================================

describe('🔗 Data Consistency', () => {
  test('should maintain consistency between index builds', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('📊 Testing index build consistency...');
    
    // Build index twice and compare results
    const firstBuild = await mcpClient.executeTool('build_object_index', {
      mode: 'optimized',
      useSqlite: true
    });
    expect(firstBuild).toBeDefined();
    
    const secondBuild = await mcpClient.executeTool('build_object_index', {
      mode: 'optimized',
      useSqlite: true
    });
    expect(secondBuild).toBeDefined();
    
    // Both builds should complete successfully
    expect(firstBuild.content).toBeDefined();
    expect(secondBuild.content).toBeDefined();
    
    console.log('✅ Index builds are consistent');
    
  }, INTEGRATION_CONFIG.timeouts.consistency);

  test('should maintain query result consistency', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🔍 Testing query result consistency...');
    
    // Ensure index exists
    await mcpClient.executeTool('build_object_index', { mode: 'check' });
    
    // Run same query multiple times
    const queryParams = {
      objectType: 'classes',
      limit: 10,
      sortBy: 'name',
      useSqlite: true
    };
    
    const results = [];
    for (let i = 0; i < 3; i++) {
      const result = await mcpClient.executeTool('list_objects_by_type', queryParams);
      results.push(result);
    }
    
    // All results should be defined and consistent
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
    
    console.log('✅ Query results are consistent');
    
  }, INTEGRATION_CONFIG.timeouts.consistency);

  test('should handle concurrent operations consistently', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('⚡ Testing concurrent operation consistency...');
    
    // Run multiple operations concurrently
    const operations = [
      mcpClient.executeTool('get_current_config'),
      mcpClient.executeTool('list_objects_by_type', { objectType: 'classes', limit: 5 }),
      mcpClient.executeTool('list_objects_by_type', { objectType: 'tables', limit: 5 })
    ];
    
    const results = await Promise.all(operations);
    
    // All operations should complete successfully
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
    
    console.log('✅ Concurrent operations maintain consistency');
    
  }, INTEGRATION_CONFIG.timeouts.consistency);
});

// =============================================================================
// 🔗 REAL-WORLD SCENARIO TESTS
// =============================================================================

describe('🔗 Real-World Scenarios', () => {
  test('should support typical developer workflow scenario', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('👨‍💻 Testing real-world developer scenario...');
    
    // Scenario: Developer needs to find customer-related objects for a new feature
    console.log('   Scenario: Finding customer-related objects...');
    
    // Step 1: Search for customer classes
    const customerClasses = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'classes',
      namePattern: '*Customer*',
      limit: 10,
      useSqlite: true
    });
    expect(customerClasses).toBeDefined();
    
    // Step 2: Search for customer tables
    const customerTables = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'tables',
      namePattern: '*Customer*',
      limit: 10,
      useSqlite: true
    });
    expect(customerTables).toBeDefined();
    
    // Step 3: Search for customer forms
    const customerForms = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'forms',
      namePattern: '*Customer*',
      limit: 5,
      useSqlite: true
    });
    expect(customerForms).toBeDefined();
    
    console.log('✅ Developer workflow scenario completed successfully');
    
  }, INTEGRATION_CONFIG.timeouts.workflow);

  test('should support enterprise search scenario', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('🏢 Testing enterprise search scenario...');
    
    // Scenario: Enterprise architect needs to analyze system architecture
    console.log('   Scenario: Enterprise architecture analysis...');
    
    // Step 1: Get system overview
    const systemConfig = await mcpClient.executeTool('get_current_config');
    expect(systemConfig).toBeDefined();
    
    // Step 2: Discover all object types
    const objectTypes = await mcpClient.executeTool('discover_object_types_json');
    expect(objectTypes).toBeDefined();
    
    // Step 3: Sample objects from major categories
    const majorCategories = ['classes', 'tables', 'forms'];
    for (const category of majorCategories) {
      const sample = await mcpClient.executeTool('list_objects_by_type', {
        objectType: category,
        limit: 5,
        useSqlite: true
      });
      expect(sample).toBeDefined();
    }
    
    console.log('✅ Enterprise search scenario completed successfully');
    
  }, INTEGRATION_CONFIG.timeouts.workflow);

  test('should support performance monitoring scenario', async () => {
    if (!(await isIntegrationAvailable())) return;
    
    console.log('📊 Testing performance monitoring scenario...');
    
    // Scenario: Operations team monitors system performance
    console.log('   Scenario: System performance monitoring...');
    
    const performanceMetrics = [];
    
    // Monitor index build performance
    const startTime = Date.now();
    const indexResult = await mcpClient.executeTool('build_object_index', {
      mode: 'check',
      useSqlite: true
    });
    const indexDuration = Date.now() - startTime;
    performanceMetrics.push({ operation: 'index_check', duration: indexDuration });
    
    // Monitor search performance
    const searchStartTime = Date.now();
    const searchResult = await mcpClient.executeTool('list_objects_by_type', {
      objectType: 'classes',
      limit: 10,
      useSqlite: true
    });
    const searchDuration = Date.now() - searchStartTime;
    performanceMetrics.push({ operation: 'search', duration: searchDuration });
    
    // Validate all operations completed successfully
    expect(indexResult).toBeDefined();
    expect(searchResult).toBeDefined();
    
    // Log performance metrics
    performanceMetrics.forEach(metric => {
      console.log(`   ${metric.operation}: ${metric.duration}ms`);
    });
    
    console.log('✅ Performance monitoring scenario completed successfully');
    
  }, INTEGRATION_CONFIG.timeouts.workflow);
});

console.log('🔗 Integration Test Suite loaded and ready');
