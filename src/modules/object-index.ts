import { promises as fs } from "fs";
import { join, relative, basename, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { D365ServiceClient } from "./d365-service-client.js";
import { SQLiteObjectLookup, ObjectLocation, CodeAnalysisStats } from "./sqlite-lookup.js";
import { CodeAnalysisService, CodeAnalysisResult } from "./code-analysis-service.js";

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
    try {
      this.initializeSQLiteIndex();
    } catch (error) {
      console.warn('⚠️ SQLite initialization failed, proceeding with rebuild:', (error as Error).message);
      // If SQLite fails to initialize, we should rebuild to fix it
      forceRebuild = true;
    }
    
    if (forceRebuild) {
      // Force rebuild - always clear database and rebuild
      console.log('🗑️ Force rebuild requested - clearing SQLite cache');
      if (this.sqliteIndex) {
        this.sqliteIndex.clearDatabase();
        console.log('✅ SQLite cache cleared successfully');
      }
    } else {
      // Normal mode - skip if objects exist (use safe method to avoid read-only issues)
      const totalCount = SQLiteObjectLookup.safeGetTotalCount();
      if (totalCount > 0) {
        console.log(`📊 SQLite index already has ${totalCount} objects, skipping rebuild`);
        return;
      }
    }

    // Try DLL-based indexing via VS2022 service with parallel processing
    try {
      console.log('🚀 Attempting DLL-based indexing via VS2022 service with parallel processing...');
      
      console.log('🔌 Connecting to VS2022 C# service for model discovery...');
      const client = new D365ServiceClient();
      await client.connect();
      
      try {
        // Get target models dynamically from the service
        const TARGET_MODELS = await this.getAvailableModelsFromService(client);
        
        if (TARGET_MODELS.length === 0) {
          throw new Error('No models discovered from C# service');
        }

        console.log(`📊 Processing ${TARGET_MODELS.length} models via parallel workers...`);
        
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
            console.log(`   ✅ ${result.modelName}: ${result.objectCount} objects (${result.processingTime}ms)`);
          } else {
            console.error(`   ❌ ${result.modelName}: ${result.error}`);
          }
        }
        
        // Bulk insert all objects from all models in one operation
        if (allObjects.length > 0) {
          console.log(`🚀 Bulk inserting ${allObjects.length} objects from all models...`);
          const insertStartTime = Date.now();
          this.sqliteIndex!.insertObjectsBulk(allObjects);
          const insertTime = Date.now() - insertStartTime;
          console.log(`✅ Bulk insert completed in ${insertTime}ms`);
        }

        console.log(`🎉 DLL-based indexing complete: ${totalObjects} objects indexed via service enumeration!`);
        console.log('✅ Full index build completed successfully!');
        
      } finally {
        await client.disconnect();
        console.log('📡 Disconnected from VS2022 service');
      }
      
    } catch (error) {
      console.warn(`⚠️  DLL-based indexing failed, falling back to file-based: ${(error as Error).message}`);
      // Could add file-based fallback here if needed
    }
  }

  /**
   * Get available models dynamically from VS2022 C# service
   */
  private static async getAvailableModelsFromService(client: D365ServiceClient): Promise<string[]> {
    try {
      const result = await client.sendRequest('models', undefined, {});
      
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
    console.log(`🧵 Starting ${workerPromises.length} worker threads...`);
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
    
    console.log(`🎯 Parallel processing complete: ${successCount} successful, ${failedCount} failed`);
    
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
        console.log(`✅ Added ${objectType} '${objectName}' to search index (model: ${model})`);
      } else {
        console.warn(`⚠️  Failed to add ${objectType} '${objectName}' to search index`);
      }
      
      return success;
    } catch (error) {
      console.error(`❌ Error adding object to index: ${error}`);
      return false;
    }
  }

  // ==================== CODE ANALYSIS FUNCTIONALITY ====================

  /**
   * Build enhanced index with code analysis
   */
  static async buildCodeAnalysisIndex(options: {
    includeCodeAnalysis?: boolean;
    batchSize?: number;
    maxConcurrentAnalysis?: number;
    analysisTimeoutMs?: number;
  } = {}): Promise<{
    totalObjects: number;
    analyzedObjects: number;
    newlyAnalyzed: number;
    skippedObjects: number;
    errorCount: number;
    analysisTimeMs: number;
    indexingTimeMs: number;
  }> {
    const defaultOptions = {
      includeCodeAnalysis: true,
      batchSize: 10,
      maxConcurrentAnalysis: 3,
      analysisTimeoutMs: 30000,
      ...options
    };

    const startTime = Date.now();
    
    console.log('🚀 Building code analysis index...');
    console.log(`📋 Options: Batch size: ${defaultOptions.batchSize}, Max concurrent: ${defaultOptions.maxConcurrentAnalysis}`);

    const stats = {
      totalObjects: 0,
      analyzedObjects: 0,
      newlyAnalyzed: 0,
      skippedObjects: 0,
      errorCount: 0,
      analysisTimeMs: 0,
      indexingTimeMs: 0
    };

    try {
      // First, ensure base index is built
      console.log('🔍 Building base object index...');
      const indexStart = Date.now();
      await this.buildFullIndex(false); // Don't force rebuild
      stats.indexingTimeMs = Date.now() - indexStart;
      
      if (defaultOptions.includeCodeAnalysis) {
        await this.performCodeAnalysis(defaultOptions, stats);
      }

      stats.analysisTimeMs = Date.now() - startTime;
      
      // Get final stats
      const finalStats = await this.getCodeAnalysisStats();
      stats.totalObjects = finalStats.totalObjects;
      stats.analyzedObjects = finalStats.analyzedObjects;

      console.log('✅ Code analysis index build complete!');
      console.log(`📊 Results: ${stats.analyzedObjects}/${stats.totalObjects} objects analyzed`);
      console.log(`⏱️ Total time: ${stats.analysisTimeMs}ms`);

      return stats;

    } catch (error) {
      console.error('❌ Code analysis index build failed:', error);
      throw error;
    }
  }

  /**
   * Perform code analysis on objects that need it
   */
  private static async performCodeAnalysis(
    options: { batchSize: number; maxConcurrentAnalysis: number }, 
    stats: { newlyAnalyzed: number; errorCount: number; skippedObjects: number }
  ): Promise<void> {
    console.log('🔬 Starting code analysis phase...');
    
    const analysisService = new CodeAnalysisService();
    const analysisVersion = '1.0.0';

    // Get objects that need analysis
    this.initializeSQLiteIndex();
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for code analysis');
    }
    const objectsToAnalyze = await this.sqliteIndex.getObjectsNeedingAnalysis(analysisVersion, 1000);
    
    if (objectsToAnalyze.length === 0) {
      console.log('✅ All objects are up to date, no analysis needed');
      return;
    }

    console.log(`📋 Found ${objectsToAnalyze.length} objects requiring analysis`);

    // Process in batches
    for (let i = 0; i < objectsToAnalyze.length; i += options.batchSize) {
      const batch = objectsToAnalyze.slice(i, i + options.batchSize);
      
      console.log(`🔄 Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(objectsToAnalyze.length / options.batchSize)} (${batch.length} objects)`);
      
      // Process batch with limited concurrency
      const batchPromises = batch.map(obj => this.analyzeAndIndexObject(this.sqliteIndex!, analysisService, obj, stats));
      
      // Wait for batch completion with concurrency limit
      const semaphore = new Array(options.maxConcurrentAnalysis).fill(null);
      const results = [];
      
      for (let j = 0; j < batchPromises.length; j += options.maxConcurrentAnalysis) {
        const chunk = batchPromises.slice(j, j + options.maxConcurrentAnalysis);
        const chunkResults = await Promise.allSettled(chunk);
        results.push(...chunkResults);
      }

      // Update stats from batch results
      results.forEach(result => {
        if (result.status === 'rejected') {
          stats.errorCount++;
          console.error('❌ Batch analysis error:', result.reason);
        }
      });

      // Progress update
      const progress = Math.round(((i + batch.length) / objectsToAnalyze.length) * 100);
      console.log(`📈 Progress: ${progress}% (${i + batch.length}/${objectsToAnalyze.length})`);
    }
  }

  /**
   * Analyze and index a single object
   */
  private static async analyzeAndIndexObject(
    lookup: SQLiteObjectLookup,
    analysisService: CodeAnalysisService,
    obj: ObjectLocation,
    stats: { newlyAnalyzed: number; errorCount: number }
  ): Promise<void> {
    try {
      // Clean up existing analysis data
      await lookup.cleanupObjectAnalysis(obj.name, obj.type, obj.model);

      // Perform code analysis
      const analysisResult = await analysisService.analyzeObject(obj.name, obj.type, obj.model);

      // Store analysis results
      await this.storeAnalysisResult(this.sqliteIndex!, analysisResult);
      
      stats.newlyAnalyzed++;

    } catch (error) {
      console.error(`❌ Failed to analyze ${obj.type}:${obj.name}:`, error);
      stats.errorCount++;
      
      // Store error metadata
      await lookup.updateIndexingMetadata({
        objectName: obj.name,
        objectType: obj.type,
        objectModel: obj.model,
        lastAnalyzed: Date.now(),
        methodCount: 0,
        referenceCount: 0,

        analysisVersion: '1.0.0',
        analysisStatus: 'pending' as const,
        errorMessage: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  /**
   * Store analysis result in the database
   */
  private static async storeAnalysisResult(lookup: SQLiteObjectLookup, result: CodeAnalysisResult): Promise<void> {
    // Store method calls
    for (const methodCall of result.methodCalls) {
      await lookup.addMethodCall(methodCall);
    }

    // Store code references
    for (const codeRef of result.codeReferences) {
      await lookup.addCodeReference(codeRef);
    }

    // Store method code
    for (const objCode of result.objectCode) {
      await lookup.addMethodCode(objCode);
    }

    // Store metadata
    await lookup.updateIndexingMetadata(result.metadata);
  }

  // ==================== SEARCH METHODS ====================

  /**
   * Search for method calls (e.g., "xGlobal::runAsync")
   */
  static async searchMethodCalls(className: string, methodName: string): Promise<Array<{
    objectName: string;
    objectType: string;
    objectModel: string;
    sourceLocation: string;
    objectPath?: string;
    callContext?: string;
    lineNumber?: number;
  }>> {
    this.initializeSQLiteIndex();
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for method call search');
    }
    
    const results = await this.sqliteIndex.findMethodCalls(className, methodName);
    
    return results.map((result: any) => ({
      objectName: result.objectName,
      objectType: result.objectType,
      objectModel: result.objectModel,
      sourceLocation: result.sourceLocation,
      objectPath: result.objectPath,
      callContext: result.callContext,
      lineNumber: result.lineNumber
    }));
  }

  /**
   * Search method calls by pattern (supports wildcards)
   */
  static async searchMethodCallsByPattern(pattern: string): Promise<Array<{
    objectName: string;
    objectType: string;
    calledClass: string;
    calledMethod: string;
    sourceLocation: string;
    callType: string;
    objectPath?: string;
  }>> {
    this.initializeSQLiteIndex();
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for method call search');
    }
    
    const results = await this.sqliteIndex.searchMethodCalls(pattern);
    
    return results.map((result: any) => ({
      objectName: result.objectName,
      objectType: result.objectType,
      calledClass: result.calledClass,
      calledMethod: result.calledMethod,
      sourceLocation: result.sourceLocation,
      callType: result.callType,
      objectPath: result.objectPath
    }));
  }

  /**
   * Search for object references
   */
  static async searchObjectReferences(objectName: string): Promise<Array<{
    objectName: string;
    objectType: string;
    objectModel: string;
    referencedObject: string;
    referenceType: string;
    sourceLocation: string;
    objectPath?: string;
  }>> {
    this.initializeSQLiteIndex();
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for object reference search');
    }
    
    const results = await this.sqliteIndex.findObjectReferences(objectName);
    
    return results.map((result: any) => ({
      objectName: result.objectName,
      objectType: result.objectType,
      objectModel: result.objectModel,
      referencedObject: result.referencedObject,
      referenceType: result.referenceType,
      sourceLocation: result.sourceLocation,
      objectPath: result.objectPath
    }));
  }

  /**
   * Search in method source code
   */
  static async searchMethodCode(codePattern: string): Promise<Array<{
    objectName: string;
    objectType: string;
    objectModel: string;
    methodName: string;
    matchingCode: string;
    objectPath?: string;
  }>> {
    this.initializeSQLiteIndex();
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for method code search');
    }
    
    const results = await this.sqliteIndex.searchMethodCode(codePattern);
    
    return results.map((result: any) => ({
      objectName: result.objectName,
      objectType: result.objectType,
      objectModel: result.objectModel,
      methodName: result.methodName,
      matchingCode: result.sourceCode.substring(0, 200) + '...', // Truncate for display
      objectPath: result.objectPath
    }));
  }

  /**
   * Get code analysis statistics
   */
  static async getCodeAnalysisStats(): Promise<CodeAnalysisStats> {
    this.initializeSQLiteIndex();
    if (!this.sqliteIndex) {
      throw new Error('SQLite index not available for code analysis stats');
    }
    return await this.sqliteIndex.getCodeAnalysisStats();
  }
}
