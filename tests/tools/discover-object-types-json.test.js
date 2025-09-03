import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the tool handler directly
import { ToolHandlers } from '../../build/modules/tool-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('discover_object_types_json Tool Schema Validation', () => {
  let ajv;
  let schema;
  
  beforeAll(async () => {
    // Initialize JSON Schema validator with relaxed strict mode
    ajv = new Ajv({ strict: false, allErrors: true });
    
    // Load the schema
    const schemaPath = path.join(__dirname, '..', 'schemas', 'discover-object-types-response.schema.json');
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  });

  afterAll(() => {
    ajv = null;
    schema = null;
  });

  describe('Schema Validation', () => {
    it('should have a valid JSON schema file', () => {
      expect(schema).toBeDefined();
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.title).toContain('Discover Object Types');
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('aotStructure');
    });

    it('should compile the schema without errors', () => {
      const validate = ajv.compile(schema);
      expect(validate).toBeDefined();
      expect(typeof validate).toBe('function');
    });
  });

  describe('Tool Response Validation', () => {
    let toolResponse;
    let parsedResponse;

    beforeAll(async () => {
      try {
        // Call the tool handler directly
        toolResponse = await ToolHandlers.discoverObjectTypesJson({});
        
        expect(toolResponse).toBeDefined();
        expect(toolResponse.content).toBeDefined();
        expect(Array.isArray(toolResponse.content)).toBe(true);
        expect(toolResponse.content.length).toBeGreaterThan(0);
        
        const responseText = toolResponse.content[0].text;
        parsedResponse = JSON.parse(responseText);
      } catch (error) {
        throw new Error(`Failed to get tool response: ${error.message}`);
      }
    });

    it('should return a valid JSON response', () => {
      expect(parsedResponse).toBeDefined();
      expect(typeof parsedResponse).toBe('object');
      expect(parsedResponse).not.toBeNull();
    });

    it('should have the required aotStructure property', () => {
      expect(parsedResponse).toHaveProperty('aotStructure');
      expect(typeof parsedResponse.aotStructure).toBe('object');
      expect(parsedResponse.aotStructure).not.toBeNull();
    });

    it('should validate against the JSON schema', () => {
      const validate = ajv.compile(schema);
      const isValid = validate(parsedResponse);
      
      if (!isValid) {
        console.error('Schema validation errors:', JSON.stringify(validate.errors, null, 2));
      }
      
      expect(isValid).toBe(true);
    });

    it('should contain expected AOT categories', () => {
      const categories = Object.keys(parsedResponse.aotStructure);
      
      // Should have at least these core categories
      const expectedCategories = [
        'Data Types',
        'Data Model', 
        'Code',
        'User Interface',
        'Analytics',
        'Security'
      ];
      
      expectedCategories.forEach(category => {
        expect(categories).toContain(category);
      });
      
      // Should have a reasonable number of categories
      expect(categories.length).toBeGreaterThanOrEqual(10);
      expect(categories.length).toBeLessThanOrEqual(20);
    });

    it('should have properly structured category objects', () => {
      const categories = Object.keys(parsedResponse.aotStructure);
      
      categories.forEach(categoryName => {
        const category = parsedResponse.aotStructure[categoryName];
        
        // Required properties for all categories
        expect(category).toHaveProperty('folderPatterns');
        expect(category).toHaveProperty('icon');
        expect(category).toHaveProperty('description');
        
        // Property types and constraints
        expect(Array.isArray(category.folderPatterns)).toBe(true);
        expect(category.folderPatterns.length).toBeGreaterThan(0);
        
        expect(typeof category.icon).toBe('string');
        expect(category.icon).toMatch(/\.ico$/);
        
        expect(typeof category.description).toBe('string');
        expect(category.description.length).toBeGreaterThan(10);
        
        // Categories can be either parent (with children) or leaf objects
        if (category.children) {
          // Parent category with children
          expect(typeof category.children).toBe('object');
          expect(category.children).not.toBeNull();
          expect(Array.isArray(category.children)).toBe(false);
          
          // All children should have required properties
          const childNames = Object.keys(category.children);
          
          childNames.forEach(childName => {
            const child = category.children[childName];
            expect(typeof child).toBe('object');
            expect(child).toHaveProperty('folderPatterns');
            expect(child).toHaveProperty('fileExtensions');
            expect(child).toHaveProperty('objectType');
            expect(child).toHaveProperty('creatable');
            expect(child).toHaveProperty('icon');
            expect(child).toHaveProperty('description');
          });
        } else {
          // Leaf category - should have object-level properties
          expect(category).toHaveProperty('fileExtensions');
          expect(category).toHaveProperty('objectType');
          expect(category).toHaveProperty('creatable');
          
          expect(Array.isArray(category.fileExtensions)).toBe(true);
          expect(typeof category.objectType).toBe('string');
          expect(typeof category.creatable).toBe('boolean');
        }
      });
    });

    it('should have specific expected object types in Data Types category', () => {
      const dataTypes = parsedResponse.aotStructure['Data Types'];
      expect(dataTypes).toBeDefined();
      
      const expectedChildren = [
        'Base Enums',
        'Extended Data Types'
      ];
      
      const childNames = Object.keys(dataTypes.children);
      expectedChildren.forEach(child => {
        expect(childNames).toContain(child);
      });
    });

    it('should have specific expected object types in Code category', () => {
      const code = parsedResponse.aotStructure['Code'];
      expect(code).toBeDefined();
      
      const expectedChildren = [
        'Classes',
        'Interfaces'
      ];
      
      const childNames = Object.keys(code.children);
      expectedChildren.forEach(child => {
        expect(childNames).toContain(child);
      });
    });

    it('should return consistent results across multiple calls', async () => {
      // Make a second call
      const secondResponse = await ToolHandlers.discoverObjectTypesJson({});
      const secondParsedResponse = JSON.parse(secondResponse.content[0].text);
      
      // Should be identical
      expect(secondParsedResponse).toEqual(parsedResponse);
    });

    it('should have reasonable response size', () => {
      const responseText = JSON.stringify(parsedResponse);
      
      // Should be substantial but not excessive
      expect(responseText.length).toBeGreaterThan(5000);   // At least 5KB
      expect(responseText.length).toBeLessThan(100000);    // Less than 100KB
    });
  });

  describe('Performance Validation', () => {
    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      const response = await ToolHandlers.discoverObjectTypesJson({});
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(response).toBeDefined();
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid arguments gracefully', async () => {
      try {
        const response = await ToolHandlers.discoverObjectTypesJson({ invalid: 'parameter' });
        
        // Should either succeed (ignoring invalid params) or fail gracefully
        expect(response).toBeDefined();
      } catch (error) {
        // Error should be descriptive
        expect(error.message).toBeDefined();
        expect(typeof error.message).toBe('string');
      }
    });
  });
});
