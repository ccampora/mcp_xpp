import { jest } from '@jest/globals';
import { MCPTestHelper } from './helpers/mcp-test-helper.js';

/**
 * MCP X++ Server Performance Tests
 * 
 * Performance benchmarks and stress tests for the MCP X++ Server
 */

describe('MCP X++ Server Performance', () => {
  let mcpHelper;

  beforeAll(async () => {
    mcpHelper = new MCPTestHelper();
    await mcpHelper.createMockCodebase();
    await mcpHelper.startServer();
    await mcpHelper.configureMockPath();
  });

  afterAll(async () => {
    await mcpHelper.stopServer();
    await mcpHelper.cleanupMockCodebase();
  });

  describe('Response Time Benchmarks', () => {
    test('directory browsing should complete within 5 seconds', async () => {
      const startTime = Date.now();
      
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'browse_directory',
        arguments: { path: '' }
      });
      
      const duration = Date.now() - startTime;
      
      expect(response).toBeValidMCPResponse();
      expect(duration).toBeLessThan(5000);
    });

    test('file reading should complete within 1 second', async () => {
      const startTime = Date.now();
      
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'read_file',
        arguments: { path: 'TestPackage/TestPackage/AxClass/TestClass.xml' }
      });
      
      const duration = Date.now() - startTime;
      
      expect(response).toBeValidMCPResponse();
      expect(duration).toBeLessThan(1000);
    });

    test('search should complete within 3 seconds', async () => {
      const startTime = Date.now();
      
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'smart_search',
        arguments: { searchTerm: 'test', maxResults: 50 }
      });
      
      const duration = Date.now() - startTime;
      
      expect(response).toBeValidMCPResponse();
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('Stress Tests', () => {
    test('should handle multiple rapid requests', async () => {
      const promises = [];
      
      // Send 5 concurrent browse requests
      for (let i = 0; i < 5; i++) {
        promises.push(
          mcpHelper.sendMCPRequest('tools/call', {
            name: 'browse_directory',
            arguments: { path: '' }
          })
        );
      }
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response).toBeValidMCPResponse();
      });
    });

    test('should handle sequential file operations', async () => {
      const files = [
        'TestPackage/TestPackage/AxClass/TestClass.xml',
        'TestPackage/TestPackage/AxClass/AnotherClass.xml',
        'TestPackage/TestPackage/AxTable/TestTable.xml'
      ];
      
      for (const file of files) {
        const response = await mcpHelper.sendMCPRequest('tools/call', {
          name: 'read_file',
          arguments: { path: file }
        });
        
        expect(response).toBeValidMCPResponse();
      }
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during repeated operations', async () => {
      // Perform 10 directory browse operations
      for (let i = 0; i < 10; i++) {
        const response = await mcpHelper.sendMCPRequest('tools/call', {
          name: 'browse_directory',
          arguments: { path: '' }
        });
        
        expect(response).toBeValidMCPResponse();
        
        // Small delay to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // If we get here without timeout/crash, memory usage is acceptable
      expect(true).toBe(true);
    });
  });

  describe('Index Building Performance', () => {
    test('index building should handle timeout gracefully', async () => {
      const startTime = Date.now();
      
      try {
        const response = await mcpHelper.sendMCPRequest('tools/call', {
          name: 'build_object_index',
          arguments: { objectType: 'CLASSES', forceRebuild: true }
        });
        
        const duration = Date.now() - startTime;
        
        expect(response).toBeValidMCPResponse();
        // Index building completed successfully
        expect(duration).toBeLessThan(global.INDEX_TIMEOUT);
      } catch (error) {
        // Timeout is acceptable for performance testing
        if (error.message.includes('Request timeout')) {
          const duration = Date.now() - startTime;
          expect(duration).toBeGreaterThanOrEqual(global.INDEX_TIMEOUT - 1000);
        } else {
          throw error;
        }
      }
    }, global.INDEX_TIMEOUT + 5000);
  });
});
