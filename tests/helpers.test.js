import { jest } from '@jest/globals';
import { MCPTestHelper } from './helpers/mcp-test-helper.js';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Unit tests for MCP Test Helper utilities
 */

describe('MCP Test Helper', () => {
  let helper;

  beforeEach(() => {
    helper = new MCPTestHelper();
  });

  afterEach(async () => {
    await helper.cleanupMockCodebase();
  });

  describe('Mock Codebase Generation', () => {
    test('should generate valid class XML', () => {
      const xml = helper.generateMockClassXml('TestClass');
      
      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<AxClass');
      expect(xml).toContain('<Name>TestClass</Name>');
      expect(xml).toContain('public class TestClass');
      expect(xml).toContain('<Method>');
      expect(xml).toContain('testMethod');
    });

    test('should generate valid table XML', () => {
      const xml = helper.generateMockTableXml('TestTable');
      
      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<AxTable');
      expect(xml).toContain('<Name>TestTable</Name>');
      expect(xml).toContain('<Fields>');
      expect(xml).toContain('<Indexes>');
      expect(xml).toContain('RecId');
    });

    test('should generate valid form XML', () => {
      const xml = helper.generateMockFormXml('TestForm');
      
      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<AxForm');
      expect(xml).toContain('<Name>TestForm</Name>');
      expect(xml).toContain('<Label>TestForm Form</Label>');
    });

    test('should create mock codebase structure', async () => {
      await helper.createMockCodebase();
      
      // Check that directories were created
      const testPackagePath = join(helper.mockCodebasePath, 'TestPackage');
      const anotherPackagePath = join(helper.mockCodebasePath, 'AnotherPackage');
      
      expect(await fs.access(testPackagePath).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(anotherPackagePath).then(() => true).catch(() => false)).toBe(true);
      
      // Check that files were created
      const testClassPath = join(testPackagePath, 'TestPackage', 'AxClass', 'TestClass.xml');
      const testTablePath = join(testPackagePath, 'TestPackage', 'AxTable', 'TestTable.xml');
      
      expect(await fs.access(testClassPath).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(testTablePath).then(() => true).catch(() => false)).toBe(true);
      
      // Check file contents
      const classContent = await fs.readFile(testClassPath, 'utf-8');
      expect(classContent).toContain('TestClass');
      expect(classContent).toContain('<AxClass');
    });
  });

  describe('Server Lifecycle Management', () => {
    test('should handle server start/stop cycle', async () => {
      expect(helper.serverProcess).toBeNull();
      
      await helper.startServer();
      expect(helper.serverProcess).not.toBeNull();
      
      await helper.stopServer();
      expect(helper.serverProcess).toBeNull();
    });
  });

  describe('Cleanup Operations', () => {
    test('should clean up mock codebase completely', async () => {
      await helper.createMockCodebase();
      
      // Verify codebase exists
      expect(await fs.access(helper.mockCodebasePath).then(() => true).catch(() => false)).toBe(true);
      
      await helper.cleanupMockCodebase();
      
      // Verify codebase is removed
      expect(await fs.access(helper.mockCodebasePath).then(() => true).catch(() => false)).toBe(false);
    });
  });
});
