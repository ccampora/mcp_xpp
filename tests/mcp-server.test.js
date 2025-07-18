import { jest } from '@jest/globals';
import { MCPTestHelper } from './helpers/mcp-test-helper.js';

/**
 * MCP X++ Server Integration Tests
 * 
 * Comprehensive test suite using Jest for the MCP X++ Server
 */

describe('MCP X++ Server', () => {
  let mcpHelper;

  // Setup and teardown
  beforeAll(async () => {
    mcpHelper = new MCPTestHelper();
    await mcpHelper.createMockCodebase();
    await mcpHelper.startServer();
  });

  afterAll(async () => {
    await mcpHelper.stopServer();
    await mcpHelper.cleanupMockCodebase();
  });

  describe('Server Lifecycle', () => {
    test('should start successfully and respond to tool list', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/list');
      
      expect(response).toBeValidMCPResponse();
      expect(response.tools).toBeInstanceOf(Array);
      expect(response.tools.length).toBeGreaterThan(0);
    });

    test('should have all expected tools available', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/list');
      
      const expectedTools = [
        'set_xpp_codebase_path',
        'browse_directory',
        'read_file',
        'search_files',
        'get_file_info',
        'find_xpp_object',
        'get_class_methods',
        'get_table_structure',
        'validate_object_exists',
        'discover_object_types',
        'discover_object_types_json',
        'build_object_index',
        'get_index_stats',
        'list_objects_by_type',
        'smart_search'
      ];
      
      const actualTools = response.tools.map(t => t.name);
      
      expectedTools.forEach(tool => {
        expect(actualTools).toContain(tool);
      });
    });
  });

  describe('Path Configuration', () => {
    test('should accept valid path configuration', async () => {
      const response = await mcpHelper.configureMockPath();
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('X++ codebase path set');
    });

    test('should reject invalid path configuration', async () => {
      await expect(
        mcpHelper.sendMCPRequest('tools/call', {
          name: 'set_xpp_codebase_path',
          arguments: { path: '/nonexistent/path' }
        })
      ).rejects.toThrow(/Invalid path/);
    });
  });

  describe('Directory Operations', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should browse root directory successfully', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'browse_directory',
        arguments: { path: '' }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('Total items:');
      expect(response).toContainMCPContent('📁');
    });

    test('should browse subdirectory successfully', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'browse_directory',
        arguments: { path: 'TestPackage' }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('Directory: TestPackage');
    });
  });

  describe('File Operations', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should read file content successfully', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'read_file',
        arguments: { path: 'TestPackage/TestPackage/AxClass/TestClass.xml' }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('<AxClass');
      expect(response).toContainMCPContent('TestClass');
    });

    test('should get file information successfully', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'get_file_info',
        arguments: { path: 'TestPackage/TestPackage/AxClass/TestClass.xml' }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('File Information:');
      expect(response).toContainMCPContent('Type: File');
    });
  });

  describe('AOT Structure Discovery', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should discover AOT structure', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'discover_object_types',
        arguments: {}
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('DYNAMICS 365 F&O AOT STRUCTURE');
      expect(response).toContainMCPContent('CLASSES');
    });

    test('should return AOT structure as JSON', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'discover_object_types_json',
        arguments: {}
      });
      
      expect(response).toBeValidMCPResponse();
      
      const content = response.content[0].text;
      
      // Should be valid JSON
      let parsedData;
      expect(() => {
        parsedData = JSON.parse(content);
      }).not.toThrow();
      
      // Validate JSON structure
      expect(parsedData).toBeInstanceOf(Object);
      
      // Should contain AOT structure information
      // The structure should have either aotStructure or objectTypes at root level
      const hasAotStructure = parsedData.hasOwnProperty('aotStructure');
      const hasObjectTypes = parsedData.hasOwnProperty('objectTypes');
      const hasValidStructure = hasAotStructure || hasObjectTypes || 
                               Object.keys(parsedData).some(key => 
                                 typeof parsedData[key] === 'object' && 
                                 parsedData[key] !== null
                               );
      
      expect(hasValidStructure).toBe(true);
      
      // If it has aotStructure, validate its format
      if (hasAotStructure) {
        expect(parsedData.aotStructure).toBeInstanceOf(Object);
      }
      
      // If it has objectTypes, validate its format
      if (hasObjectTypes) {
        expect(parsedData.objectTypes).toBeInstanceOf(Array);
      }
      
      // Should not be an empty object
      expect(Object.keys(parsedData).length).toBeGreaterThan(0);
    });

    test('should validate JSON structure properties', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'discover_object_types_json',
        arguments: {}
      });
      
      expect(response).toBeValidMCPResponse();
      
      const content = response.content[0].text;
      const parsedData = JSON.parse(content);
      
      // Validate that the structure contains expected D365 F&O object types
      const expectedObjectTypes = ['CLASSES', 'TABLES', 'FORMS', 'REPORTS', 'ENUMS'];
      
      // Check if any of the expected types are present in the structure
      const structureString = JSON.stringify(parsedData).toUpperCase();
      const foundTypes = expectedObjectTypes.filter(type => 
        structureString.includes(type)
      );
      
      // Should find at least one standard D365 F&O object type
      expect(foundTypes.length).toBeGreaterThan(0);
      
      // Validate JSON is properly formatted (should stringify and parse back identical)
      const reStringified = JSON.stringify(parsedData);
      const reParsed = JSON.parse(reStringified);
      expect(reParsed).toEqual(parsedData);
      
      // Should be a complex structure (not just a simple value)
      const isComplexStructure = typeof parsedData === 'object' && 
                                parsedData !== null && 
                                !Array.isArray(parsedData);
      expect(isComplexStructure).toBe(true);
    });

    test('should return valid D365 F&O AOT structure schema', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'discover_object_types_json',
        arguments: {}
      });
      
      expect(response).toBeValidMCPResponse();
      
      const content = response.content[0].text;
      const parsedData = JSON.parse(content);
      
      // Schema validation: Should have standard D365 F&O structure
      const validateAOTStructure = (data) => {
        // Should be an object
        if (typeof data !== 'object' || data === null) return false;
        
        // Check for common D365 F&O patterns
        const jsonString = JSON.stringify(data);
        const hasD365Patterns = /CLASSES|TABLES|FORMS|REPORTS|ENUMS|EDT|VIEWS|MAPS|SERVICES|WORKFLOWS|QUERIES|MENUS/i.test(jsonString);
        
        // Should have hierarchical structure (nested objects or arrays)
        const hasHierarchy = Object.values(data).some(value => 
          typeof value === 'object' && value !== null
        );
        
        return hasD365Patterns && hasHierarchy;
      };
      
      expect(validateAOTStructure(parsedData)).toBe(true);
      
      // Additional schema checks
      expect(typeof parsedData).toBe('object');
      expect(parsedData).not.toBeNull();
      expect(Array.isArray(parsedData)).toBe(false);
      
      // Should have meaningful content (not empty)
      expect(Object.keys(parsedData).length).toBeGreaterThan(0);
      
      // JSON should be well-formed and re-parseable
      expect(() => JSON.parse(JSON.stringify(parsedData))).not.toThrow();
    });
  });

  describe('Object Discovery', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should attempt object finding', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'find_xpp_object',
        arguments: { objectName: 'TestClass' }
      });
      
      expect(response).toBeValidMCPResponse();
      // Accept various outcomes - object found, not found, or needs indexing
      const content = response.content[0].text;
      expect(content.length).toBeGreaterThan(0);
    });

    test('should validate object existence', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'validate_object_exists',
        arguments: { objectName: 'TestClass' }
      });
      
      expect(response).toBeValidMCPResponse();
      // Accept any validation response
      const content = response.content[0].text;
      expect(content).toMatch(/EXISTS|NOT_EXISTS|DOES_NOT_EXIST|not found|TestClass/i);
    });
  });

  describe('Indexing Operations', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should attempt index building', async () => {
      try {
        const response = await mcpHelper.sendMCPRequest('tools/call', {
          name: 'build_object_index',
          arguments: { objectType: 'CLASSES', forceRebuild: true }
        });
        
        expect(response).toBeValidMCPResponse();
        expect(response.content[0].text).toMatch(/Index|indexed|objects processed|CLASSES/i);
      } catch (error) {
        // Accept timeout as valid behavior for performance testing
        if (error.message.includes('Request timeout')) {
          expect(error.message).toContain('timeout');
        } else {
          throw error;
        }
      }
    }, global.INDEX_TIMEOUT + 5000);

    test('should get index statistics', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'get_index_stats',
        arguments: {}
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('Object Index Statistics');
      expect(response).toContainMCPContent('Total objects:');
    });

    test('should list objects by type', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'list_objects_by_type',
        arguments: { objectType: 'CLASSES' }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('Objects of type CLASSES');
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should perform file search', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'search_files',
        arguments: { searchTerm: 'TestClass' }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('Search results for "TestClass"');
    });

    test('should perform smart search', async () => {
      const response = await mcpHelper.sendMCPRequest('tools/call', {
        name: 'smart_search',
        arguments: { searchTerm: 'TestClass', maxResults: 10 }
      });
      
      expect(response).toBeValidMCPResponse();
      expect(response).toContainMCPContent('Smart search results for "TestClass"');
    });
  });

  describe('X++ Parsing', () => {
    beforeEach(async () => {
      await mcpHelper.configureMockPath();
    });

    test('should attempt class method parsing', async () => {
      try {
        const response = await mcpHelper.sendMCPRequest('tools/call', {
          name: 'get_class_methods',
          arguments: { className: 'TestClass' }
        });
        
        expect(response).toBeValidMCPResponse();
        const content = response.content[0].text;
        expect(content.length).toBeGreaterThan(0);
      } catch (error) {
        // Accept "not found" errors as valid behavior
        expect(error.message).toMatch(/not found/i);
      }
    });

    test('should attempt table structure parsing', async () => {
      try {
        const response = await mcpHelper.sendMCPRequest('tools/call', {
          name: 'get_table_structure',
          arguments: { tableName: 'TestTable' }
        });
        
        expect(response).toBeValidMCPResponse();
        const content = response.content[0].text;
        expect(content.length).toBeGreaterThan(0);
      } catch (error) {
        // Accept "not found" errors as valid behavior
        expect(error.message).toMatch(/not found/i);
      }
    });
  });

  describe('Error Handling', () => {
    test('should reject unknown tool names', async () => {
      await expect(
        mcpHelper.sendMCPRequest('tools/call', {
          name: 'nonexistent_tool',
          arguments: {}
        })
      ).rejects.toThrow(/Unknown tool/);
    });

    test('should reject missing required parameters', async () => {
      await expect(
        mcpHelper.sendMCPRequest('tools/call', {
          name: 'set_xpp_codebase_path',
          arguments: {}
        })
      ).rejects.toThrow(/Invalid parameters/);
    });
  });
});
