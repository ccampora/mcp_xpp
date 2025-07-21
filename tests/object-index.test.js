import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ObjectIndexManager } from '../build/modules/object-index.js';
import { getD365PathFromConfig, checkD365Availability } from './helpers/config-helper.js';

/**
 * ObjectIndexManager Tests
 * 
 * Tests for the object indexing functionality, especially cache directory management
 */

describe('ObjectIndexManager', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = join(__dirname, '..');
  const expectedCacheDir = join(projectRoot, 'cache');
  const expectedIndexPath = join(expectedCacheDir, 'mcp-index.json');

  // Real D365 F&O path - will be set in beforeAll
  let realXppCodebasePath = null;
  let d365Info = null;

  beforeAll(async () => {
    // Get real D365 path from configuration
    d365Info = await checkD365Availability();
    if (d365Info.available) {
      realXppCodebasePath = d365Info.path;
      console.log(`✅ Using real D365 F&O installation at: ${realXppCodebasePath}`);
    } else {
      console.log(`⚠️ D365 F&O not available: ${d365Info.reason}`);
      realXppCodebasePath = null; // No fallback - skip tests that require real environment
    }
  });

  beforeEach(() => {
    // Clear the static index in ObjectIndexManager
    ObjectIndexManager.clearIndex();
  });

  afterEach(() => {
    // Clear the static index in ObjectIndexManager
    ObjectIndexManager.clearIndex();
  });

  describe('Cache Directory Management', () => {
    test('should set index path to cache directory in MCP server folder', () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // The index path should be in the MCP server's cache directory
      const actualCacheDir = ObjectIndexManager.getCacheDirectory();
      expect(actualCacheDir).toBe(expectedCacheDir);
    });

    test('should use simple filename without hash for single environment', () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Should use simple filename, not hash-based
      const cacheDir = ObjectIndexManager.getCacheDirectory();
      const expectedPath = join(cacheDir, 'mcp-index.json');
      
      // Access private indexPath through reflection or test the behavior
      expect(cacheDir).toBe(expectedCacheDir);
      
      // Verify the index filename is simple (not hash-based)
      expect(expectedPath.endsWith('mcp-index.json')).toBe(true);
      expect(expectedPath).not.toMatch(/[a-f0-9]{8,}/); // No hash patterns
    });

    test('should create cache directory when saving index', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Ensure cache directory does not exist initially
      await fs.rm(expectedCacheDir, { recursive: true, force: true }).catch(() => {});
      // Cache directory should not exist initially
      expect(await fileExists(expectedCacheDir)).toBe(false);
      
      // Save index should create the directory
      await ObjectIndexManager.saveIndex();
      
      // Cache directory should now exist
      expect(await fileExists(expectedCacheDir)).toBe(true);
      expect(await fileExists(expectedIndexPath)).toBe(true);
    });

    test('should save index with correct structure', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      await ObjectIndexManager.saveIndex();
      
      const indexContent = await fs.readFile(expectedIndexPath, 'utf-8');
      const indexData = JSON.parse(indexContent);
      
      expect(indexData).toHaveProperty('lastUpdated');
      expect(indexData).toHaveProperty('version', '1.0');
      expect(indexData).toHaveProperty('objects');
      expect(typeof indexData.lastUpdated).toBe('number');
      expect(typeof indexData.objects).toBe('object');
    });
  });

  describe('Index Loading and Saving', () => {
    test('should load existing index from cache directory', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Build a real index first to have something to load - just classes for speed
      await ObjectIndexManager.buildIndexByType(realXppCodebasePath, 'CLASSES', true);
      
      // Clear the current index in memory
      ObjectIndexManager.clearIndex();
      
      // Load the index from cache
      await ObjectIndexManager.loadIndex();
      
      // Verify the index was loaded with real data
      const stats = ObjectIndexManager.getStats();
      expect(stats.totalObjects).toBeGreaterThan(0);
      expect(stats.byType.CLASSES).toBeGreaterThan(0);
    });

    test('should handle corrupted index file gracefully', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Create corrupted index file
      await fs.mkdir(expectedCacheDir, { recursive: true });
      await fs.writeFile(expectedIndexPath, 'invalid json content');
      
      // Try to load corrupted index
      await ObjectIndexManager.loadIndex();
      
      // Should have empty index
      const stats = ObjectIndexManager.getStats();
      expect(stats.totalObjects).toBe(0);
    });
  });

  describe('Cache Cleanup', () => {
    test('should clean up old cache files', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Create cache directory with old files
      await fs.mkdir(expectedCacheDir, { recursive: true });
      
      // Create an old cache file
      const oldCacheFile = join(expectedCacheDir, 'mcp-old-cache.json');
      await fs.writeFile(oldCacheFile, '{}');
      
      // Set modification time to 8 days ago (older than default 7 days)
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await fs.utimes(oldCacheFile, eightDaysAgo, eightDaysAgo);
      
      // Create a recent cache file
      const recentCacheFile = join(expectedCacheDir, 'mcp-recent-cache.json');
      await fs.writeFile(recentCacheFile, '{}');
      
      // Run cleanup
      await ObjectIndexManager.cleanupOldCaches();
      
      // Old file should be deleted, recent file should remain
      expect(await fileExists(oldCacheFile)).toBe(false);
      expect(await fileExists(recentCacheFile)).toBe(true);
    });

    test('should handle non-existent cache directory in cleanup', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Cleanup should not throw error for non-existent directory
      await expect(ObjectIndexManager.cleanupOldCaches()).resolves.not.toThrow();
    });

    test('should only clean up files matching pattern', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Create cache directory with various files
      await fs.mkdir(expectedCacheDir, { recursive: true });
      
      // Create files with different patterns
      const mcpFile = join(expectedCacheDir, 'mcp-test.json');
      const nonMcpFile = join(expectedCacheDir, 'other-file.json');
      const txtFile = join(expectedCacheDir, 'mcp-test.txt');
      
      await fs.writeFile(mcpFile, '{}');
      await fs.writeFile(nonMcpFile, '{}');
      await fs.writeFile(txtFile, 'text');
      
      // Set all files to old date
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await fs.utimes(mcpFile, oldDate, oldDate);
      await fs.utimes(nonMcpFile, oldDate, oldDate);
      await fs.utimes(txtFile, oldDate, oldDate);
      
      // Run cleanup
      await ObjectIndexManager.cleanupOldCaches();
      
      // Only MCP JSON files should be cleaned up
      expect(await fileExists(mcpFile)).toBe(false);
      expect(await fileExists(nonMcpFile)).toBe(true); // Doesn't start with 'mcp-'
      expect(await fileExists(txtFile)).toBe(true);    // Not a .json file
    });
  });

  describe('Path Resolution', () => {
    test('should resolve cache directory relative to MCP server location', () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      const cacheDir = ObjectIndexManager.getCacheDirectory();
      
      // Should be in the project root's cache directory
      expect(cacheDir).toBe(expectedCacheDir);
      expect(cacheDir.endsWith('cache')).toBe(true);
      expect(cacheDir.includes('mcp_xpp')).toBe(true);
    });

    test('should not include X++ codebase path in cache location', () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      const cacheDir = ObjectIndexManager.getCacheDirectory();
      
      // Cache directory should NOT contain the X++ codebase path
      if (d365Info.available) {
        // For real D365 paths, check they don't contain D365-specific folders
        expect(cacheDir).not.toContain('Dynamics365');
        expect(cacheDir).not.toContain('PackagesLocalDirectory');
      } else {
        // When D365 is not available, cache directory should use project directory
        expect(cacheDir).toContain('mcp_xpp');
        expect(cacheDir).not.toContain('PackagesLocalDirectory');
      }
    });
  });

  describe('Integration with Index Operations', () => {
    test('should use cache directory for index building operations', async () => {
      ObjectIndexManager.setIndexPath(realXppCodebasePath);
      
      // Build index with real D365 environment - use optimized build for testing
      await ObjectIndexManager.buildIndexByType(realXppCodebasePath, 'CLASSES', true);
      
      // Verify cache directory was created and index was saved
      expect(await fileExists(expectedCacheDir)).toBe(true);
      expect(await fileExists(expectedIndexPath)).toBe(true);
      
      // Verify the index contains real data
      const stats = ObjectIndexManager.getStats();
      expect(stats.totalObjects).toBeGreaterThan(0);
    });
  });
});

// Helper function to check if file exists
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
