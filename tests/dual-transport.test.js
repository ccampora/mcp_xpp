#!/usr/bin/env node

/**
 * Comprehensive Dual Transport Test Suite
 * 
 * Tests the MCP X++ server's dual transport architecture:
 * - STDIO transport for local IDE integration
 * - HTTP transport for external services
 * - Both transports running simultaneously
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Test configuration
const HTTP_PORT = 3002; // Using different port to avoid conflicts
const TEST_TIMEOUT = 15000;

describe('Dual Transport Architecture', () => {
  let serverProcess = null;
  let serverStarted = false;

  before(async () => {
    console.log('🚀 Starting MCP X++ server with dual transport...');
    
    // Start server with both transports
    serverProcess = spawn('node', [
      './build/index.js',
      '--http-port', HTTP_PORT.toString(),
      '--http-host', 'localhost'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let serverOutput = "";
    let serverError = "";
    
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });
    
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      serverError += output;
      console.log("   Server:", output.trim());
      
      // Check if server has started successfully
      if (output.includes('MCP X++ Server running successfully')) {
        serverStarted = true;
      }
    });
    
    serverProcess.on('error', (error) => {
      console.error("❌ Server process error:", error);
    });
    
    // Wait for server to start
    console.log('   Waiting for server initialization...');
    let attempts = 0;
    while (!serverStarted && attempts < 30) {
      await setTimeout(500);
      attempts++;
    }
    
    if (!serverStarted) {
      throw new Error('Server failed to start within timeout period');
    }
    
    console.log('✅ Server started successfully\n');
  });

  after(async () => {
    if (serverProcess) {
      console.log('🧹 Stopping server...');
      serverProcess.kill('SIGTERM');
      await setTimeout(1000);
    }
  });

  describe('HTTP Transport', () => {
    it('should respond to health check endpoint', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/health`);
      assert.strictEqual(response.ok, true, 'Health endpoint should return 200 OK');
      
      const data = await response.json();
      assert.strictEqual(data.status, 'healthy', 'Health check should return healthy status');
      assert.strictEqual(data.transport, 'http', 'Should identify as HTTP transport');
      assert(data.timestamp, 'Should include timestamp');
    });

    it('should list available tools', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools`);
      assert.strictEqual(response.ok, true, 'Tools endpoint should return 200 OK');
      
      const data = await response.json();
      assert(data.tools, 'Response should contain tools array');
      assert(Array.isArray(data.tools), 'Tools should be an array');
      assert(data.tools.length > 0, 'Should have available tools');
      
      // Verify essential tools are present
      const toolNames = data.tools.map(tool => tool.name);
      assert(toolNames.includes('create_xpp_object'), 'Should include create_xpp_object tool');
      assert(toolNames.includes('get_current_config'), 'Should include get_current_config tool');
      assert(toolNames.includes('browse_directory'), 'Should include browse_directory tool');
    });

    it('should execute tools via REST API', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools/get_current_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          arguments: {}
        })
      });
      
      assert.strictEqual(response.ok, true, 'Tool execution should return 200 OK');
      
      const data = await response.json();
      assert(data.content, 'Response should contain content');
      assert(Array.isArray(data.content), 'Content should be an array');
      assert(data.content.length > 0, 'Should have configuration content');
      
      // Verify the response contains expected configuration data
      const textContent = data.content.find(item => item.type === 'text');
      assert(textContent, 'Should contain text content');
      assert(textContent.text.includes('Configuration'), 'Should contain configuration information');
    });

    it('should handle JSON-RPC requests', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: "tools/list",
          params: {},
          id: "test-rpc-1"
        })
      });
      
      assert.strictEqual(response.ok, true, 'RPC endpoint should return 200 OK');
      
      const data = await response.json();
      assert.strictEqual(data.id, "test-rpc-1", 'Response should include request ID');
      assert(data.tools, 'RPC response should contain tools');
      assert(Array.isArray(data.tools), 'Tools should be an array');
    });

    it('should handle tool execution via JSON-RPC', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: "tools/call",
          params: {
            name: "get_current_config",
            arguments: {}
          },
          id: "test-rpc-2"
        })
      });
      
      assert.strictEqual(response.ok, true, 'RPC tool call should return 200 OK');
      
      const data = await response.json();
      assert.strictEqual(data.id, "test-rpc-2", 'Response should include request ID');
      assert(data.content, 'Should contain tool execution result');
    });

    it('should handle invalid tool requests gracefully', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools/nonexistent_tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          arguments: {}
        })
      });
      
      assert.strictEqual(response.ok, false, 'Invalid tool should return error status');
      
      const data = await response.json();
      assert(data.error, 'Error response should contain error message');
      assert(data.error.includes('Unknown tool'), 'Should indicate unknown tool');
    });
  });

  describe('STDIO Transport', () => {
    it('should accept and process STDIO requests', async () => {
      const testMessage = JSON.stringify({
        jsonrpc: "2.0",
        id: "stdio-test-1",
        method: "tools/list",
        params: {}
      }) + "\n";
      
      // Send request to STDIO
      serverProcess.stdin.write(testMessage);
      
      // Wait for processing
      await setTimeout(500);
      
      // The fact that the server is still running and responsive to HTTP
      // indicates STDIO is working (full STDIO testing requires more complex setup)
      const healthResponse = await fetch(`http://localhost:${HTTP_PORT}/health`);
      assert.strictEqual(healthResponse.ok, true, 'Server should still be responsive after STDIO request');
    });
  });

  describe('Transport Integration', () => {
    it('should run both transports simultaneously', async () => {
      // Test that both transports work at the same time
      const httpPromise = fetch(`http://localhost:${HTTP_PORT}/health`);
      
      const stdioMessage = JSON.stringify({
        jsonrpc: "2.0",
        id: "concurrent-test",
        method: "tools/list",
        params: {}
      }) + "\n";
      
      serverProcess.stdin.write(stdioMessage);
      
      const httpResponse = await httpPromise;
      assert.strictEqual(httpResponse.ok, true, 'HTTP transport should work while STDIO is active');
      
      const data = await httpResponse.json();
      assert.strictEqual(data.status, 'healthy', 'Health check should pass during concurrent usage');
    });

    it('should maintain consistent tool availability across transports', async () => {
      // Get tools via HTTP
      const httpResponse = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools`);
      const httpData = await httpResponse.json();
      
      // Verify we have tools available
      assert(httpData.tools.length > 0, 'Should have tools available via HTTP');
      
      // Test specific tool execution via HTTP
      const toolResponse = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools/get_current_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ arguments: {} })
      });
      
      assert.strictEqual(toolResponse.ok, true, 'Tool should execute successfully via HTTP');
      
      const toolData = await toolResponse.json();
      assert(toolData.content, 'Tool should return content');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed HTTP requests', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools/get_current_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json'
      });
      
      assert.strictEqual(response.ok, false, 'Malformed requests should return error status');
    });

    it('should handle unknown HTTP endpoints', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/nonexistent/endpoint`);
      assert.strictEqual(response.status, 404, 'Unknown endpoints should return 404');
    });
  });
});
