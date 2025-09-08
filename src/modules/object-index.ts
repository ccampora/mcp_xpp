import { promises as fs } from "fs";
import { join, relative, basename, extname, dirname } from "path";
import { ObjectIndex } from "./types.js";
import { AOTStructureManager } from "./aot-structure.js";
import { AOTStructureCacheManager } from "./aot-structure-cache.js";
import { isXppRelatedFile, getPackagePriority } from "./utils.js";
import { MAX_FILE_SIZE } from "./config.js";
import { AppConfig } from "./app-config.js";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { D365ServiceClient } from "./d365-service-client.js";
import { SQLiteObjectLookup, ObjectLocation } from "./sqlite-lookup.js";

// AOT folder cache for fast lookups
const aotFoldersCache = new Map<string, string[]>();

// Cache for AOT patterns to avoid repeated file reads
let aotPatternsCache: Map<string, string> | null = null;

/**
 * Object Index Manager using pure SQLite storage - no in-memory structures
 */
export class ObjectIndexManager {
  private static sqliteIndex: SQLiteObjectLookup | null = null;

  /**
   * Get XPP codebase path from AppConfig
   */
  private static getXppPath(): string | null {
    return AppConfig.getXppPath() || null;
  }

  /**
   * Phase 1: Discover all AOT folders matching Ax* patterns
   * This is much faster than walking every directory
   * Optimized for D365 F&O double-nested package structure
   */
  static async discoverAOTFolders(basePath: string, objectType?: string): Promise<Map<string, string[]>> {
    const cacheKey = objectType || 'ALL';
    
    if (aotFoldersCache.has(cacheKey)) {
      return new Map(aotFoldersCache.get(cacheKey)!.map(path => [path, []]));
    }

    const aotFolders = new Map<string, string[]>();
    
    // Use simple direct AOT folder patterns - much faster and more accurate
    const targetPatterns: string[] = [];
    
    if (objectType) {
      // For specific object types, use targeted patterns
      targetPatterns.push(`Ax${objectType}`);
    } else {
      // For full indexing, use simple Ax* pattern - let scanDirectlyForAOTFolders handle the filtering
      targetPatterns.push('Ax');
    }

    // Removed for performance
    
    // Scan for AOT folders in D365 F&O package structure
    await this.scanPackagesForAOTFolders(basePath, basePath, aotFolders, targetPatterns, objectType);
    
    // Cache the discovered folders
    aotFoldersCache.set(cacheKey, Array.from(aotFolders.keys()));

    return aotFolders;
  }

  /**
   * Scan packages for AOT folders using D365 F&O package structure
   * PackageName/PackageName/AxClass, AxTable, etc.
   */
  private static async scanPackagesForAOTFolders(
    dirPath: string,
    basePath: string,
    aotFolders: Map<string, string[]>,
    targetPatterns: string[],
    objectType?: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Look for potential package folders
      for (const entry of entries) {
        if (entry.isDirectory() && 
            !entry.name.startsWith('.') && 
            !entry.name.startsWith('Ax') &&
            !['node_modules', 'bin', 'obj', 'temp', '.git'].includes(entry.name.toLowerCase())) {
          
          const packageName = entry.name;
          const packagePath = join(dirPath, packageName);
          const innerPackagePath = join(packagePath, packageName);
          
          try {
            const innerStats = await fs.stat(innerPackagePath);
            if (innerStats.isDirectory()) {
              // Found double-nested structure! Scan inner package for AOT folders
              // // Removed for performance
              await this.scanDirectlyForAOTFolders(innerPackagePath, basePath, aotFolders, targetPatterns, packageName, objectType);
            } else {
              // Single-level package, scan normally
              await this.scanDirectlyForAOTFolders(packagePath, basePath, aotFolders, targetPatterns, packageName, objectType);
            }
          } catch (error) {
            // Inner package doesn't exist, treat as single-level
            await this.scanDirectlyForAOTFolders(packagePath, basePath, aotFolders, targetPatterns, packageName, objectType);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't access
      console.log(`⚠️ Could not access directory: ${relative(basePath, dirPath)}`);
    }
  }

  /**
   * Directly scan for AOT folders within a validated package structure
   * This is much faster as we know we're in the right location
   * PERFORMANCE CRITICAL: Quick empty folder check using fast readdir
   */
  private static async scanDirectlyForAOTFolders(
    packagePath: string,
    basePath: string,
    aotFolders: Map<string, string[]>,
    targetPatterns: string[],
    packageName: string,
    objectType?: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(packagePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('Ax')) {
          const fullPath = join(packagePath, entry.name);
          
          // PERFORMANCE: Quick check for .xml files only (no subdirectory scanning)
          try {
            const folderEntries = await fs.readdir(fullPath, { withFileTypes: true });
            const hasXmlFiles = folderEntries.some(e => e.isFile() && e.name.endsWith('.xml'));
            
            if (hasXmlFiles) {
              aotFolders.set(fullPath, []);
            }
          } catch (error) {
            // Skip folders we can't access
          }
        }
      }
    } catch (error) {
      // Skip packages we can't access
      console.log(`⚠️ Could not access package: ${packageName}`);
    }
  }

