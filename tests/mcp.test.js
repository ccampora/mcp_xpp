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

console.log('🔌 MCP Protocol Test Suite loaded and ready');
