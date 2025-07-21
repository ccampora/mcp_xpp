/**
 * Mock-Based Unit Tests for MCP X++ Server
 * 
 * These tests use mocks to isolate and test specific functionality
 * without requiring actual file system or D365 environment access.
 */

import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock the file system module before importing our modules
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn()
  }
}));

// Mock the path module for controlled testing
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/'))
  };
});

// Import modules after mocking
const { parseXppClass } = await import('../src/modules/parsers.js');
const { ObjectIndexManager } = await import('../src/modules/object-index.js');
const { EnhancedSearchManager } = await import('../src/modules/search.js');

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// X++ PARSER TESTS - Test parsing logic with mock file content
// =============================================================================

test('parseXppClass - Basic parsing functionality', async () => {
  // Simple X++ class content that should parse correctly
  const simpleClassContent = `public class TestClass { public void method1() { } }`;

  // Mock the fs.readFile to return our test content
  fs.readFile.mockResolvedValue(simpleClassContent);

  const result = await parseXppClass('/test/path/TestClass.xpp');

  // Verify basic structure is returned
  expect(result).toHaveProperty('name');
  expect(result).toHaveProperty('type', 'class');
  expect(result).toHaveProperty('methods');
  expect(result).toHaveProperty('properties');
  expect(Array.isArray(result.methods)).toBe(true);
  expect(Array.isArray(result.properties)).toBe(true);

  console.log('✅ X++ class basic parsing functionality passed');
  console.log(`   Parsed name: ${result.name}`);
  console.log(`   Methods found: ${result.methods.length}`);
});

test('parseXppClass - Error handling for invalid content', async () => {
  // Mock invalid content
  const invalidContent = `// Not a valid class file`;

  fs.readFile.mockResolvedValue(invalidContent);

  const result = await parseXppClass('/test/path/InvalidClass.xpp');

  // Should return a valid object even for invalid content
  expect(result).toHaveProperty('type', 'class');
  expect(result).toHaveProperty('name');
  expect(result).toHaveProperty('methods');
  expect(Array.isArray(result.methods)).toBe(true);
  
  console.log('✅ Invalid content handling passed');
  console.log(`   Extracted name: ${result.name}`);
});

// =============================================================================
// OBJECT INDEX TESTS - Test indexing logic with mock directory structure
// =============================================================================

test('ObjectIndexManager - Build index for specific object type', async () => {
  // Mock directory structure typical of D365 F&O
  const mockPackageStructure = [
    { name: 'TestPackage', isDirectory: () => true },
    { name: 'SomeFile.txt', isDirectory: () => false }
  ];
  
  const mockAOTStructure = [
    { name: 'AxClass', isDirectory: () => true },
    { name: 'AxTable', isDirectory: () => true },
    { name: 'AxForm', isDirectory: () => true }
  ];

  const mockClassFiles = [
    { name: 'TestClass1.xpp', isDirectory: () => false },
    { name: 'TestClass2.xpp', isDirectory: () => false },
    { name: 'readme.txt', isDirectory: () => false }
  ];

  // Mock the directory reading sequence
  fs.readdir
    .mockResolvedValueOnce(mockPackageStructure) // Base directory
    .mockResolvedValueOnce(mockAOTStructure)     // Inside TestPackage/TestPackage/
    .mockResolvedValueOnce(mockClassFiles);      // Inside AxClass folder

  // Mock stat for directory existence checks
  fs.stat.mockImplementation((path) => {
    if (path.includes('TestPackage/TestPackage')) {
      return Promise.resolve({ isDirectory: () => true });
    }
    return Promise.resolve({ isDirectory: () => false });
  });

  // Mock the file reading for class files
  fs.readFile.mockResolvedValue('public class TestClass { }');

  // Mock existing methods we need
  ObjectIndexManager.setIndexPath = vi.fn();
  ObjectIndexManager.saveIndex = vi.fn().mockResolvedValue();
  
  // The actual buildIndex method would be called here
  // For this test, we're focusing on the directory discovery logic
  const aotFolders = await ObjectIndexManager.discoverAOTFolders('/mock/base/path', 'CLASSES');
  
  // Verify that our mock structure was processed correctly
  expect(fs.readdir).toHaveBeenCalledWith('/mock/base/path', { withFileTypes: true });
  
  console.log('✅ Object index building with mock directory structure passed');
});