  /**
   * Get the cache directory path
   */
  static getCacheDirectory(): string {
    const currentModulePath = fileURLToPath(import.meta.url);
    const mcpServerDir = join(dirname(currentModulePath), '..', '..');
    return join(mcpServerDir, 'cache');
  }

  /**
   * Clean up old cache files (optional utility method)
   * Optimized version using readdir with withFileTypes for better performance
   */
  static async cleanupOldCaches(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const cacheDir = this.getCacheDirectory();
      if (!(await this.fileExists(cacheDir))) return;

      // Use withFileTypes to get file info in single call
      const entries = await fs.readdir(cacheDir, { withFileTypes: true });
      const now = Date.now();
      
      // Process files in parallel for better performance
      const cleanupPromises = entries
        .filter(entry => 
          entry.isFile() && 
          entry.name.startsWith('mcp-') && 
          entry.name.endsWith('.json')
        )
        .map(async (entry) => {
          try {
            const filePath = join(cacheDir, entry.name);
            const stats = await fs.stat(filePath);
            
            if (now - stats.mtime.getTime() > maxAgeMs) {
              await fs.unlink(filePath);
              console.log(`Cleaned up old cache file: ${entry.name}`);
              return entry.name;
            }
            return null;
          } catch (error) {
            // Skip files that can't be processed
            return null;
          }
        });

      // Wait for all cleanup operations to complete
      const results = await Promise.all(cleanupPromises);
      const cleanedCount = results.filter(result => result !== null).length;
      
      if (cleanedCount > 0) {
        console.log(`Cache cleanup completed: ${cleanedCount} files removed`);
      }
    } catch (error) {
      console.error("Error cleaning up cache:", error);
    }
  }

  static async buildFullIndex(forceRebuild: boolean = false): Promise<void> {
    // First try DLL-based indexing if VS2022 service is available
    try {
      console.log('🚀 Attempting DLL-based indexing via VS2022 service...');
      await this.buildDLLBasedIndex(forceRebuild);
      console.log('✅ DLL-based indexing completed successfully!');
      return;
    } catch (error) {
      console.warn(`⚠️  DLL-based indexing failed, falling back to file-based: ${(error as Error).message}`);
    }

  }

  /**
   * Get available models dynamically from VS2022 C# service
   */
  private static async getAvailableModelsFromService(): Promise<string[]> {
    try {
      const client = new D365ServiceClient();
      await client.connect();
      
      const result = await client.sendRequest('models', undefined, {});
      await client.disconnect();
      
      if (result.Success && result.Data?.models) {
        // Filter to only models that have objects and are standard D365 models
        const modelsWithObjects = result.Data.models
          .filter((model: any) => model.HasObjects && (model.Type === 'Standard' || model.ObjectCount > 0))
          .map((model: any) => model.Name);
          
        console.log(`📋 Discovered ${modelsWithObjects.length} D365 models with objects via DLL enumeration`);
        return modelsWithObjects;
      }
      
      console.warn('⚠️  Failed to get models from C# service, using hardcoded fallback');
      // Fallback to known working models
      return [
        'ApplicationCommon',
        'ApplicationFoundation',
        'ApplicationPlatform',
        'Foundation'
      ];
    } catch (error) {
      console.warn(`⚠️  Could not connect to C# service for model discovery: ${(error as Error).message}`);
      // Fallback to known working models
      return [
        'ApplicationCommon',
        'ApplicationFoundation',
        'ApplicationPlatform',
        'Foundation'
      ];
    }
  }

  /**
   * New DLL-based indexing using VS2022 C# service - writes directly to SQLite
   */
  static async buildDLLBasedIndex(forceRebuild: boolean = false): Promise<void> {
    this.initializeSQLiteIndex();
    
    if (!forceRebuild) {
      // Check if SQLite already has objects
      const totalCount = this.sqliteIndex!.getTotalCount();
      if (totalCount > 0) {
        console.log(`📊 SQLite index already has ${totalCount} objects, skipping rebuild`);
        return;
      }
    }

    console.log('🔌 Connecting to VS2022 C# service for DLL-based enumeration...');
    
    const client = new D365ServiceClient();
    await client.connect();
    
    try {
      // Get target models dynamically from the service
      const TARGET_MODELS = await this.getAvailableModelsFromService();
      
      if (TARGET_MODELS.length === 0) {
        throw new Error('No models discovered from C# service');
      }

      let totalObjects = 0;

      console.log(`📊 Processing ${TARGET_MODELS.length} models via DLL enumeration...`);

      for (const modelName of TARGET_MODELS) {
        const modelStartTime = Date.now();
        console.log(`🔍 Processing model: ${modelName}`);
        
        try {
          // Use our ListObjectsByModelHandler
          const result = await client.sendRequest('list_objects_by_model', undefined, {
            model: modelName
          });

          if (!result.Success) {
            console.warn(`   ⚠️  Failed to enumerate ${modelName}: ${result.Error || 'Unknown error'}`);
            continue;
          }

          const modelData = result.Data.models[0];
          if (!modelData || !modelData.objects) {
            console.log(`   ⚠️  No objects found in model ${modelName}`);
            continue;
          }

          let modelObjectCount = 0;

          // Process each object type in the model - data goes directly to SQLite during C# service processing
          for (const [objectType, objects] of Object.entries(modelData.objects)) {
            modelObjectCount += (objects as any[]).length;
            totalObjects += (objects as any[]).length;
          }

          const modelTime = Date.now() - modelStartTime;
          console.log(`   ✅ ${modelObjectCount} objects (${modelTime}ms)`);

        } catch (error) {
          console.error(`   ❌ Error processing ${modelName}:`, (error as Error).message);
        }
      }

      console.log(`🎉 DLL-based indexing complete: ${totalObjects} objects indexed via service enumeration!`);

    } finally {
      await client.disconnect();
      console.log('📡 Disconnected from VS2022 service');
    }
  }

  static findObjects(name: string, type?: string): ObjectLocation[] {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      console.warn('⚠️  SQLite index not available');
      return [];
    }

    try {
      // Use SQLite to find objects by name
      let results = this.sqliteIndex.findObject(name);
      
      // Filter by type if specified
      if (type) {
        results = results.filter(obj => obj.type === type);
      }

      // Sort by priority: exact match first, then by name
      const lowerName = name.toLowerCase();
      return results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === lowerName ? 1 : 0;
        const bExact = b.name.toLowerCase() === lowerName ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('❌ Error finding objects:', error);
      return [];
    }
  }

  /**
   * Initialize SQLite lookup for stats
   */
  private static initializeSQLiteIndex(): void {
    if (!this.sqliteIndex) {
      this.sqliteIndex = new SQLiteObjectLookup();
      this.sqliteIndex.initialize();
    }
  }

  static getStats(): { totalObjects: number; byType: Record<string, number>; byPackage: Record<string, number> } {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      console.warn('⚠️  SQLite index not available');
      return {
        totalObjects: 0,
        byType: {},
        byPackage: {}
      };
    }

    try {
      const totalCount = this.sqliteIndex.getTotalCount();
      const typeStats = this.sqliteIndex.getTypeStats();
      const modelStats = this.sqliteIndex.getModelStats();
      
      return {
        totalObjects: totalCount,
        byType: typeStats,
        byPackage: modelStats
      };
    } catch (error) {
      console.error('❌ Error getting stats from SQLite:', error);
      return {
        totalObjects: 0,
        byType: {},
        byPackage: {}
      };
    }
  }

  static listObjectsByType(objectType: string, sortBy: 'name' | 'package' | 'size' = 'name', limit?: number): ObjectLocation[] {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      console.warn('⚠️  SQLite index not available');
      return [];
    }

    try {
      // Use SQLite to find objects by type
      let results = this.sqliteIndex.findObjectsByType(objectType);

      // Sort results based on specified criteria
      results.sort((a: ObjectLocation, b: ObjectLocation) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'package':
            const packageCompare = a.model.localeCompare(b.model);
            return packageCompare !== 0 ? packageCompare : a.name.localeCompare(b.name);
          case 'size':
            // Size sorting not available in SQLite data, fall back to name
            return a.name.localeCompare(b.name);
          default:
            return a.name.localeCompare(b.name);
        }
      });

      // Apply limit if specified
      return limit ? results.slice(0, limit) : results;
    } catch (error) {
      console.error('❌ Error listing objects by type:', error);
      return [];
    }
  }

  private static async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  static getObjectCountByType(objectType: string): number {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      console.warn('⚠️  SQLite index not available');
      return 0;
    }

    try {
      const typeStats = this.sqliteIndex.getTypeStats();
      return typeStats[objectType] || 0;
    } catch (error) {
      console.error('❌ Error getting object count by type:', error);
      return 0;
    }
  }

  /**
   * Clear the current index (for testing purposes) - No longer needed with SQLite-only approach
   */
  static clearIndex(): void {
    // SQLite-based system doesn't need clearing - data persists in database
    console.log('📊 SQLite-based index doesn\'t require clearing - data persists in database');
  }
}
