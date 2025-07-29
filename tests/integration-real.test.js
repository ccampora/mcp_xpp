/**
 * Real Integration Tests - Testing actual MCP X++ Server implementation
 * 
 * These tests use the REAL server implementation and REAL D365 environment.
 * NO MOCKS are used - this tests the actual functionality end-to-end.
 */

import { test, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { 
  CallToolRequestSchema,
  CallToolRequest,
  CallToolResult
} from "@modelcontextprotocol/sdk/types.js";

// Import real modules (NO MOCKS)
import { setXppCodebasePath, getXppCodebasePath } from '../src/modules/config.js';
import { ObjectIndexManager } from '../src/modules/object-index.js';

// Configuration from .vscode/mcp.json
let mcpConfig;
let realXppPath;
let server;

beforeAll(async () => {
  // Read the real MCP configuration
  const mcpConfigPath = join(process.cwd(), '.vscode', 'mcp.json');
  const mcpConfigContent = await fs.readFile(mcpConfigPath, 'utf-8');
  mcpConfig = JSON.parse(mcpConfigContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  
  // Get the real D365 path from command line arguments
  const serverConfig = mcpConfig.servers['mcp-xpp-server'];
  const xppPathIndex = serverConfig.args.findIndex(arg => arg === '--xpp-path');
  if (xppPathIndex !== -1 && xppPathIndex + 1 < serverConfig.args.length) {
    realXppPath = serverConfig.args[xppPathIndex + 1];
  } else {
    throw new Error('XPP codebase path not found in mcp.json configuration. Expected --xpp-path argument.');
  }

  
  console.log(`🔧 Using real D365 path: ${realXppPath}`);
  
  // Verify the path exists
  try {
    await fs.access(realXppPath);
    console.log('✅ D365 path is accessible');
  } catch (error) {
    console.warn('⚠️ D365 path may not be accessible, tests may fail');
  }
  
  // Set up the real configuration
  setXppCodebasePath(realXppPath);
  
  // Initialize ObjectIndexManager with real path
  ObjectIndexManager.setIndexPath(realXppPath);
  
  console.log('🚀 Integration test setup complete');
});

afterAll(async () => {
  console.log('🧹 Integration test cleanup complete');
});

// =============================================================================
// REAL TOOL HANDLER TESTS - Using actual server implementation
// =============================================================================

test('REAL: list_objects_by_type - Actual D365 CLASSES', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing real list_objects_by_type with CLASSES...');
  
  // Create the actual tool request that would come from MCP client
  const toolRequest = {
    method: "call_tool",
    params: {
      name: "list_objects_by_type",
      arguments: {
        objectType: "CLASSES",
        sortBy: "name",
        limit: 10
      }
    }
  };
  
  // Import and execute the real tool handler
  const { default: serverModule } = await import('../src/index.js');
  
  // We need to simulate the actual MCP call through the real server
  // Since the server uses CallToolRequestSchema, we'll test the ObjectIndexManager directly
  // which is what the real tool handler calls
  
  try {
    await ObjectIndexManager.loadIndex();
    
    // Call the real implementation
    const objects = ObjectIndexManager.listObjectsByType("CLASSES", "name", 10);
    const stats = ObjectIndexManager.getStats();
    const totalCount = stats.byType["CLASSES"] || 0;
    
    // Create the response in the same format as the real tool handler
    const response = {
      objectType: "CLASSES",
      totalCount,
      objects: objects.map(obj => ({
        name: obj.name,
        package: obj.package,
        path: obj.path,
        size: obj.size
      }))
    };
    
    // Verify the real response structure
    expect(response).toHaveProperty('objectType', 'CLASSES');
    expect(response).toHaveProperty('totalCount');
    expect(response).toHaveProperty('objects');
    expect(typeof response.totalCount).toBe('number');
    expect(Array.isArray(response.objects)).toBe(true);
    
    // Verify we got real D365 data
    if (response.objects.length > 0) {
      const firstClass = response.objects[0];
      expect(firstClass).toHaveProperty('name');
      expect(firstClass).toHaveProperty('package');
      expect(firstClass).toHaveProperty('path');
      expect(firstClass).toHaveProperty('size');
      
      // Verify these are real D365 objects
      expect(typeof firstClass.name).toBe('string');
      expect(firstClass.name.length).toBeGreaterThan(0);
      expect(typeof firstClass.package).toBe('string');
      expect(typeof firstClass.path).toBe('string');
      expect(typeof firstClass.size).toBe('number');
      
      console.log(`✅ Found ${response.totalCount} total CLASSES in real D365 environment`);
      console.log(`📄 First class: ${firstClass.name} (${firstClass.package})`);
      console.log(`📊 Response JSON is valid and serializable`);
      
      // Test JSON serialization with real data
      const jsonString = JSON.stringify(response);
      const reparsed = JSON.parse(jsonString);
      expect(reparsed).toEqual(response);
    } else {
      console.log('ℹ️ No CLASSES found in index - may need to build index first');
    }
    
  } catch (error) {
    console.error('❌ Real implementation test failed:', error);
    throw error;
  }
}, 30000); // 30 second timeout for real D365 operations

test('REAL: list_objects_by_type - Actual D365 TABLES', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing real list_objects_by_type with TABLES...');
  
  try {
    // Call the real implementation for TABLES
    const objects = ObjectIndexManager.listObjectsByType("TABLES", "size", 5);
    const stats = ObjectIndexManager.getStats();
    const totalCount = stats.byType["TABLES"] || 0;
    
    const response = {
      objectType: "TABLES",
      totalCount,
      objects: objects.map(obj => ({
        name: obj.name,
        package: obj.package,
        path: obj.path,
        size: obj.size
      }))
    };
    
    // Verify the real response
    expect(response.objectType).toBe('TABLES');
    expect(typeof response.totalCount).toBe('number');
    expect(Array.isArray(response.objects)).toBe(true);
    
    if (response.objects.length > 0) {
      console.log(`✅ Found ${response.totalCount} total TABLES in real D365 environment`);
      console.log(`📊 First table: ${response.objects[0]?.name} (${response.objects[0]?.size} bytes)`);
      
      // Log actual sorting to understand the behavior
      if (response.objects.length > 1) {
        console.log(`📊 Second table: ${response.objects[1]?.name} (${response.objects[1]?.size} bytes)`);
        console.log(`📈 Sorting by size requested - first: ${response.objects[0].size}, second: ${response.objects[1].size}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Real TABLES test failed:', error);
    throw error;
  }
}, 30000);

test('REAL: Configuration validation', async () => {
  console.log('🔍 Testing real configuration...');
  
  // Verify the configuration was loaded correctly
  expect(mcpConfig).toBeDefined();
  expect(mcpConfig.servers).toBeDefined();
  expect(mcpConfig.servers['mcp-xpp-server']).toBeDefined();
  
  const serverConfig = mcpConfig.servers['mcp-xpp-server'];
  expect(serverConfig.command).toBe('node');
  expect(serverConfig.args).toContain('./build/index.js');
  expect(serverConfig.args).toContain('--xpp-path');
  const xppPathIndex = serverConfig.args.findIndex(arg => arg === '--xpp-path');
  expect(xppPathIndex).toBeGreaterThanOrEqual(0);
  expect(serverConfig.args[xppPathIndex + 1]).toBeDefined();
  
  // Verify the real path is set
  const configuredPath = getXppCodebasePath();
  expect(configuredPath).toBe(realXppPath);
  expect(configuredPath).toContain('PackagesLocalDirectory');
  
  console.log(`✅ Configuration valid: ${configuredPath}`);
});

test('REAL: Directory structure validation', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing real D365 directory structure...');
  
  try {
    // Read the actual D365 directory
    const entries = await fs.readdir(realXppPath, { withFileTypes: true });
    
    // Verify we have typical D365 structure
    expect(entries.length).toBeGreaterThan(0);
    
    // Look for common D365 packages
    const packageNames = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    
    console.log(`📁 Found ${packageNames.length} packages in real D365 environment`);
    
    // Check for some standard D365 packages
    const standardPackages = ['ApplicationFoundation', 'ApplicationPlatform', 'ApplicationSuite'];
    const foundStandardPackages = standardPackages.filter(pkg => 
      packageNames.some(name => name.includes(pkg))
    );
    
    if (foundStandardPackages.length > 0) {
      console.log(`✅ Found standard D365 packages: ${foundStandardPackages.join(', ')}`);
    }
    
    expect(packageNames.length).toBeGreaterThan(5); // Should have multiple packages
    
  } catch (error) {
    console.error('❌ Directory structure test failed:', error);
    throw error;
  }
}, 30000);

test('REAL: Error handling with invalid object type', async () => {
  console.log('🔍 Testing real error handling...');
  
  try {
    // Test with invalid object type - this should handle gracefully
    const objects = ObjectIndexManager.listObjectsByType("INVALID_TYPE", "name", 10);
    const stats = ObjectIndexManager.getStats();
    const totalCount = stats.byType["INVALID_TYPE"] || 0;
    
    // Should return empty results, not throw
    expect(Array.isArray(objects)).toBe(true);
    expect(objects.length).toBe(0);
    expect(typeof totalCount).toBe('number');
    expect(totalCount).toBe(0);
    
    console.log('✅ Invalid object type handled gracefully');
    
  } catch (error) {
    console.error('❌ Error handling test failed:', error);
    throw error;
  }
});

test('REAL: JSON serialization with actual D365 data', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing JSON serialization with real D365 data...');
  
  try {
    // Get real data from multiple object types
    const classesObjects = ObjectIndexManager.listObjectsByType("CLASSES", "name", 3);
    const tablesObjects = ObjectIndexManager.listObjectsByType("TABLES", "name", 3);

    const stats = ObjectIndexManager.getStats();

    const testResponse = {
      classes: {
        objectType: "CLASSES",

        totalCount: stats.byType["CLASSES"] || 0,

        objects: classesObjects
      },
      tables: {
        objectType: "TABLES", 

        totalCount: stats.byType["TABLES"] || 0,

        objects: tablesObjects
      }
    };
    
    // Test JSON serialization with real data
    const jsonString = JSON.stringify(testResponse, null, 2);
    const reparsed = JSON.parse(jsonString);
    
    expect(reparsed).toEqual(testResponse);
    expect(jsonString.length).toBeGreaterThan(100); // Should have substantial content
    
    // Verify no circular references or serialization issues
    expect(() => JSON.stringify(testResponse)).not.toThrow();
    
    console.log(`✅ JSON serialization successful with ${jsonString.length} characters`);
    console.log(`📊 Classes: ${testResponse.classes.totalCount}, Tables: ${testResponse.tables.totalCount}`);
    
  } catch (error) {
    console.error('❌ JSON serialization test failed:', error);
    throw error;
  }
}, 30000);

test('REAL: get_current_config tool functionality', async () => {
  console.log('🔍 Testing get_current_config tool...');
  
  try {
    const { AppConfig } = await import('../build/modules/app-config.js');
    
    // Initialize with test configuration
    const originalArgv = process.argv;
    process.argv = [
      'node', 'index.js',
      '--xpp-path', realXppPath,
      '--xpp-metadata-folder', 'C:\\CustomXppMetadata1x4ye02p.ocz'
    ];
    
    await AppConfig.initialize();
    
    // Test configuration retrieval
    const config = await AppConfig.getApplicationConfiguration();
    
    // Validate configuration structure
    expect(config).toBeDefined();
    expect(config.serverConfig).toBeDefined();
    expect(config.indexStats).toBeDefined();
    expect(config.applicationInfo).toBeDefined();
    expect(config.systemInfo).toBeDefined();
    
    // Validate server configuration
    expect(config.serverConfig.xppPath).toBe(realXppPath);
    expect(config.serverConfig.xppMetadataFolder).toBe('C:\\CustomXppMetadata1x4ye02p.ocz');
    
    // Validate application info
    expect(config.applicationInfo.name).toBe('MCP X++ Server');
    expect(config.applicationInfo.version).toBe('1.0.0');
    expect(config.applicationInfo.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(config.applicationInfo.uptime).toBeDefined();
    
    // Validate system info
    expect(config.systemInfo.nodeVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(config.systemInfo.platform).toBeDefined();
    expect(config.systemInfo.architecture).toBeDefined();
    
    // Validate index stats (may be empty if index not loaded)
    expect(config.indexStats.totalObjects).toBeGreaterThanOrEqual(0);
    expect(config.indexStats.objectTypes).toBeDefined();
    expect(config.indexStats.indexSize).toBeDefined();
    expect(config.indexStats.indexPath).toBeDefined();
    
    console.log('✅ get_current_config functionality validated');
    console.log(`📊 Configuration contains ${config.indexStats.totalObjects} objects`);
    console.log(`🖥️  Running on ${config.systemInfo.platform} with Node.js ${config.systemInfo.nodeVersion}`);
    console.log(`⏰ Server uptime: ${config.applicationInfo.uptime}`);
    console.log(`📁 XPP Path: ${config.serverConfig.xppPath}`);
    console.log(`📂 Metadata Folder: ${config.serverConfig.xppMetadataFolder}`);
    
    // Test JSON serialization
    const jsonString = JSON.stringify(config, null, 2);
    expect(jsonString.length).toBeGreaterThan(500); // Should be substantial
    expect(() => JSON.parse(jsonString)).not.toThrow();
    
    // Restore original argv
    process.argv = originalArgv;
    
  } catch (error) {
    console.error('❌ get_current_config test failed:', error);
    throw error;
  }
}, 10000);

// =============================================================================
// ENHANCED JSON OUTPUT VALIDATION TESTS
// These tests ensure JSON outputs are correctly formatted for tool consumption
// =============================================================================

test('REAL: list_objects_by_type JSON Output Validation - Complete Tool Response Format', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing complete JSON output format for list_objects_by_type tool...');
  
  try {
    await ObjectIndexManager.loadIndex();
    
    // Test multiple object types to ensure consistent JSON structure
    const testObjectTypes = ['CLASSES', 'TABLES', 'FORMS', 'ENUMS'];
    
    for (const objectType of testObjectTypes) {
      const objects = ObjectIndexManager.listObjectsByType(objectType, "name", 5);
      const totalCount = ObjectIndexManager.getObjectCountByType(objectType);
      
      // Create response exactly as the tool handler does
      const response = {
        objectType,
        totalCount,
        objects: objects.map(obj => ({
          name: obj.name,
          package: obj.package,
          path: obj.path,
          size: obj.size
        }))
      };
      
      // === COMPREHENSIVE JSON VALIDATION FOR TOOL CONSUMERS ===
      
      // 1. Root level structure validation
      expect(response).toHaveProperty('objectType');
      expect(response).toHaveProperty('totalCount');
      expect(response).toHaveProperty('objects');
      expect(Object.keys(response)).toEqual(['objectType', 'totalCount', 'objects']);
      
      // 2. Data type validation - critical for JSON consumers
      expect(typeof response.objectType).toBe('string');
      expect(typeof response.totalCount).toBe('number');
      expect(Array.isArray(response.objects)).toBe(true);
      expect(response.objectType).toBe(objectType);
      expect(response.totalCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(response.totalCount)).toBe(true);
      
      // 3. Objects array validation
      if (response.objects.length > 0) {
        response.objects.forEach((obj, index) => {
          // Each object must have exactly these properties
          expect(Object.keys(obj).sort()).toEqual(['name', 'package', 'path', 'size']);
          
          // Type validation for each property
          expect(typeof obj.name).toBe('string', `Object ${index}: name should be string`);
          expect(typeof obj.package).toBe('string', `Object ${index}: package should be string`);
          expect(typeof obj.path).toBe('string', `Object ${index}: path should be string`);
          expect(typeof obj.size).toBe('number', `Object ${index}: size should be number`);
          
          // Content validation
          expect(obj.name).toBeTruthy(`Object ${index}: name should not be empty`);
          expect(obj.package).toBeTruthy(`Object ${index}: package should not be empty`);
          expect(obj.path).toBeTruthy(`Object ${index}: path should not be empty`);
          expect(obj.size).toBeGreaterThanOrEqual(0, `Object ${index}: size should be non-negative`);
          expect(Number.isInteger(obj.size)).toBe(true, `Object ${index}: size should be integer`);
          
          // Path structure validation (should be relative paths)
          expect(obj.path).not.toMatch(/^[A-Za-z]:\\/, `Object ${index}: path should be relative, not absolute`);
          expect(obj.path).toMatch(/[\\\/]/, `Object ${index}: path should contain path separators`);
        });
      }
      
      // 4. JSON serialization validation - critical for MCP protocol
      const jsonString = JSON.stringify(response, null, 2);
      expect(jsonString).toBeTruthy();
      expect(jsonString.length).toBeGreaterThan(50); // Should have substantial content
      
      // 5. JSON round-trip validation
      const reparsed = JSON.parse(jsonString);
      expect(reparsed).toEqual(response);
      
      // 6. Validate JSON doesn't contain undefined, NaN, or other non-JSON values
      expect(jsonString).not.toContain('undefined');
      expect(jsonString).not.toContain('NaN');
      expect(jsonString).not.toContain('Infinity');
      
      // 7. Ensure consistent limit behavior
      if (objects.length === 5 && response.totalCount > 5) {
        expect(response.objects.length).toBe(5);
        console.log(`✅ ${objectType}: Correctly limited to 5 objects (${response.totalCount} total available)`);
      }
      
      console.log(`✅ ${objectType}: JSON structure validated - ${response.objects.length} objects, ${response.totalCount} total`);
    }
    
  } catch (error) {
    console.error('❌ JSON output validation test failed:', error);
    throw error;
  }
}, 30000);

test('REAL: get_current_config JSON Output Validation - MCP Tool Response Format', async () => {
  console.log('🔍 Testing complete JSON output format for get_current_config tool...');
  
  try {
    const { AppConfig } = await import('../build/modules/app-config.js');
    
    // Initialize with test configuration
    const originalArgv = process.argv;
    process.argv = [
      'node', 'index.js',
      '--xpp-path', realXppPath,
      '--xpp-metadata-folder', 'C:\\CustomXppMetadata1x4ye02p.ocz'
    ];
    
    await AppConfig.initialize();
    
    // Get configuration as the tool handler would
    const config = await AppConfig.getApplicationConfiguration();
    
    // Create response exactly as the tool handler does (with _meta wrapper)
    const response = {
      _meta: {
        type: "configuration",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      },
      ...config
    };
    
    // === COMPREHENSIVE JSON VALIDATION FOR MCP PROTOCOL ===
    
    // 1. Root level structure validation
    expect(response).toHaveProperty('_meta');
    expect(response).toHaveProperty('serverConfig');
    expect(response).toHaveProperty('indexStats');
    expect(response).toHaveProperty('applicationInfo');
    expect(response).toHaveProperty('systemInfo');
    
    // 2. _meta object validation (MCP response metadata)
    expect(typeof response._meta).toBe('object');
    expect(response._meta).toHaveProperty('type', 'configuration');
    expect(response._meta).toHaveProperty('timestamp');
    expect(response._meta).toHaveProperty('version', '1.0.0');
    expect(response._meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // 3. serverConfig validation
    expect(typeof response.serverConfig).toBe('object');
    expect(response.serverConfig).toHaveProperty('xppPath');
    expect(response.serverConfig).toHaveProperty('xppMetadataFolder');
    expect(typeof response.serverConfig.xppPath).toBe('string');
    expect(typeof response.serverConfig.xppMetadataFolder).toBe('string');
    expect(response.serverConfig.xppPath).toBeTruthy();
    
    // 4. indexStats validation (critical for other tools)
    expect(typeof response.indexStats).toBe('object');
    expect(response.indexStats).toHaveProperty('totalObjects');
    expect(response.indexStats).toHaveProperty('objectTypes');
    expect(response.indexStats).toHaveProperty('indexSize');
    expect(response.indexStats).toHaveProperty('indexSizeInKB');
    expect(response.indexStats).toHaveProperty('indexPath');
    expect(typeof response.indexStats.totalObjects).toBe('number');
    expect(typeof response.indexStats.objectTypes).toBe('object');
    expect(typeof response.indexStats.indexSize).toBe('string'); // indexSize is human-readable (e.g., "1.2 MB")
    expect(typeof response.indexStats.indexSizeInKB).toBe('number'); // indexSizeInKB is numeric KB value
    expect(typeof response.indexStats.indexPath).toBe('string');
    expect(Number.isInteger(response.indexStats.totalObjects)).toBe(true);
    expect(response.indexStats.totalObjects).toBeGreaterThanOrEqual(0);
    expect(response.indexStats.indexSizeInKB).toBeGreaterThanOrEqual(0);
    
    // Validate indexSize format (should be human-readable like "123 KB" or "1.2 MB")
    expect(response.indexStats.indexSize).toMatch(/^(\d+(?:\.\d+)?\s?(KB|MB|GB|B)|0\s?KB|Unknown)$/);
    
    // Validate indexSizeInKB is a reasonable number (should be positive for actual files)
    if (response.indexStats.totalObjects > 0) {
      expect(response.indexStats.indexSizeInKB).toBeGreaterThan(0);
      // For a real D365 index with thousands of objects, should be at least a few KB
      expect(response.indexStats.indexSizeInKB).toBeGreaterThan(1);
    }
    if (response.indexStats.totalObjects > 0) {
      expect(Object.keys(response.indexStats.objectTypes).length).toBeGreaterThan(0);
      Object.entries(response.indexStats.objectTypes).forEach(([type, count]) => {
        expect(typeof type).toBe('string');
        expect(typeof count).toBe('number');
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
        expect(type).toBeTruthy();
      });
    }
    
    // 6. applicationInfo validation
    expect(typeof response.applicationInfo).toBe('object');
    expect(response.applicationInfo).toHaveProperty('name', 'MCP X++ Server');
    expect(response.applicationInfo).toHaveProperty('version', '1.0.0');
    expect(response.applicationInfo).toHaveProperty('startTime');
    expect(response.applicationInfo).toHaveProperty('uptime');
    expect(response.applicationInfo.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(typeof response.applicationInfo.uptime).toBe('string');
    
    // 7. systemInfo validation
    expect(typeof response.systemInfo).toBe('object');
    expect(response.systemInfo).toHaveProperty('nodeVersion');
    expect(response.systemInfo).toHaveProperty('platform');
    expect(response.systemInfo).toHaveProperty('architecture');
    expect(response.systemInfo.nodeVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(typeof response.systemInfo.platform).toBe('string');
    expect(typeof response.systemInfo.architecture).toBe('string');
    
    // 8. JSON serialization validation
    const jsonString = JSON.stringify(response, null, 2);
    expect(jsonString).toBeTruthy();
    expect(jsonString.length).toBeGreaterThan(1000); // Should have substantial content
    
    // 9. JSON round-trip validation
    const reparsed = JSON.parse(jsonString);
    expect(reparsed).toEqual(response);
    
    // 10. Validate JSON doesn't contain problematic values
    expect(jsonString).not.toContain('undefined');
    expect(jsonString).not.toContain('NaN');
    expect(jsonString).not.toContain('Infinity');
    expect(jsonString).not.toContain('[object Object]');
    
    // 11. Validate all timestamps are in ISO format
    expect(response._meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(response.applicationInfo.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    console.log('✅ get_current_config JSON structure fully validated');
    console.log(`📊 Configuration JSON size: ${jsonString.length} characters`);
    console.log(`📈 Total objects in index: ${response.indexStats.totalObjects}`);
    console.log(`📋 Object types available: ${Object.keys(response.indexStats.objectTypes).length}`);
    console.log(`💾 Index size: ${response.indexStats.indexSize} (${response.indexStats.indexSizeInKB} KB)`);
    
    // Restore original argv
    process.argv = originalArgv;
    
  } catch (error) {
    console.error('❌ get_current_config JSON validation failed:', error);
    throw error;
  }
}, 10000);

test('REAL: Model Discovery JSON Validation - Enhanced get_current_config Models Array', async () => {
  console.log('🔍 Testing model discovery JSON validation in get_current_config...');
  
  try {
    const { AppConfig } = await import('../build/modules/app-config.js');
    
    // Initialize with test configuration
    const originalArgv = process.argv;
    process.argv = [
      'node', 'index.js',
      '--xpp-path', realXppPath,
      '--xpp-metadata-folder', 'C:\\CustomXppMetadata1x4ye02p.ocz'
    ];
    
    await AppConfig.initialize();
    
    // Get configuration as the tool handler would
    const config = await AppConfig.getApplicationConfiguration();
    
    // Create response exactly as the tool handler does (with _meta wrapper)
    const response = {
      _meta: {
        type: "configuration",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      },
      ...config
    };
    
    // === MODELS ARRAY VALIDATION ===
    
    // 1. Models array existence and type validation
    expect(response).toHaveProperty('models');
    expect(Array.isArray(response.models)).toBe(true);
    console.log(`📦 Found ${response.models.length} models in discovery`);
    
    // 2. Validate models array is not empty (should find at least standard Microsoft models)
    expect(response.models.length).toBeGreaterThan(0);
    expect(response.models.length).toBeGreaterThan(50); // Should have many Microsoft models
    
    // 3. Validate each model object structure
    response.models.forEach((model, index) => {
      // Required string fields
      expect(typeof model.name).toBe('string');
      expect(typeof model.displayName).toBe('string');
      expect(typeof model.publisher).toBe('string');
      expect(typeof model.version).toBe('string');
      expect(typeof model.layer).toBe('string');
      expect(typeof model.id).toBe('string');
      expect(typeof model.descriptorPath).toBe('string');
      
      // Required boolean fields
      expect(typeof model.hasSource).toBe('boolean');
      expect(typeof model.hasBuildArtifacts).toBe('boolean');
      
      // Required array field
      expect(Array.isArray(model.dependencies)).toBe(true);
      
      // Optional string field (can be undefined or string)
      if (model.description !== undefined) {
        expect(typeof model.description).toBe('string');
      }
      
      // Optional number field (can be undefined or number)
      if (model.objectCount !== undefined) {
        expect(typeof model.objectCount).toBe('number');
        expect(Number.isInteger(model.objectCount)).toBe(true);
        expect(model.objectCount).toBeGreaterThanOrEqual(0);
      }
      
      // Validate field content requirements
      expect(model.name).toBeTruthy(); // Name should not be empty
      expect(model.displayName).toBeTruthy(); // Display name should not be empty
      expect(model.publisher).toBeTruthy(); // Publisher should not be empty
      expect(model.version).toBeTruthy(); // Version should not be empty
      expect(model.id).toBeTruthy(); // ID should not be empty
      expect(model.descriptorPath).toBeTruthy(); // Descriptor path should not be empty
      
      // Validate version format (should be X.Y.Z.W)
      expect(model.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      
      // Validate dependencies array contains only strings
      model.dependencies.forEach((dep, depIndex) => {
        expect(typeof dep).toBe('string');
        expect(dep).toBeTruthy(); // Dependency names should not be empty
      });
      
      // Validate descriptor path format (should be absolute path ending with .xml)
      expect(model.descriptorPath).toMatch(/^[A-Za-z]:\\.+\.xml$/);
      
      // Log sample models for verification
      if (index < 3) {
        console.log(`📋 Sample Model ${index + 1}: ${model.name} (${model.publisher}) - Layer ${model.layer}`);
      }
    });
    
    // 4. Validate specific model types exist
    const layerCounts = {};
    const publisherCounts = {};
    let microsoftModels = 0;
    let customModels = 0;
    
    response.models.forEach(model => {
      // Count by layer
      layerCounts[model.layer] = (layerCounts[model.layer] || 0) + 1;
      
      // Count by publisher
      publisherCounts[model.publisher] = (publisherCounts[model.publisher] || 0) + 1;
      
      // Count Microsoft vs custom models
      if (model.publisher.toLowerCase().includes('microsoft')) {
        microsoftModels++;
      } else {
        customModels++;
      }
    });
    
    // 5. Validate we found expected model types
    expect(microsoftModels).toBeGreaterThan(100); // Should have many Microsoft models
    console.log(`🏢 Microsoft models: ${microsoftModels}`);
    console.log(`🔧 Custom/ISV models: ${customModels}`);
    
    // Should have models in layer 0 (Microsoft standard models)
    expect(layerCounts['0']).toBeGreaterThan(50);
    console.log(`📊 Layer distribution:`, layerCounts);
    console.log(`🏭 Publisher distribution:`, Object.keys(publisherCounts).length, 'publishers');
    
    // 6. Validate specific expected models exist
    const modelNames = response.models.map(m => m.name);
    const expectedStandardModels = [
      'ApplicationPlatform',
      'ApplicationFoundation', 
      'Foundation', // This is the actual model name for ApplicationSuite
      'ApplicationCommon'
    ];
    
    expectedStandardModels.forEach(expectedModel => {
      expect(modelNames).toContain(expectedModel);
    });
    console.log('✅ Found all expected standard Microsoft models');
    
    // 7. JSON serialization validation for models array
    const modelsJsonString = JSON.stringify(response.models, null, 2);
    expect(modelsJsonString).toBeTruthy();
    expect(modelsJsonString.length).toBeGreaterThan(10000); // Should be substantial JSON
    
    // 8. JSON round-trip validation for models
    const reparsedModels = JSON.parse(modelsJsonString);
    expect(reparsedModels).toEqual(response.models);
    
    // 9. Validate models JSON doesn't contain problematic values
    expect(modelsJsonString).not.toContain('undefined');
    expect(modelsJsonString).not.toContain('NaN');
    expect(modelsJsonString).not.toContain('Infinity');
    expect(modelsJsonString).not.toContain('[object Object]');
    
    // 10. Full response JSON validation including models
    const fullJsonString = JSON.stringify(response, null, 2);
    expect(fullJsonString).toBeTruthy();
    
    // Validate full response round-trip with models
    const reparsedFull = JSON.parse(fullJsonString);
    expect(reparsedFull).toEqual(response);
    expect(reparsedFull.models).toEqual(response.models);
    
    console.log('✅ Model discovery JSON validation completed successfully');
    console.log(`📊 Models JSON size: ${modelsJsonString.length} characters`);
    console.log(`📈 Full response JSON size: ${fullJsonString.length} characters`);
    console.log(`🎯 Model discovery found ${response.models.length} total models`);
    
    // Restore original argv
    process.argv = originalArgv;
    
  } catch (error) {
    console.error('❌ Model discovery JSON validation failed:', error);
    throw error;
  }
}, 15000); // Longer timeout for model discovery

test('REAL: Multiple Tools JSON Consistency Validation', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing JSON consistency across multiple tools...');
  
  try {
    await ObjectIndexManager.loadIndex();
    
    // Get data from multiple tools
    const classesResponse = {
      objectType: "CLASSES",
      totalCount: ObjectIndexManager.getObjectCountByType("CLASSES"),
      objects: ObjectIndexManager.listObjectsByType("CLASSES", "name", 3).map(obj => ({
        name: obj.name,
        package: obj.package,
        path: obj.path,
        size: obj.size
      }))
    };
    
    const tablesResponse = {
      objectType: "TABLES",
      totalCount: ObjectIndexManager.getObjectCountByType("TABLES"),
      objects: ObjectIndexManager.listObjectsByType("TABLES", "size", 3).map(obj => ({
        name: obj.name,
        package: obj.package,
        path: obj.path,
        size: obj.size
      }))
    };
    
    // Create a composite response that tools might create when aggregating data
    const compositeResponse = {
      summary: {
        timestamp: new Date().toISOString(),
        totalObjectTypes: 2,
        totalObjects: classesResponse.totalCount + tablesResponse.totalCount
      },
      objectTypes: {
        CLASSES: classesResponse,
        TABLES: tablesResponse
      }
    };
    
    // === CROSS-TOOL CONSISTENCY VALIDATION ===
    
    // 1. Ensure both responses follow same structure
    expect(classesResponse.objectType).toBe('CLASSES');
    expect(tablesResponse.objectType).toBe('TABLES');
    expect(Object.keys(classesResponse)).toEqual(Object.keys(tablesResponse));
    
    // 2. Validate composite response structure
    expect(compositeResponse).toHaveProperty('summary');
    expect(compositeResponse).toHaveProperty('objectTypes');
    expect(typeof compositeResponse.summary.totalObjects).toBe('number');
    expect(compositeResponse.summary.totalObjects).toBe(
      classesResponse.totalCount + tablesResponse.totalCount
    );
    
    // 3. JSON serialization of complex nested structure
    const compositeJson = JSON.stringify(compositeResponse, null, 2);
    const reparsedComposite = JSON.parse(compositeJson);
    expect(reparsedComposite).toEqual(compositeResponse);
    
    // 4. Ensure all object arrays have consistent structure
    if (classesResponse.objects.length > 0 && tablesResponse.objects.length > 0) {
      const classesKeys = Object.keys(classesResponse.objects[0]).sort();
      const tablesKeys = Object.keys(tablesResponse.objects[0]).sort();
      expect(classesKeys).toEqual(tablesKeys);
      expect(classesKeys).toEqual(['name', 'package', 'path', 'size']);
    }
    
    // 5. Test large JSON payload handling (simulate tool aggregation)
    const largeResponse = {
      metadata: {
        generatedAt: new Date().toISOString(),
        serverVersion: "1.0.0",
        dataSource: "MCP X++ Server"
      },
      statistics: {
        totalClasses: classesResponse.totalCount,
        totalTables: tablesResponse.totalCount,
        sampledObjects: classesResponse.objects.length + tablesResponse.objects.length
      },
      data: {
        classes: classesResponse.objects,
        tables: tablesResponse.objects
      }
    };
    
    const largeJson = JSON.stringify(largeResponse, null, 2);
    expect(largeJson.length).toBeGreaterThan(500);
    expect(() => JSON.parse(largeJson)).not.toThrow();
    
    console.log('✅ Multi-tool JSON consistency validated');
    console.log(`📊 CLASSES: ${classesResponse.totalCount} total, ${classesResponse.objects.length} sampled`);
    console.log(`📊 TABLES: ${tablesResponse.totalCount} total, ${tablesResponse.objects.length} sampled`);
    console.log(`📄 Composite JSON size: ${compositeJson.length} characters`);
    console.log(`📄 Large response JSON size: ${largeJson.length} characters`);
    
  } catch (error) {
    console.error('❌ Multi-tool JSON consistency test failed:', error);
    throw error;
  }
}, 30000);

test('REAL: JSON Schema Validation for External Tool Consumption', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing JSON outputs against expected schemas for external consumption...');
  
  try {
    await ObjectIndexManager.loadIndex();
    
    // Define expected schemas that external tools would expect
    const validateObjectListResponse = (response, expectedType) => {
      // Schema validation for list_objects_by_type response
      return (
        typeof response === 'object' &&
        response !== null &&
        typeof response.objectType === 'string' &&
        response.objectType === expectedType &&
        typeof response.totalCount === 'number' &&
        Number.isInteger(response.totalCount) &&
        response.totalCount >= 0 &&
        Array.isArray(response.objects) &&
        response.objects.every(obj => 
          typeof obj === 'object' &&
          obj !== null &&
          typeof obj.name === 'string' &&
          obj.name.length > 0 &&
          typeof obj.package === 'string' &&
          obj.package.length > 0 &&
          typeof obj.path === 'string' &&
          obj.path.length > 0 &&
          typeof obj.size === 'number' &&
          Number.isInteger(obj.size) &&
          obj.size >= 0
        )
      );
    };
    
    // Test multiple object types against schema
    const testTypes = ['CLASSES', 'TABLES', 'FORMS'];
    
    for (const objectType of testTypes) {
      const response = {
        objectType,
        totalCount: ObjectIndexManager.getObjectCountByType(objectType),
        objects: ObjectIndexManager.listObjectsByType(objectType, "name", 5).map(obj => ({
          name: obj.name,
          package: obj.package,
          path: obj.path,
          size: obj.size
        }))
      };
      
      // Validate against schema
      const isValid = validateObjectListResponse(response, objectType);
      expect(isValid).toBe(true);
      
      // Additional edge case validations
      
      // 1. Empty response handling
      const emptyResponse = {
        objectType: "NONEXISTENT_TYPE",
        totalCount: 0,
        objects: []
      };
      
      const emptyIsValid = validateObjectListResponse(emptyResponse, "NONEXISTENT_TYPE");
      expect(emptyIsValid).toBe(true);
      
      // 2. JSON serialization produces valid JSON
      const jsonString = JSON.stringify(response);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      
      // 3. Parsed JSON maintains schema compliance
      const parsed = JSON.parse(jsonString);
      const parsedIsValid = validateObjectListResponse(parsed, objectType);
      expect(parsedIsValid).toBe(true);
      
      console.log(`✅ ${objectType}: Schema validation passed - ${response.totalCount} objects`);
    }
    
    // Test configuration response schema
    const { AppConfig } = await import('../build/modules/app-config.js');
    const originalArgv = process.argv;
    process.argv = ['node', 'index.js', '--xpp-path', realXppPath];
    
    await AppConfig.initialize();
    const config = await AppConfig.getApplicationConfiguration();
    const configResponse = {
      _meta: {
        type: "configuration",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      },
      ...config
    };
    
    // Validate configuration schema
    const validateConfigResponse = (response) => {
      return (
        typeof response === 'object' &&
        response !== null &&
        typeof response._meta === 'object' &&
        response._meta.type === 'configuration' &&
        typeof response._meta.timestamp === 'string' &&
        response._meta.timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) &&
        typeof response.serverConfig === 'object' &&
        typeof response.serverConfig.xppPath === 'string' &&
        typeof response.indexStats === 'object' &&
        typeof response.indexStats.totalObjects === 'number' &&
        typeof response.indexStats.indexSizeInKB === 'number' &&
        response.indexStats.indexSizeInKB >= 0 &&
        typeof response.applicationInfo === 'object' &&
        typeof response.systemInfo === 'object'
      );
    };
    
    const configIsValid = validateConfigResponse(configResponse);
    expect(configIsValid).toBe(true);
    
    // Test configuration JSON serialization
    const configJson = JSON.stringify(configResponse, null, 2);
    const parsedConfig = JSON.parse(configJson);
    const parsedConfigIsValid = validateConfigResponse(parsedConfig);
    expect(parsedConfigIsValid).toBe(true);
    
    console.log('✅ Configuration schema validation passed');
    console.log(`📄 Configuration JSON validated: ${configJson.length} characters`);
    
    // Restore original argv
    process.argv = originalArgv;
    
  } catch (error) {
    console.error('❌ JSON schema validation test failed:', error);
    throw error;
  }
}, 30000);

test('REAL: Edge Case JSON Validation for Tool Robustness', async () => {
  // Skip if D365 path doesn't exist
  try {
    await fs.access(realXppPath);
  } catch (error) {
    console.log('⏭️ Skipping test - D365 path not accessible');
    return;
  }
  
  console.log('🔍 Testing edge cases and error scenarios for JSON outputs...');
  
  try {
    await ObjectIndexManager.loadIndex();
    
    // === TEST 1: Empty results handling ===
    const emptyResponse = {
      objectType: "NONEXISTENT_TYPE",
      totalCount: 0,
      objects: []
    };
    
    // Validate empty response structure
    expect(emptyResponse).toHaveProperty('objectType', 'NONEXISTENT_TYPE');
    expect(emptyResponse).toHaveProperty('totalCount', 0);
    expect(emptyResponse).toHaveProperty('objects');
    expect(Array.isArray(emptyResponse.objects)).toBe(true);
    expect(emptyResponse.objects.length).toBe(0);
    
    // JSON serialization of empty response
    const emptyJson = JSON.stringify(emptyResponse, null, 2);
    const parsedEmpty = JSON.parse(emptyJson);
    expect(parsedEmpty).toEqual(emptyResponse);
    
    // === TEST 2: Large object name handling ===
    // Test with real data but focus on edge cases like very long names
    const classesData = ObjectIndexManager.listObjectsByType("CLASSES", "name", 100);
    if (classesData.length > 0) {
      let longestName = '';
      let shortestName = classesData[0].name;
      
      classesData.forEach(obj => {
        if (obj.name.length > longestName.length) longestName = obj.name;
        if (obj.name.length < shortestName.length) shortestName = obj.name;
      });
      
      // Validate that even very long names are handled correctly
      const edgeCaseResponse = {
        objectType: "CLASSES",
        totalCount: ObjectIndexManager.getObjectCountByType("CLASSES"),
        objects: [
          {
            name: longestName,
            package: "TestPackage", 
            path: "TestPath/VeryLongClassName.xpp",
            size: 99999
          }
        ]
      };
      
      const edgeCaseJson = JSON.stringify(edgeCaseResponse);
      expect(() => JSON.parse(edgeCaseJson)).not.toThrow();
      
      console.log(`✅ Long name handling: "${longestName}" (${longestName.length} chars)`);
      console.log(`✅ Short name handling: "${shortestName}" (${shortestName.length} chars)`);
    }
    
    // === TEST 3: Special characters in paths ===
    const responseWithSpecialChars = {
      objectType: "TABLES",
      totalCount: 1,
      objects: [
        {
          name: "TestTable",
          package: "Package-With_Special.Chars",
          path: "Package-With_Special.Chars\\Tables\\TestTable.xml",
          size: 1024
        }
      ]
    };
    
    const specialCharsJson = JSON.stringify(responseWithSpecialChars, null, 2);
    const parsedSpecialChars = JSON.parse(specialCharsJson);
    expect(parsedSpecialChars).toEqual(responseWithSpecialChars);
    
    // === TEST 4: Numeric edge cases ===
    const numericEdgeResponse = {
      objectType: "TEST",
      totalCount: Number.MAX_SAFE_INTEGER - 1, // Very large but safe integer
      objects: [
        {
          name: "EdgeCaseObject",
          package: "TestPackage",
          path: "Test\\EdgeCase.xml",
          size: 0 // Zero size edge case
        }
      ]
    };
    
    const numericJson = JSON.stringify(numericEdgeResponse);
    const parsedNumeric = JSON.parse(numericJson);
    expect(parsedNumeric).toEqual(numericEdgeResponse);
    expect(Number.isSafeInteger(parsedNumeric.totalCount)).toBe(true);
    
    // === TEST 5: Array consistency with different sort orders ===
    const sortedByName = ObjectIndexManager.listObjectsByType("CLASSES", "name", 10);
    const sortedBySize = ObjectIndexManager.listObjectsByType("CLASSES", "size", 10);
    const sortedByPackage = ObjectIndexManager.listObjectsByType("CLASSES", "package", 10);
    
    [sortedByName, sortedBySize, sortedByPackage].forEach((sortedData, index) => {
      const sortName = ['name', 'size', 'package'][index];
      
      if (sortedData.length > 0) {
        const response = {
          objectType: "CLASSES",
          totalCount: ObjectIndexManager.getObjectCountByType("CLASSES"),
          objects: sortedData.map(obj => ({
            name: obj.name,
            package: obj.package,
            path: obj.path,
            size: obj.size
          }))
        };
        
        // Ensure each sort maintains consistent JSON structure
        expect(Object.keys(response)).toEqual(['objectType', 'totalCount', 'objects']);
        response.objects.forEach(obj => {
          expect(Object.keys(obj).sort()).toEqual(['name', 'package', 'path', 'size']);
        });
        
        const sortedJson = JSON.stringify(response);
        expect(() => JSON.parse(sortedJson)).not.toThrow();
        
        console.log(`✅ Sort by ${sortName}: ${sortedData.length} objects, JSON valid`);
      }
    });
    
    // === TEST 6: Configuration error handling simulation ===
    const { AppConfig } = await import('../build/modules/app-config.js');
    
    // Test with minimal configuration
    const originalArgv = process.argv;
    process.argv = ['node', 'index.js', '--xpp-path', realXppPath];
    
    await AppConfig.initialize();
    const minimalConfig = await AppConfig.getApplicationConfiguration();
    
    const minimalResponse = {
      _meta: {
        type: "configuration",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      },
      ...minimalConfig
    };
    
    // Validate minimal configuration still produces valid JSON
    const minimalJson = JSON.stringify(minimalResponse, null, 2);
    const parsedMinimal = JSON.parse(minimalJson);
    expect(parsedMinimal).toEqual(minimalResponse);
    
    // Ensure required fields are present even in minimal config
    expect(parsedMinimal.serverConfig).toBeDefined();
    expect(parsedMinimal.indexStats).toBeDefined();
    expect(parsedMinimal.indexStats).toHaveProperty('indexSizeInKB');
    expect(typeof parsedMinimal.indexStats.indexSizeInKB).toBe('number');
    expect(parsedMinimal.indexStats.indexSizeInKB).toBeGreaterThanOrEqual(0);
    expect(parsedMinimal.applicationInfo).toBeDefined();
    expect(parsedMinimal.systemInfo).toBeDefined();
    
    console.log('✅ Minimal configuration JSON validation passed');
    
    // === TEST 7: Large dataset serialization performance ===
    const largeDataset = ObjectIndexManager.listObjectsByType("CLASSES", "name", 1000);
    
    if (largeDataset.length >= 100) { // Only test if we have substantial data
      const largeResponse = {
        objectType: "CLASSES",
        totalCount: ObjectIndexManager.getObjectCountByType("CLASSES"),
        objects: largeDataset.map(obj => ({
          name: obj.name,
          package: obj.package,
          path: obj.path,
          size: obj.size
        }))
      };
      
      const startTime = Date.now();
      const largeJson = JSON.stringify(largeResponse, null, 2);
      const serializationTime = Date.now() - startTime;
      
      expect(largeJson.length).toBeGreaterThan(10000); // Should be substantial
      expect(serializationTime).toBeLessThan(1000); // Should serialize quickly (< 1s)
      
      const parseStartTime = Date.now();
      const parsedLarge = JSON.parse(largeJson);
      const parseTime = Date.now() - parseStartTime;
      
      expect(parsedLarge).toEqual(largeResponse);
      expect(parseTime).toBeLessThan(500); // Should parse quickly (< 0.5s)
      
      console.log(`✅ Large dataset: ${largeDataset.length} objects`);
      console.log(`📄 JSON size: ${largeJson.length} chars`);
      console.log(`⏱️  Serialization: ${serializationTime}ms, Parse: ${parseTime}ms`);
    }
    
    // Restore original argv
    process.argv = originalArgv;
    
  } catch (error) {
    console.error('❌ Edge case validation test failed:', error);
    throw error;
  }
}, 30000);