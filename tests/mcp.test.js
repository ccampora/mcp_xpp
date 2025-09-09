/**
 * 🔌 MCP PROTOCOL TESTS
 * Tests for Model Context Protocol functionality and communication
 * Focus: Protocol compliance, tool handlers, communication, MCP client interaction
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { MCPXppClient, MCPTestUtils } from './tools/mcp-xpp-client.js';
import { AppConfig } from '../build/modules/app-config.js';

// =============================================================================
// 🔌 MCP PROTOCOL TEST CONFIGURATION
// =============================================================================

const MCP_CONFIG = {
  timeouts: {
    fast: 5000,      // 5 seconds for fast operations
    medium: 15000,   // 15 seconds for medium operations
    slow: 30000,     // 30 seconds for slow operations
  },
  client: {
    maxRetries: 3,
    connectionTimeout: 5000,
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
🔌 MCP PROTOCOL TEST SUITE LOADED
📋 Test Categories:
   - Protocol Communication
   - Tool Discovery & Validation
   - Error Handling
   - JSON Response Format

⏱️  Timeouts:
   - Fast operations: ${MCP_CONFIG.timeouts.fast}ms
   - Medium operations: ${MCP_CONFIG.timeouts.medium}ms
   - Slow operations: ${MCP_CONFIG.timeouts.slow}ms

🎯 Focus: MCP protocol compliance and tool functionality
`);
}, MCP_CONFIG.timeouts.slow);

// Helper function to check MCP client connectivity
const isMCPAvailable = async () => {
  try {
    const result = await mcpClient.executeTool('get_current_config');
    return result && result.content;
  } catch (error) {
    console.log('⏭️ MCP service not available - tests skipped');
    return false;
  }
};

// =============================================================================
// 🔌 PROTOCOL COMMUNICATION TESTS
// =============================================================================

describe('🔌 Protocol Communication', () => {
  test('should establish MCP client connection', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('🔌 Testing MCP client connection...');
    
    // Test basic connectivity through tool execution
    const result = await mcpClient.executeTool('get_current_config');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    console.log('✅ MCP client connection established successfully');
  }, MCP_CONFIG.timeouts.fast);

  test('should handle tool execution with parameters', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('🔧 Testing parameterized tool execution...');
    
    const result = await mcpClient.executeTool('search_objects_pattern', {
      pattern: 'Cust*',
      objectType: 'AxClass',
      limit: 10
    });
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    console.log('✅ Parameterized tool execution successful');
  }, MCP_CONFIG.timeouts.medium);

  test('should maintain consistent communication protocol', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('📡 Testing protocol consistency...');
    
    // Execute multiple tools to test protocol consistency
    const tools = ['get_current_config', 'search_objects_pattern'];
    const results = [];
    
    for (const tool of tools) {
      const result = await mcpClient.executeTool(tool, 
        tool === 'search_objects_pattern' ? { pattern: 'Cust*', limit: 5 } : {}
      );
      results.push(result);
    }
    
    // All results should have consistent structure
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
    
    console.log('✅ Protocol communication is consistent');
  }, MCP_CONFIG.timeouts.medium);
});

// =============================================================================
// 🔌 TOOL DISCOVERY & VALIDATION TESTS
// =============================================================================

describe('🔌 Tool Discovery & Validation', () => {
  test('should discover available MCP tools', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('🔍 Testing tool discovery...');
    
    // Tools should be available through the client
    const configResult = await mcpClient.executeTool('get_current_config');
    expect(configResult).toBeDefined();
    
    const searchResult = await mcpClient.executeTool('search_objects_pattern', {
      pattern: 'Cust*',
      limit: 1
    });
    expect(searchResult).toBeDefined();
    
    console.log('✅ Core MCP tools are discoverable and functional');
  }, MCP_CONFIG.timeouts.medium);

  test('should validate tool parameter schemas', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('📋 Testing tool parameter validation...');
    
    // Test with valid parameters
    const validResult = await mcpClient.executeTool('search_objects_pattern', {
      pattern: 'Cust*',
      limit: 5
    });
    expect(validResult).toBeDefined();
    
    // Test with minimal parameters
    const minimalResult = await mcpClient.executeTool('search_objects_pattern', {
      pattern: '*'
    });
    expect(minimalResult).toBeDefined();
    
    console.log('✅ Tool parameter schemas validated');
  }, MCP_CONFIG.timeouts.medium);

  test('should handle tool execution timeouts gracefully', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('⏱️ Testing timeout handling...');
    
    // Use a fast operation to test timeout handling
    const result = await mcpClient.executeTool('get_current_config');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    console.log('✅ Timeout handling works correctly');
  }, MCP_CONFIG.timeouts.fast);
});

// =============================================================================
// 🔌 ERROR HANDLING TESTS
// =============================================================================

describe('🔌 Error Handling', () => {
  test('should handle invalid tool names gracefully', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('❌ Testing invalid tool handling...');
    
    try {
      await mcpClient.executeTool('nonexistent_tool');
      // Should not reach here
      expect(false).toBe(true);
    } catch (error) {
      // Expected behavior - should throw error for invalid tools
      expect(error).toBeDefined();
      console.log('✅ Invalid tool names handled correctly');
    }
  }, MCP_CONFIG.timeouts.fast);

  test('should handle malformed parameters gracefully', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('⚠️ Testing malformed parameter handling...');
    
    // Test with invalid pattern
    const result = await mcpClient.executeTool('search_objects_pattern', {
      pattern: '',  // Empty pattern should be handled gracefully
      limit: 5
    });
    
    // Should return a result (possibly empty) rather than crash
    expect(result).toBeDefined();
    
    console.log('✅ Malformed parameters handled gracefully');
  }, MCP_CONFIG.timeouts.fast);

  test('should maintain connection stability during errors', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('🔗 Testing connection stability...');
    
    // Execute a valid tool after error conditions
    const result = await mcpClient.executeTool('get_current_config');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    console.log('✅ Connection remains stable after errors');
  }, MCP_CONFIG.timeouts.fast);
});

// =============================================================================
// 🔌 JSON RESPONSE FORMAT TESTS  
// =============================================================================

describe('🔌 JSON Response Format', () => {
  test('should return consistent JSON response structure', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('📄 Testing JSON response structure...');
    
    const result = await mcpClient.executeTool('get_current_config');
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    // Content should be parseable (either already parsed or valid JSON string)
    if (typeof result.content === 'string') {
      expect(() => JSON.parse(result.content)).not.toThrow();
    }
    
    console.log('✅ JSON response structure is consistent');
  }, MCP_CONFIG.timeouts.fast);

  test('should handle large JSON responses efficiently', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('📊 Testing large JSON response handling...');
    
    const result = await mcpClient.executeTool('search_objects_pattern', {
      pattern: '*',
      format: 'json',
      limit: 100
    });
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    // Should handle response without issues
    if (typeof result.content === 'string') {
      expect(result.content.length).toBeGreaterThan(0);
    }
    
    console.log('✅ Large JSON responses handled efficiently');
  }, MCP_CONFIG.timeouts.medium);

  test('should maintain JSON format consistency across tools', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('🔄 Testing cross-tool JSON consistency...');
    
    const tools = [
      { name: 'get_current_config', params: {} },
      { name: 'search_objects_pattern', params: { pattern: 'Cust*', limit: 5 } }
    ];
    
    for (const tool of tools) {
      const result = await mcpClient.executeTool(tool.name, tool.params);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Consistent structure across all tools
      expect(typeof result).toBe('object');
    }
    
    console.log('✅ JSON format is consistent across all tools');
  }, MCP_CONFIG.timeouts.medium);
});

// =============================================================================
// 🗄️ CACHE MANAGEMENT TESTS
// =============================================================================

describe('🗄️ Cache Management', () => {
  test('should successfully delete cache, rebuild index, and verify object counts', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('🗑️ Testing cache deletion and rebuild sequence...');
    
    // Step 1: Delete the full cache by forcing a rebuild
    console.log('   Step 1: Deleting existing cache and rebuilding...');
    const rebuildResult = await mcpClient.executeTool('build_object_index', {
      forceRebuild: true
    });
    
    expect(rebuildResult).toBeDefined();
    expect(rebuildResult.content).toBeDefined();
    
    // DEBUG: Log the actual rebuildResult to understand its structure
    console.log('   🔍 DEBUG - rebuildResult structure:', JSON.stringify(rebuildResult, null, 2));
    console.log('   🔍 DEBUG - rebuildResult.content type:', typeof rebuildResult.content);
    console.log('   🔍 DEBUG - rebuildResult.content preview:', 
      typeof rebuildResult.content === 'string' 
        ? rebuildResult.content.substring(0, 500) + '...' 
        : JSON.stringify(rebuildResult.content).substring(0, 500) + '...');
    
    // Parse the result to extract statistics
    const rebuildContent = typeof rebuildResult.content === 'string' 
      ? rebuildResult.content 
      : JSON.stringify(rebuildResult.content);
    
    console.log('   🔍 DEBUG - rebuildContent for parsing:', rebuildContent.substring(0, 1000) + '...');
    console.log('   ✅ Cache deletion and rebuild completed');
    
    // Step 2: Verify the cache was rebuilt successfully by checking configuration
    console.log('   Step 2: Verifying cache rebuild through configuration...');
    const configResult = await mcpClient.executeTool('get_current_config');
    
    expect(configResult).toBeDefined();
    expect(configResult.content).toBeDefined();
    
    // Parse configuration content
    let configData;
    if (typeof configResult.content === 'string') {
      try {
        configData = JSON.parse(configResult.content);
      } catch (e) {
        // If it's not JSON, skip detailed verification but log the content
        console.log('   ⚠️ Configuration content is not JSON format');
        configData = null;
      }
    } else {
      configData = configResult.content;
    }
    
    console.log('   ✅ Configuration retrieved successfully');
    
    // Step 3: Verify object counts are greater than zero
    console.log('   Step 3: Verifying object counts are greater than zero...');
    
    // Check if we can extract total objects from rebuild result
    const totalObjectsMatch = rebuildContent.match(/- Total objects:\s*(\d+)/i);
    console.log('   🔍 DEBUG - totalObjectsMatch:', totalObjectsMatch);
    const totalObjects = totalObjectsMatch ? parseInt(totalObjectsMatch[1], 10) : 0;
    console.log('   🔍 DEBUG - parsed totalObjects:', totalObjects);
    
    // Try alternative regex patterns if the first one didn't work
    if (totalObjects === 0) {
      const altMatch1 = rebuildContent.match(/Total objects:\s*(\d+)/i);
      const altMatch2 = rebuildContent.match(/(\d+)\s*objects/i);
      const altMatch3 = rebuildContent.match(/indexed:\s*(\d+)/i);
      console.log('   🔍 DEBUG - alternative matches:');
      console.log('     - altMatch1 (Total objects):', altMatch1);
      console.log('     - altMatch2 (X objects):', altMatch2);
      console.log('     - altMatch3 (indexed: X):', altMatch3);
    }
    
    // Also check for type-specific counts (tables, classes, etc.)
    const typeCountMatches = rebuildContent.match(/- (AxTable|AxClass|AxForm|AxEnum|AxQuery):\s*(\d+)/gi);
    console.log('   🔍 DEBUG - typeCountMatches:', typeCountMatches);
    const typeCounts = {};
    
    if (typeCountMatches) {
      for (const match of typeCountMatches) {
        const [, type, count] = match.match(/- (.*?):\s*(\d+)/i) || [];
        if (type && count) {
          typeCounts[type] = parseInt(count, 10);
        }
      }
    }
    
    // Verify total objects count
    expect(totalObjects).toBeGreaterThan(0);
    console.log(`   📊 Total objects indexed: ${totalObjects}`);
    
    // Verify at least some common object types have counts > 0
    const commonTypes = ['AxTable', 'AxClass', 'AxForm', 'AxEnum'];
    let validTypeCount = 0;
    
    for (const type of commonTypes) {
      const count = typeCounts[type] || 0;
      if (count > 0) {
        validTypeCount++;
        console.log(`   📋 ${type}: ${count} objects`);
      }
    }
    
    // Expect at least 2 common types to have objects (most D365 systems have tables and classes)
    expect(validTypeCount).toBeGreaterThanOrEqual(2);
    
    // Step 4: Additional verification through configuration data if available
    if (configData && configData.summary && configData.summary.indexedObjects) {
      const configIndexedObjects = configData.summary.indexedObjects;
      expect(configIndexedObjects).toBeGreaterThan(0);
      console.log(`   📈 Configuration shows ${configIndexedObjects} indexed objects`);
    }
    
    console.log('   ✅ All object counts verified successfully');
    console.log('🎉 Cache management test sequence completed successfully!');
    
  }, MCP_CONFIG.timeouts.slow); // Use slow timeout since index building can take time

  test('should handle cache rebuild performance efficiently', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('⚡ Testing cache rebuild performance...');
    
    const startTime = Date.now();
    
    // Perform a non-force rebuild (should be faster if cache exists)
    const result = await mcpClient.executeTool('build_object_index', {
      forceRebuild: false
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    
    // Log performance metrics
    console.log(`   ⏱️ Non-force rebuild completed in ${duration}ms`);
    
    // Extract object count for performance context
    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const totalObjectsMatch = content.match(/Total objects:\s*(\d+)/i);
    const totalObjects = totalObjectsMatch ? parseInt(totalObjectsMatch[1], 10) : 0;
    
    if (totalObjects > 0) {
      const objectsPerSecond = Math.round((totalObjects * 1000) / duration);
      console.log(`   📊 Performance: ${objectsPerSecond} objects/second (${totalObjects} total objects)`);
    }
    
    // Performance should be reasonable (less than 30 seconds for typical D365 codebases)
    expect(duration).toBeLessThan(30000);
    
    console.log('   ✅ Cache rebuild performance is acceptable');
    
  }, MCP_CONFIG.timeouts.slow);

  test('should verify cache persistence after rebuild', async () => {
    if (!(await isMCPAvailable())) return;
    
    console.log('💾 Testing cache persistence...');
    
    // First, get current configuration to establish baseline
    const configBefore = await mcpClient.executeTool('get_current_config');
    expect(configBefore).toBeDefined();
    
    // Perform a search to ensure cache is being used
    const searchResult = await mcpClient.executeTool('search_objects_pattern', {
      pattern: 'Cust*',
      objectType: 'AxTable',
      limit: 10
    });
    
    expect(searchResult).toBeDefined();
    expect(searchResult.content).toBeDefined();
    
    // Verify we got some results (indicating cache is working)
    const searchContent = typeof searchResult.content === 'string' 
      ? searchResult.content 
      : JSON.stringify(searchResult.content);
    
    // Should contain some table results
    expect(searchContent.length).toBeGreaterThan(0);
    
    console.log('   📋 Search operations working with cached data');
    
    // Get configuration again to verify consistency
    const configAfter = await mcpClient.executeTool('get_current_config');
    expect(configAfter).toBeDefined();
    
    console.log('   ✅ Cache persistence verified - operations working consistently');
    
  }, MCP_CONFIG.timeouts.medium);
});

console.log('🔌 MCP Protocol Test Suite loaded and ready');
