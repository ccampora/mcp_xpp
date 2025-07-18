import { promises as fs } from "fs";
import { join, relative, basename, extname } from "path";
import { ObjectIndex } from "./types.js";
import { AOTStructureManager } from "./aot-structure.js";
import { isXppRelatedFile, getPackagePriority } from "./utils.js";
import { MAX_FILE_SIZE } from "./config.js";

// AOT folder cache for fast lookups
const aotFoldersCache = new Map<string, string[]>();

/**
 * Object Index Manager for fast lookups with AOT-optimized indexing
 */
export class ObjectIndexManager {
  private static index: Map<string, ObjectIndex> = new Map();
  private static indexPath: string = "";

  static setIndexPath(basePath: string): void {
    this.indexPath = join(basePath, '.mcp-index.json');
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
    
    // Get folder patterns from AOT structure
    let targetPatterns: string[] = [];
    await AOTStructureManager.loadStructure();
    const structure = AOTStructureManager.getStructure();
    
    if (objectType && structure) {
      // Find patterns for specific object type
      for (const [categoryName, categoryData] of Object.entries(structure.aotStructure)) {
        if (categoryData.objectType === objectType) {
          targetPatterns.push(...(categoryData.folderPatterns || []));
        }
        if (categoryData.children) {
          for (const [childName, childData] of Object.entries(categoryData.children)) {
            if (childData.objectType === objectType) {
              targetPatterns.push(...(childData.folderPatterns || []));
            }
          }
        }
      }
    } else if (structure) {
      // Get all folder patterns from AOT structure
      for (const [categoryName, categoryData] of Object.entries(structure.aotStructure)) {
        if (categoryData.folderPatterns) {
          targetPatterns.push(...categoryData.folderPatterns);
        }
        if (categoryData.children) {
          for (const [childName, childData] of Object.entries(categoryData.children)) {
            if (childData.folderPatterns) {
              targetPatterns.push(...childData.folderPatterns);
            }
          }
        }
      }
    }

    console.log(`Scanning for ${objectType || 'ALL'} AOT folders with patterns: ${targetPatterns.join(', ')}`);
    
    // Use optimized scanning that leverages D365 F&O package structure
    await this.scanForAOTFoldersOptimized(basePath, basePath, aotFolders, targetPatterns);
    
    // Cache the discovered folders
    aotFoldersCache.set(cacheKey, Array.from(aotFolders.keys()));
    
    return aotFolders;
  }

  /**
   * Optimized AOT folder discovery leveraging D365 F&O package structure
   * PackageName/PackageName/AxClass, AxTable, etc.
   */
  private static async scanForAOTFoldersOptimized(
    dirPath: string, 
    basePath: string, 
    aotFolders: Map<string, string[]>,
    targetPatterns: string[]
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // First pass: Look for potential package folders
      const packageCandidates: string[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory() && 
            !entry.name.startsWith('.') && 
            !entry.name.startsWith('Ax') &&
            !['node_modules', 'bin', 'obj', 'temp', '.git'].includes(entry.name.toLowerCase())) {
          packageCandidates.push(entry.name);
        }
      }

      // Second pass: For each package candidate, check for double-nested structure
      for (const packageName of packageCandidates) {
        const packagePath = join(dirPath, packageName);
        const innerPackagePath = join(packagePath, packageName);
        
        try {
          const innerStats = await fs.stat(innerPackagePath);
          if (innerStats.isDirectory()) {
            // Found double-nested structure! Scan inner package for AOT folders
            console.log(`📦 Found D365 package: ${packageName}/${packageName}`);
            await this.scanDirectlyForAOTFolders(innerPackagePath, basePath, aotFolders, targetPatterns, packageName);
          } else {
            // Single-level package, scan normally but with less depth
            await this.scanDirectlyForAOTFolders(packagePath, basePath, aotFolders, targetPatterns, packageName);
          }
        } catch (error) {
          // Inner package doesn't exist, treat as single-level
          await this.scanDirectlyForAOTFolders(packagePath, basePath, aotFolders, targetPatterns, packageName);
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
   */
  private static async scanDirectlyForAOTFolders(
    packagePath: string,
    basePath: string,
    aotFolders: Map<string, string[]>,
    targetPatterns: string[],
    packageName: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(packagePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('Ax')) {
          // Check if this AOT folder matches our target patterns
          if (targetPatterns.some(pattern => 
            entry.name === pattern || entry.name.startsWith(pattern)
          )) {
            const fullPath = join(packagePath, entry.name);
            const relativePath = relative(basePath, fullPath);
            aotFolders.set(fullPath, []);
            console.log(`🎯 Found AOT folder: ${packageName} -> ${entry.name}`);
          }
        }
      }
    } catch (error) {
      // Skip packages we can't access
      console.log(`⚠️ Could not access package: ${packageName}`);
    }
  }

