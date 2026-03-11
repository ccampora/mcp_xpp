import { promises as fs } from "fs";
import { join, relative, basename, extname, dirname } from "path";
import { fileURLToPath } from "url";
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
   * Phase 1: Discover all AOT folders matching Ax* patterns
   * This is much faster than walking every directory
   * Optimized for D365 F&O double-nested package structure
   * Note: This method is primarily for fallback scenarios - VS2022 service handles primary indexing
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
      console.error(`⚠️ Could not access directory: ${relative(basePath, dirPath)}`);
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
      console.error(`⚠️ Could not access package: ${packageName}`);
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
              console.error(`Cleaned up old cache file: ${entry.name}`);
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
        console.error(`Cache cleanup completed: ${cleanedCount} files removed`);
      }
    } catch (error) {
      console.error("Error cleaning up cache:", error);
    }
  }

  /**
   * Extract ObjectLocation entries from a single model's AOT folder tree.
   * Walks ModelName/AxClass/*.xml, ModelName/AxTable/*.xml, etc.
   */
  private static async extractObjectsFromModelFolder(
    modelName: string,
    innerModelPath: string
  ): Promise<ObjectLocation[]> {
    const objects: ObjectLocation[] = [];

    try {
      const entries = await fs.readdir(innerModelPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('Ax')) continue;

        const objectType = entry.name; // e.g. "AxClass", "AxTable"
        const aotFolderPath = join(innerModelPath, objectType);

        try {
          const xmlFiles = await fs.readdir(aotFolderPath);

          for (const xmlFile of xmlFiles) {
            if (!xmlFile.endsWith('.xml')) continue;

            const objectName = xmlFile.slice(0, -4); // strip .xml
            objects.push({
              name: objectName,
              path: `${modelName}/${objectType}/${objectName}`,
              model: modelName,
              type: objectType,
              lastModified: new Date().toISOString(),
              hasCode: true,
              isValid: true,
            });
          }
        } catch {
          // skip AOT folders we cannot access
        }
      }
    } catch (error) {
      console.error(`⚠️ Could not scan model folder ${modelName}: ${(error as Error).message}`);
    }

    return objects;
  }

  /**
   * Supplement the index with objects found on the filesystem under the parent
   * directory of xppMetadataFolder.  This catches custom models (HSO, Dometic,
   * DYSAdministrativeTools …) that the VS2022 service may not enumerate.
   *
   * Directory layout expected:
   *   <parentDir>/
   *     ModelName/          ← outer folder
   *       ModelName/        ← inner (double-nested) folder
   *         AxClass/
   *           Foo.xml
   *         AxTable/
   *           Bar.xml
   */
  static async buildIndexFromCustomModelPaths(xppMetadataFolder: string): Promise<void> {
    const parentDir = dirname(xppMetadataFolder);
    console.error(`🔍 Supplementing index with filesystem models from: ${parentDir}`);

    // Collect already-indexed model names so we skip duplicates
    const modelStats = this.sqliteIndex ? this.sqliteIndex.getModelStats() : {};
    const alreadyIndexed = new Set(Object.keys(modelStats).map(m => m.toLowerCase()));

    const customObjects: ObjectLocation[] = [];

    // Names that are not D365 model folders
    const skipNames = new Set([
      'bin', 'Descriptor', 'Resources', 'WebContent', 'XppMetadata',
      'Reports', '.pkgrefgen', 'Content',
    ]);

    let packageEntries: string[];
    try {
      // Use readdirSync-via-fs.readdir; check each entry with statSync so that
      // NTFS junction points (e.g. ApplicationSuite, ApplicationPlatform) are
      // followed correctly — entry.isDirectory() returns false for junctions (RC2 fix).
      const dirents = await fs.readdir(parentDir, { withFileTypes: true });
      packageEntries = dirents
        .filter(e => !e.name.startsWith('.'))
        .map(e => e.name);
    } catch (error) {
      console.error(`⚠️ Could not read metadata root: ${(error as Error).message}`);
      return;
    }

    for (const pkgName of packageEntries) {
      const pkgPath = join(parentDir, pkgName);

      // Use statSync (not dirent) so junction points are treated as directories
      let pkgIsDir = false;
      try { pkgIsDir = (await fs.stat(pkgPath)).isDirectory(); } catch { continue; }
      if (!pkgIsDir) continue;

      // Each package may contain one or more model subdirectories.
      // Scan all subdirs of the package for Ax* folders (RC2 fix: multi-model packages).
      let pkgSubdirs: string[];
      try {
        pkgSubdirs = (await fs.readdir(pkgPath)).filter(
          n => !n.startsWith('.') && !skipNames.has(n) && !n.endsWith('.xml') && !n.endsWith('.json')
        );
      } catch { continue; }

      for (const candidate of pkgSubdirs) {
        const candidatePath = join(pkgPath, candidate);

        let isDir = false;
        try { isDir = (await fs.stat(candidatePath)).isDirectory(); } catch { continue; }
        if (!isDir) continue;

        // A D365 model folder contains Ax* subfolders
        let innerEntries: string[];
        try { innerEntries = await fs.readdir(candidatePath); } catch { continue; }
        const hasAxFolders = innerEntries.some(n => n.startsWith('Ax'));
        if (!hasAxFolders) continue;

        // Use the candidate (inner) name as the model name
        const modelName = candidate;
        if (alreadyIndexed.has(modelName.toLowerCase())) {
          continue; // already in index, skip silently
        }

        const objects = await this.extractObjectsFromModelFolder(modelName, candidatePath);
        if (objects.length > 0) {
          console.error(`   📦 ${pkgName}/${modelName}: ${objects.length} objects found on filesystem`);
          customObjects.push(...objects);
          // Mark as indexed to avoid duplicates if same model appears in multiple packages
          alreadyIndexed.add(modelName.toLowerCase());
        }
      }
    }

    if (customObjects.length > 0) {
      console.error(`🚀 Adding ${customObjects.length} filesystem-discovered objects to index...`);
      this.sqliteIndex!.insertObjectsBulk(customObjects);
      console.error(`✅ Filesystem supplement complete`);
    } else {
      console.error(`ℹ️  No new models discovered on filesystem in ${parentDir}`);
    }
  }

  static async buildFullIndex(forceRebuild: boolean = false, xppMetadataFolder?: string): Promise<void> {
    try {
      this.initializeSQLiteIndex();
    } catch (error) {
      console.warn('⚠️ SQLite initialization failed, proceeding with rebuild:', (error as Error).message);
      // If SQLite fails to initialize, we should rebuild to fix it
      forceRebuild = true;
    }
    
    if (forceRebuild) {
      // Force rebuild - always clear database and rebuild
      console.error('🗑️ Force rebuild requested - clearing SQLite cache');
      if (this.sqliteIndex) {
        this.sqliteIndex.clearDatabase();
        console.error('✅ SQLite cache cleared successfully');
      }
    } else {
      // Normal mode - skip DLL rebuild if objects exist, but still run filesystem supplement below
      const totalCount = SQLiteObjectLookup.safeGetTotalCount();
      if (totalCount > 0) {
        console.error(`📊 SQLite index already has ${totalCount} objects, skipping DLL rebuild`);
        // Fall through to filesystem supplement (RC3 fix)
        if (xppMetadataFolder) {
          try {
            await this.buildIndexFromCustomModelPaths(xppMetadataFolder);
          } catch (error) {
            console.warn(`⚠️  Filesystem supplement failed: ${(error as Error).message}`);
          }
        }
        return;
      }
    }

    // Try DLL-based indexing via VS2022 service with parallel processing
    try {
      console.error('🚀 Attempting DLL-based indexing via VS2022 service with parallel processing...');
      
      console.error('🔌 Connecting to VS2022 C# service for model discovery...');
      const client = new D365ServiceClient();
      await client.connect();
      
      try {
        // Get target models dynamically from the service
        const TARGET_MODELS = await this.getAvailableModelsFromService(client);
        
        if (TARGET_MODELS.length === 0) {
          throw new Error('No models discovered from C# service');
        }

        console.error(`📊 Processing ${TARGET_MODELS.length} models via parallel workers...`);
        
        // Process models in parallel using worker threads
        // Process 20 models each time

        const results = [];
        
        const chunkSize = 20;
        for (let i = 0; i < TARGET_MODELS.length; i += chunkSize) {
          const chunk = TARGET_MODELS.slice(i, i + chunkSize);
          const chunkResults = await this.processModelsInParallel(chunk);
          results.push(...chunkResults);
        }

        //const results = await this.processModelsInParallel(modelChunks);


        // Aggregate results and bulk insert all objects
        let totalObjects = 0;
        const allObjects: ObjectLocation[] = [];
        
        for (const result of results) {
          if (result.success) {
            totalObjects += result.objectCount;
            allObjects.push(...result.objects);
            console.error(`   ✅ ${result.modelName}: ${result.objectCount} objects (${result.processingTime}ms)`);
          } else {
            console.error(`   ❌ ${result.modelName}: ${result.error}`);
          }
        }
        
        // Bulk insert all objects from all models in one operation
        if (allObjects.length > 0) {
          console.error(`🚀 Bulk inserting ${allObjects.length} objects from all models...`);
          const insertStartTime = Date.now();
          this.sqliteIndex!.insertObjectsBulk(allObjects);
          const insertTime = Date.now() - insertStartTime;
          console.error(`✅ Bulk insert completed in ${insertTime}ms`);
        }

        console.error(`🎉 DLL-based indexing complete: ${totalObjects} objects indexed via service enumeration!`);
        console.error('✅ Full index build completed successfully!');
        
      } finally {
        await client.disconnect();
        console.error('📡 Disconnected from VS2022 service');
      }
      
    } catch (error) {
      console.warn(`⚠️  DLL-based indexing failed, falling back to file-based: ${(error as Error).message}`);
      // Could add file-based fallback here if needed
    }

    // Supplement the index with objects from custom model paths on disk.
    // This handles models that the VS2022 service does not enumerate
    // (e.g. HSO, Dometic, DYSAdministrativeTools stored under xppMetadataFolder).
    if (xppMetadataFolder) {
      try {
        await this.buildIndexFromCustomModelPaths(xppMetadataFolder);
      } catch (error) {
        console.warn(`⚠️  Filesystem supplement for custom models failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Get available models dynamically from VS2022 C# service
   */
  private static async getAvailableModelsFromService(client: D365ServiceClient): Promise<string[]> {
    try {
      const result = await client.sendRequest('models', undefined, {});
      
      if (result.Success && result.Data?.models) {
        // Accept all models the DLL's ModelManifest returns regardless of ObjectCount.
        // ObjectCount is based on Tables only, so models with only Classes/Forms/Enums
        // would otherwise be incorrectly excluded (RC1 fix).
        const allModels = result.Data.models
          .map((model: any) => model.Name)
          .filter((name: string) => !!name);

        console.error(`📋 Discovered ${allModels.length} D365 models via DLL enumeration`);
        return allModels;
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
   * Process multiple models in parallel using worker threads
   * Each model is processed independently for maximum performance
   */
  private static async processModelsInParallel(modelNames: string[]): Promise<Array<{
    modelName: string;
    success: boolean;
    objects: ObjectLocation[];
    objectCount: number;
    processingTime: number;
    error?: string;
  }>> {
    const { createModelWorker } = await import('./model-worker.js');
    
    // Create worker tasks for each model
    const workerPromises = modelNames.map(modelName => 
      createModelWorker({
        modelName,
        requestId: `model-${modelName}-${Date.now()}`
      })
    );

    // Wait for all workers to complete
    console.error(`🧵 Starting ${workerPromises.length} worker threads...`);
    const results = await Promise.allSettled(workerPromises);
    
    // Process results
    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          modelName: modelNames[index],
          success: false,
          objects: [],
          objectCount: 0,
          processingTime: 0,
          error: result.reason?.message || 'Worker failed'
        };
      }
    });

    const successCount = processedResults.filter(r => r.success).length;
    const failedCount = processedResults.length - successCount;
    
    console.error(`🎯 Parallel processing complete: ${successCount} successful, ${failedCount} failed`);
    
    return processedResults;
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
      try {
        this.sqliteIndex.initialize();
      } catch (error) {
        console.error('❌ Failed to initialize SQLite lookup:', (error as Error).message);
        this.sqliteIndex = null; // Reset to null so we know it failed
        throw error; // Re-throw so caller can handle
      }
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
   * Cache object types from VS2022 service in SQLite for fast retrieval
   * This integrates with the existing build index process
   */
  static async cacheObjectTypes(objectTypes: string[]): Promise<void> {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for caching object types');
    }

    try {
      // Store object types in a special table/format in SQLite
      // The actual caching implementation will log success message
      await this.sqliteIndex.cacheObjectTypes(objectTypes);
    } catch (error) {
      console.error('❌ Error caching object types:', error);
      throw error;
    }
  }

  /**
   * Get cached object types from SQLite
   * Returns empty array if not cached or error occurs
   */
  static async getCachedObjectTypes(): Promise<string[]> {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      console.warn('⚠️  SQLite index not available for retrieving cached object types');
      return [];
    }

    try {
      const cachedTypes = await this.sqliteIndex.getCachedObjectTypes();
      return cachedTypes || [];
    } catch (error) {
      console.error('❌ Error retrieving cached object types:', error);
      return [];
    }
  }

  /**
   * Add a single object to the search index immediately
   * Perfect for adding newly created objects to make them immediately searchable
   */
  static async addObjectToIndex(objectName: string, objectType: string, model: string, filePath: string): Promise<boolean> {
    this.initializeSQLiteIndex();
    
    if (!this.sqliteIndex) {
      console.warn('⚠️  SQLite index not available for adding object');
      return false;
    }

    try {
      const objectLocation: ObjectLocation = {
        name: objectName,
        path: filePath,
        model: model,
        type: objectType,
        lastModified: new Date().toISOString(),
        hasCode: true,
        isValid: true
      };

      const success = this.sqliteIndex.insertObject(objectLocation);
      if (success) {
        console.error(`✅ Added ${objectType} '${objectName}' to search index (model: ${model})`);
      } else {
        console.warn(`⚠️  Failed to add ${objectType} '${objectName}' to search index`);
      }
      
      return success;
    } catch (error) {
      console.error(`❌ Error adding object to index: ${error}`);
      return false;
    }
  }
}