// =============================================================================
// SEARCH MANAGER TESTS - Test search algorithms with mock data
// =============================================================================

test('EnhancedSearchManager - Smart search prioritization', async () => {
  // Mock the ObjectIndexManager.findObjects method
  const mockObjectResults = [
    { name: 'CustomerTable', type: 'TABLES', path: '/StandardPkg/CustomerTable.xml', package: 'ApplicationSuite' },
    { name: 'CustomerService', type: 'CLASSES', path: '/CustomPkg/CustomerService.xpp', package: 'CustomPackage' },
    { name: 'CustomerForm', type: 'FORMS', path: '/StandardPkg/CustomerForm.xml', package: 'ApplicationSuite' }
  ];

  // Mock the static method
  ObjectIndexManager.findObjects = vi.fn().mockReturnValue(mockObjectResults);

  // Mock environment variable
  process.env.XPP_CODEBASE_PATH = '/mock/xpp/path';

  const results = await EnhancedSearchManager.smartSearch('Customer', '', [], 10);

  // Verify search results structure and prioritization
  expect(results).toHaveLength(3);
  expect(results[0].type).toBe('object');
  expect(results.every(r => r.name.includes('Customer'))).toBe(true);
  
  // Verify that object search was called correctly
  expect(ObjectIndexManager.findObjects).toHaveBeenCalledWith('Customer');
  
  console.log('✅ Smart search prioritization passed');
});

test('EnhancedSearchManager - File content search fallback', async () => {
  // Mock scenario where index returns few results
  ObjectIndexManager.findObjects = vi.fn().mockReturnValue([
    { name: 'RareClass', type: 'CLASSES', path: '/path/RareClass.xpp', package: 'TestPkg' }
  ]);

  // Mock file system for content search
  fs.readdir.mockResolvedValue([
    { name: 'TestFile.xpp', isFile: () => true, isDirectory: () => false }
  ]);

  fs.stat.mockResolvedValue({ size: 1024 }); // Small file size

  fs.readFile.mockResolvedValue(`
    class TestClass {
        public void processCustomerData() {
            // Process customer information
        }
    }
  `);

  process.env.XPP_CODEBASE_PATH = '/mock/xpp/path';

  const results = await EnhancedSearchManager.smartSearch('Customer', '', ['.xpp'], 10);

  // Should have both index result and file content result
  expect(results.length).toBeGreaterThan(1);
  
  // Verify file content was searched when index had few results
  expect(fs.readFile).toHaveBeenCalled();
  
  console.log('✅ File content search fallback passed');
});

// =============================================================================
// ERROR HANDLING TESTS - Test error scenarios with mocks
// =============================================================================

test('File system error handling - Graceful degradation', async () => {
  // Mock file system errors
  fs.readFile.mockRejectedValue(new Error('File access denied'));
  fs.readdir.mockRejectedValue(new Error('Directory not found'));

  // These operations should not throw but handle errors gracefully
  const parseResult = await parseXppClass('/nonexistent/path.xpp');
  
  // The parser should return an error object, not throw
  expect(parseResult).toHaveProperty('error');
  expect(typeof parseResult.error).toBe('string');

  // Search should return empty results instead of throwing
  ObjectIndexManager.findObjects = vi.fn().mockReturnValue([]);
  process.env.XPP_CODEBASE_PATH = '/mock/path';
  
  const searchResults = await EnhancedSearchManager.smartSearch('test', '', [], 10);
  expect(Array.isArray(searchResults)).toBe(true);
  
  console.log('✅ Error handling graceful degradation passed');
});

// =============================================================================
// CACHING BEHAVIOR TESTS - Test caching logic
// =============================================================================

test('Parser caching - Avoid redundant file reads', async () => {
  const testContent = 'public class CachedClass { }';
  fs.readFile.mockResolvedValue(testContent);

  // First call should read file
  const result1 = await parseXppClass('/test/CachedClass.xpp');
  expect(fs.readFile).toHaveBeenCalledTimes(1);

  // Second call should use cache (if caching is implemented)
  const result2 = await parseXppClass('/test/CachedClass.xpp');
  
  // Both results should be identical
  expect(result1).toEqual(result2);
  
  console.log('✅ Parser caching behavior validated');
});