  static async loadIndex(): Promise<void> {
    try {
      if (await this.fileExists(this.indexPath)) {
        const indexData = await fs.readFile(this.indexPath, 'utf-8');
        const parsedIndex = JSON.parse(indexData);
        this.index = new Map(Object.entries(parsedIndex.objects || {}));
      }
    } catch (error) {
      console.error("Error loading index:", error);
      this.index.clear();
    }
  }

  static async saveIndex(): Promise<void> {
    try {
      const indexData = {
        lastUpdated: Date.now(),
        version: "1.0",
        objects: Object.fromEntries(this.index)
      };
      await fs.writeFile(this.indexPath, JSON.stringify(indexData, null, 2));
    } catch (error) {
      console.error("Error saving index:", error);
    }
  }

  static async buildFullIndex(basePath: string, forceRebuild: boolean = false): Promise<void> {
    if (!forceRebuild && this.index.size > 0) return;

    console.log('🚀 Starting optimized full index build...');
    this.index.clear();

    // Phase 1: Discover all AOT folders (much faster than full directory walk)
    console.log('📁 Phase 1: Discovering all AOT folders...');
    const aotFolders = await this.discoverAOTFolders(basePath);
    console.log(`   Found ${aotFolders.size} AOT folders across all packages`);

    // Phase 2: Index only AOT folders (targeted approach)
    console.log('📦 Phase 2: Indexing objects in discovered AOT folders...');
    const results = { indexedCount: 0, skippedCount: 0 };
    
    for (const aotFolderPath of aotFolders.keys()) {
      const relativePath = relative(basePath, aotFolderPath);
      console.log(`   📂 Processing: ${relativePath}`);
      
      // Determine object type from AOT folder name
      const folderName = basename(aotFolderPath);
      const objectType = this.getObjectTypeFromAOTFolder(folderName);
      
      if (objectType !== 'UNKNOWN') {
        await this.indexAOTFolder(aotFolderPath, basePath, objectType, results);
      }
    }

    await this.saveIndex();
    console.log(`[AVAILABLE] Optimized full index complete: ${results.indexedCount} objects indexed!`);
  }

  /**
   * Determine object type from AOT folder name using dynamic structure
   */
  private static getObjectTypeFromAOTFolder(folderName: string): string {
    const allTypes = AOTStructureManager.getAllDiscoveredTypes();
    
    for (const [objectType, typeInfo] of allTypes.entries()) {
      if (typeInfo.folderPatterns.some((pattern: string) => folderName.startsWith(pattern))) {
        return objectType;
      }
    }
    
    return 'UNKNOWN';
  }

  static async buildIndexByType(basePath: string, objectType: string, forceRebuild: boolean = false): Promise<{ indexedCount: number, skippedCount: number }> {
    // Validate object type against AOT structure
    await AOTStructureManager.loadStructure();
    const availableTypes = AOTStructureManager.getAllObjectTypes();
    if (!availableTypes.includes(objectType.toUpperCase())) {
      throw new Error(`Invalid object type: ${objectType}. Available types are: ${availableTypes.join(', ')}. Use discover_object_types to see all available types.`);
    }

    const normalizedType = objectType.toUpperCase();
    const results = { indexedCount: 0, skippedCount: 0 };

    console.log(`Starting AOT structure-based indexing for ${normalizedType}...`);

    // Phase 1: Discover AOT folders for this specific type using AOT structure
    console.log(`Phase 1: Discovering AOT folders for ${normalizedType}...`);
    const aotFolders = await this.discoverAOTFolders(basePath, normalizedType);
    console.log(`   Found ${aotFolders.size} relevant AOT folders`);

    if (aotFolders.size === 0) {
      console.log(`   No AOT folders found for ${normalizedType}`);
      return results;
    }

    // If not force rebuild, only remove objects of this specific type
    if (!forceRebuild) {
      // Remove existing objects of this type from index
      const keysToRemove: string[] = [];
      for (const [key, obj] of this.index) {
        if (obj.type === normalizedType) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => this.index.delete(key));
      console.log(`   Removed ${keysToRemove.length} existing ${normalizedType} objects from index`);
    } else {
      // For force rebuild, clear entire index
      this.index.clear();
      console.log(`   Cleared entire index for force rebuild`);
    }

    // Phase 2: Index only within discovered AOT folders (targeted approach!)
    console.log(`Phase 2: Indexing objects in ${aotFolders.size} AOT folders...`);
    for (const aotFolderPath of aotFolders.keys()) {
      console.log(`   Processing: ${relative(basePath, aotFolderPath)}`);
      await this.indexAOTFolder(aotFolderPath, basePath, normalizedType, results);
    }

    await this.saveIndex();
    
    console.log(`AOT structure-based indexing complete: ${results.indexedCount} indexed, ${results.skippedCount} skipped`);
    return results;
  }

