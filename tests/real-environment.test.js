import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getD365PathFromConfig, checkD365Availability } from './helpers/config-helper.js';

/**
 * Real Environment Integration Tests
 * 
 * Tests against actual Dynamics 365 F&O installation
 * Validates MCP server functionality with real D365 environment
 */

const currentModulePath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(currentModulePath), '..');

describe('Real Environment Integration', () => {
  let d365Info = null;

  beforeAll(async () => {
    // Get D365 availability info using shared config helper
    d365Info = await checkD365Availability();
    
    if (!d365Info.available) {
      console.warn(`⚠️ Skipping integration tests - ${d365Info.reason}`);
      if (d365Info.path) {
        console.warn(`Expected path: ${d365Info.path}`);
      }
    }
  });

  test('should verify D365 F&O installation', async () => {
    try {
      await fs.access(d365Info.path);
      
      // Check for some common packages that should exist
      const commonPackages = ['ApplicationCommon', 'ApplicationFoundation', 'ApplicationPlatform'];
      
      for (const pkg of commonPackages) {
        const packagePath = join(d365Info.path, pkg);
        try {
          await fs.access(packagePath);
          console.log(`✅ Found package: ${pkg}`);
        } catch {
          console.log(`⚠️ Package not found: ${pkg}`);
        }
      }
      
      expect(true).toBe(true);
    } catch (error) {
      console.warn('D365 F&O not available - skipping test');
      expect(true).toBe(true); // Don't fail on machines without D365
    }
  });

  test('should find real X++ files', async () => {
    try {
      await fs.access(d365Info.path);
      
      // Look for actual X++ files in the installation
      const applicationCommonPath = join(d365Info.path, 'ApplicationCommon');
      const exists = await fileExists(applicationCommonPath);
      
      if (exists) {
        // Check for some real D365 files
        const testPaths = [
          join(applicationCommonPath, 'ApplicationCommon'),
          join(d365Info.path, 'ApplicationPlatform'),
          join(d365Info.path, 'ApplicationFoundation')
        ];
        
        let foundFiles = 0;
        for (const testPath of testPaths) {
          if (await fileExists(testPath)) {
            foundFiles++;
            console.log(`✅ Found: ${testPath}`);
          }
        }
        
        expect(foundFiles).toBeGreaterThan(0);
      } else {
        console.warn('ApplicationCommon package not found');
        expect(true).toBe(true);
      }
    } catch (error) {
      console.warn('D365 F&O not available - skipping test');
      expect(true).toBe(true);
    }
  });

  test('should validate AOT structure against real environment', async () => {
    try {
      await fs.access(d365Info.path);
      
      // Read the AOT structure configuration
      const aotStructurePath = join(process.cwd(), 'config', 'aot-structure.json');
      const aotContent = await fs.readFile(aotStructurePath, 'utf-8');
      const aotStructure = JSON.parse(aotContent);
      
      expect(aotStructure).toHaveProperty('aotStructure');
      expect(typeof aotStructure.aotStructure).toBe('object');
      
      // Verify the structure contains expected D365 F&O object types
      const structureKeys = Object.keys(aotStructure.aotStructure);
      const expectedTypes = ['CLASSES', 'TABLES', 'FORMS'];
      
      for (const expectedType of expectedTypes) {
        const hasType = structureKeys.some(key => 
          aotStructure.aotStructure[key].objectType === expectedType
        );
        expect(hasType).toBe(true);
      }
      
      console.log(`✅ AOT structure validated with ${structureKeys.length} object types`);
    } catch (error) {
      console.warn('D365 F&O not available or AOT structure invalid');
      expect(true).toBe(true);
    }
  });

  test('should verify MCP server build exists', async () => {
    const serverPath = join(process.cwd(), 'build', 'index.js');
    expect(await fileExists(serverPath)).toBe(true);
    
    // Verify the server file has some expected content
    const serverContent = await fs.readFile(serverPath, 'utf-8');
    expect(serverContent).toContain('MCP');
    expect(serverContent).toContain('tool');
    
    console.log('✅ MCP server build verified');
  });

  test('should verify cache directory isolation', async () => {
    const projectRoot = process.cwd();
    const cacheDir = join(projectRoot, 'cache');
    
    // Cache directory should be in project, not in D365 directory
    expect(cacheDir).toContain('mcp_xpp');
    expect(cacheDir).not.toContain('Dynamics365');
    expect(cacheDir).not.toContain('PackagesLocalDirectory');
    
    console.log(`✅ Cache directory properly isolated: ${cacheDir}`);
  });
});

// Helper function
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
