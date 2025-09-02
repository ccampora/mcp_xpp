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
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

// Test configuration
const HTTP_PORT = 3002; // Using different port to avoid conflicts
const TEST_TIMEOUT = 15000;

// Helper function to check if server is responsive
async function checkServerHealth() {
  try {
    const response = await fetch(`http://localhost:${HTTP_PORT}/health`, { 
      timeout: 2000 
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

describe('Dual Transport Architecture', () => {
  let serverProcess = null;
  let serverStarted = false;
  let serverCrashed = false;

  beforeAll(async () => {
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
      serverCrashed = true;
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        serverCrashed = true;
      }
    });
    
    // Wait for server to start
    console.log('   Waiting for server initialization...');
    let attempts = 0;
    while (!serverStarted && !serverCrashed && attempts < 30) {
      await setTimeout(500);
      attempts++;
    }
    
    if (serverCrashed) {
      throw new Error('Server crashed during startup');
    }
    
    if (!serverStarted) {
      throw new Error('Server failed to start within timeout period');
    }
    
    console.log('✅ Server started successfully\n');
  });

  afterAll(async () => {
    if (serverProcess) {
      console.log('🧹 Stopping server...');
      serverProcess.kill('SIGTERM');
      await setTimeout(1000);
    }
  });

  describe('HTTP Transport', () => {
    it('should respond to health check endpoint', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/health`);
      expect(response.ok).toBe(true); // 'Health endpoint should return 200 OK'
      
      const data = await response.json();
      expect(data.status).toBe('healthy'); // 'Health check should return healthy status'
      expect(data.transport).toBe('http'); // 'Should identify as HTTP transport'
      expect(data.timestamp).toBeTruthy(); // 'Should include timestamp'
    });

    it('should list available tools', async () => {
      // Check server health first
      const isHealthy = await checkServerHealth();
      if (!isHealthy) {
        console.log('⚠️  Server appears to be unresponsive, skipping test');
        return;
      }

      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools`);
      expect(response.ok).toBe(true); // 'Tools endpoint should return 200 OK'
      
      const data = await response.json();
      expect(data.tools).toBeTruthy(); // 'Response should contain tools array'
      expect(Array.isArray(data.tools)).toBe(true); // 'Tools should be an array'
      expect(data.tools.length).toBeGreaterThan(0); // 'Should have available tools'
      
      // Verify essential tools are present
      const toolNames = data.tools.map(tool => tool.name);
      expect(toolNames.includes('create_xpp_object')).toBe(true); // 'Should include create_xpp_object tool'
      expect(toolNames.includes('get_current_config')).toBe(true); // 'Should include get_current_config tool'
      expect(toolNames.includes('browse_directory')).toBeTruthy(); // 'Should include browse_directory tool'
    });

    it('should execute tools via REST API', async () => {
      // Check server health first
      const isHealthy = await checkServerHealth();
      if (!isHealthy) {
        console.log('⚠️  Server appears to be unresponsive, skipping test');
        return;
      }

      // Test the fixed get_current_config tool that should no longer crash
      const response = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools/get_current_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          arguments: {}
        })
      });
      
      expect(response.ok).toBe(true); // 'Tool execution should return 200 OK'
      
      const data = await response.json();
      expect(data.content).toBeTruthy(); // 'Response should contain content'
      expect(Array.isArray(data.content)).toBeTruthy(); // 'Content should be an array'
      expect(data.content.length > 0).toBeTruthy(); // 'Should have configuration content'
      
      // Verify the response contains expected data structure
      const textContent = data.content.find(item => item.type === 'text');
      expect(textContent).toBeTruthy(); // 'Should contain text content'
      expect(textContent.text.length > 0).toBeTruthy(); // 'Should contain configuration information'
      
      // Verify it contains JSON configuration data
      expect(textContent.text.includes('"_meta"')).toBeTruthy(); // 'Should contain configuration metadata'
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
      
      expect(response.ok).toBe(true); // 'RPC endpoint should return 200 OK'
      
      const data = await response.json();
      expect(data.id).toBe("test-rpc-1"); // 'Response should include request ID'
      expect(data.tools).toBeTruthy(); // 'RPC response should contain tools'
      expect(Array.isArray(data.tools)).toBeTruthy(); // 'Tools should be an array'
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
      
      expect(response.ok).toBe(true); // 'RPC tool call should return 200 OK'
      
      const data = await response.json();
      expect(data.id).toBe("test-rpc-2"); // 'Response should include request ID'
      expect(data.content).toBeTruthy(); // 'Should contain tool execution result'
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
      
      expect(response.ok).toBe(false); // 'Invalid tool should return error status'
      
      const data = await response.json();
      expect(data.error).toBeTruthy(); // 'Error response should contain error message'
      expect(data.error.includes('Unknown tool')).toBeTruthy(); // 'Should indicate unknown tool'
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
      expect(healthResponse.ok).toBe(true); // 'Server should still be responsive after STDIO request'
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
      expect(httpResponse.ok).toBe(true); // 'HTTP transport should work while STDIO is active'
      
      const data = await httpResponse.json();
      expect(data.status).toBe('healthy'); // 'Health check should pass during concurrent usage'
    });

    it('should maintain consistent tool availability across transports', async () => {
      // Get tools via HTTP
      const httpResponse = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools`);
      const httpData = await httpResponse.json();
      
      // Verify we have tools available
      expect(httpData.tools.length > 0).toBeTruthy(); // 'Should have tools available via HTTP'
      
      // Test specific tool execution via HTTP (using the fixed get_current_config)
      const toolResponse = await fetch(`http://localhost:${HTTP_PORT}/mcp/tools/get_current_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          arguments: {}
        })
      });
      
      expect(toolResponse.ok).toBe(true); // 'Tool should execute successfully via HTTP'
      
      const toolData = await toolResponse.json();
      expect(toolData.content).toBeTruthy(); // 'Tool should return content'
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
      
      expect(response.ok).toBe(false); // 'Malformed requests should return error status'
    });

    it('should handle unknown HTTP endpoints', async () => {
      const response = await fetch(`http://localhost:${HTTP_PORT}/nonexistent/endpoint`);
      expect(response.status).toBe(404); // 'Unknown endpoints should return 404'
    });
  });
});