  /**
   * Index objects within a specific AOT folder (much more targeted than full directory scan)
   */
  private static async indexAOTFolder(
    aotFolderPath: string, 
    basePath: string, 
    targetType: string, 
    results: { indexedCount: number, skippedCount: number }
  ): Promise<void> {
    try {
      const entries = await fs.readdir(aotFolderPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && isXppRelatedFile(entry.name)) {
          const fullPath = join(aotFolderPath, entry.name);
          await this.indexFileIfType(fullPath, basePath, targetType, results);
        } else if (entry.isDirectory()) {
          // Some AOT objects might be in subdirectories
          const subFolderPath = join(aotFolderPath, entry.name);
          await this.indexAOTFolder(subFolderPath, basePath, targetType, results);
        }
      }
    } catch (error) {
      // Skip folders we can't access
      console.log(`   ⚠️ Could not access folder: ${relative(basePath, aotFolderPath)}`);
    }
  }

  private static async indexFileIfType(filePath: string, basePath: string, targetType: string, results: { indexedCount: number, skippedCount: number }): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > MAX_FILE_SIZE) {
        results.skippedCount++;
        return;
      }

      const relativePath = relative(basePath, filePath);
      const objectInfo = this.extractObjectInfo(filePath, relativePath, stats.mtime.getTime(), stats.size);
      
      if (objectInfo && objectInfo.type === targetType) {
        const key = `${objectInfo.package}::${objectInfo.name}::${objectInfo.type}`;
        this.index.set(key, objectInfo);
        results.indexedCount++;
      } else {
        results.skippedCount++;
      }
    } catch (error) {
      results.skippedCount++;
    }
  }

  private static extractObjectInfo(filePath: string, relativePath: string, lastModified: number, size: number): ObjectIndex | null {
    const fileName = basename(filePath, extname(filePath));
    const pathParts = relativePath.split(/[/\\]/);
    
    let packageName = pathParts[0] || "Unknown";
    
    // Use AOT structure to determine object type
    const objectType = AOTStructureManager.getObjectTypeFromPath(filePath);
    
    if (objectType === "UNKNOWN") {
      // Skip files that don't match any AOT pattern
      return null;
    }

    return {
      name: fileName,
      type: objectType,
      path: relativePath,
      package: packageName,
      lastModified,
      size,
      methods: [], // Will be populated when file is actually parsed
      fields: [],
      dependencies: []
    };
  }

  static findObjects(name: string, type?: string): ObjectIndex[] {
    const results: ObjectIndex[] = [];
    const lowerName = name.toLowerCase();

    for (const [key, obj] of this.index) {
      // Handle both key formats: simple name and compound format (package::name::type)
      const keyMatches = key.toLowerCase().includes(lowerName) || 
                        obj.name.toLowerCase().includes(lowerName);
      
      if (keyMatches && (!type || obj.type === type)) {
        results.push(obj);
      }
    }

    // Sort by priority: exact match, package priority, then size
    return results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === lowerName ? 1 : 0;
      const bExact = b.name.toLowerCase() === lowerName ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aPriority = getPackagePriority(a.package);
      const bPriority = getPackagePriority(b.package);
      if (aPriority !== bPriority) return bPriority - aPriority;

      return a.size - b.size; // Prefer smaller files (likely more focused)
    });
  }

  static getStats(): { totalObjects: number; byType: Record<string, number>; byPackage: Record<string, number> } {
    const byType: Record<string, number> = {};
    const byPackage: Record<string, number> = {};

    for (const obj of this.index.values()) {
      byType[obj.type] = (byType[obj.type] || 0) + 1;
      byPackage[obj.package] = (byPackage[obj.package] || 0) + 1;
    }

    return {
      totalObjects: this.index.size,
      byType,
      byPackage
    };
  }

  static listObjectsByType(objectType: string, sortBy: 'name' | 'package' | 'size' = 'name', limit?: number): ObjectIndex[] {
    const normalizedType = objectType.toUpperCase();
    const results: ObjectIndex[] = [];

    for (const obj of this.index.values()) {
      if (obj.type === normalizedType) {
        results.push(obj);
      }
    }

    // Sort results based on specified criteria
    results.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'package':
          const packageCompare = a.package.localeCompare(b.package);
          return packageCompare !== 0 ? packageCompare : a.name.localeCompare(b.name);
        case 'size':
          return a.size - b.size;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    // Apply limit if specified
    return limit ? results.slice(0, limit) : results;
  }

  private static async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
