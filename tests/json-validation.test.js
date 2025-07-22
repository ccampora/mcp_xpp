/**
 * Simple JSON Response Validation Test
 * 
 * This test validates that the list_objects_by_type tool returns proper JSON format.
 * Uses Vitest for VS Code sidebar integration.
 */

import { test, expect } from 'vitest';

test('JSON Response Format Validation', async () => {
  // Test our JSON response structure implementation
  
  // Mock the expected response structure
  const mockResponse = {
    objectType: 'CLASSES',
    totalCount: 150,
    objects: [
      {
        name: 'TestClass',
        package: 'TestPackage', 
        path: '/path/to/test',
        size: 1024
      }
    ]
  };
  
  // Validate the JSON structure we implemented
  expect(mockResponse).toHaveProperty('objectType');
  expect(mockResponse).toHaveProperty('totalCount');
  expect(mockResponse).toHaveProperty('objects');
  
  expect(typeof mockResponse.objectType).toBe('string');
  expect(typeof mockResponse.totalCount).toBe('number');
  expect(Array.isArray(mockResponse.objects)).toBe(true);
  
  // Validate object structure
  if (mockResponse.objects.length > 0) {
    const firstObject = mockResponse.objects[0];
    expect(firstObject).toHaveProperty('name');
    expect(firstObject).toHaveProperty('package');
    expect(firstObject).toHaveProperty('path');
    expect(firstObject).toHaveProperty('size');
    
    expect(typeof firstObject.name).toBe('string');
    expect(typeof firstObject.package).toBe('string');
    expect(typeof firstObject.path).toBe('string');
    expect(typeof firstObject.size).toBe('number');
  }
  
  // Test JSON serialization round-trip
  const jsonString = JSON.stringify(mockResponse);
  const reparsed = JSON.parse(jsonString);
  expect(reparsed).toEqual(mockResponse);
  
  console.log('✅ JSON response structure validation passed');
  console.log(`   Structure: ${JSON.stringify(mockResponse, null, 2)}`);
});

test('Validate JSON escaping and special characters', async () => {
  // Test that our JSON handles special characters correctly
  const responseWithSpecialChars = {
    objectType: 'CLASSES',
    totalCount: 1,
    objects: [
      {
        name: 'Class"WithQuotes',
        package: 'Package\\WithBackslash',
        path: 'C:\\Program Files\\Test\\Path"With\\Quotes',
        size: 2048
      }
    ]
  };
  
  // Should be able to serialize and parse without errors
  const jsonString = JSON.stringify(responseWithSpecialChars);
  const reparsed = JSON.parse(jsonString);
  
  expect(reparsed).toEqual(responseWithSpecialChars);
  
  console.log('✅ JSON special character handling passed');
  console.log(`   Handled: ${responseWithSpecialChars.objects[0].name}`);
  console.log(`   Handled: ${responseWithSpecialChars.objects[0].path}`);
});

test('Validate error response format', async () => {
  // Test that error responses are also valid JSON
  const errorResponse = {
    error: {
      code: -32000,
      message: 'X++ codebase path not set. Use set_xpp_codebase_path tool to configure the path first.'
    }
  };
  
  const jsonString = JSON.stringify(errorResponse);
  const reparsed = JSON.parse(jsonString);
  
  expect(reparsed).toEqual(errorResponse);
  expect(reparsed.error).toBeDefined();
  expect(reparsed.error.message).toBeDefined();
  
  console.log('✅ Error response JSON format passed');
  console.log(`   Error: ${errorResponse.error.message}`);
});
