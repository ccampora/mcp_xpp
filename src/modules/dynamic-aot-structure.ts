import { AOTStructureCacheManager } from "./aot-structure-cache.js";
import { AOTStructure, DiscoveredTypeInfo } from "./types.js";

/**
 * Dynamic AOT Structure Manager - Replaces static aot-structure.json config
 * Uses pure reflection data from VS2022 service + pattern-based categorization
 */
export class DynamicAOTStructureManager {
  private static cachedStructure: AOTStructure | null = null;
  private static discoveredObjectTypes: Map<string, DiscoveredTypeInfo> = new Map();

  /**
   * Load AOT structure dynamically from reflection cache instead of static config
   */
  static async loadStructure(): Promise<void> {
    try {
      const cacheManager = AOTStructureCacheManager.getInstance();
      const reflectionCache = await cacheManager.getCachedStructure();
      
      // Transform reflection cache to AOTStructure format
      this.cachedStructure = this.transformCacheToAOTStructure(reflectionCache);
      
      // Build discovered types map
      this.discoveredObjectTypes.clear();
      Object.entries(reflectionCache.categories).forEach(([categoryName, categoryData]: [string, any]) => {
        categoryData.types.forEach((type: any) => {
          this.discoveredObjectTypes.set(type.Name.toUpperCase(), {
            displayName: type.Name,
            typeName: type.Name,
            category: categoryName,
            description: type.Description || `${categoryName} object`,
            folderPatterns: [type.Name],
            fileExtensions: ['.xml'],
            namespace: type.Namespace,
            apiSupported: true,
            apiClass: type.FullName
          });
        });
      });

      console.log(`Dynamic AOT structure loaded: ${this.discoveredObjectTypes.size} types from ${Object.keys(reflectionCache.categories).length} categories`);
      
    } catch (error) {
      console.error('ERROR: Failed to load dynamic AOT structure:', error);
      throw new Error(`Dynamic AOT structure loading failed: ${error}`);
    }
  }

  /**
   * Transform reflection cache format to legacy AOTStructure format for compatibility
   */
  private static transformCacheToAOTStructure(reflectionCache: any): AOTStructure {
    const aotStructure: AOTStructure = {
      aotStructure: {}
    };

    Object.entries(reflectionCache.categories).forEach(([categoryName, categoryData]: [string, any]) => {
      const category = categoryData as any;
      
      aotStructure.aotStructure[categoryName] = {
        folderPatterns: [category.folderPattern || categoryName.replace(/\s+/g, '')],
        icon: category.icon || 'default.ico',
        description: category.description || `${categoryName} objects`,
        children: {}
      };

      // Group types by their base pattern for children structure
      const typeGroups: Record<string, any[]> = {};
      category.types.forEach((type: any) => {
        const groupKey = this.determineTypeGroup(type.Name);
        if (!typeGroups[groupKey]) {
          typeGroups[groupKey] = [];
        }
        typeGroups[groupKey].push(type);
      });

      // Create children structure
      Object.entries(typeGroups).forEach(([groupName, types]) => {
        if (types.length > 0) {
          const sampleType = types[0];
          if (aotStructure.aotStructure[categoryName].children) {
            aotStructure.aotStructure[categoryName].children[groupName] = {
              folderPatterns: [sampleType.Name.replace(/^Ax/, '')],
              fileExtensions: ['.xml'],
              objectType: sampleType.Name.toLowerCase().replace(/^ax/, ''),
              creatable: true,
              icon: this.getIconForType(sampleType.Name),
              description: sampleType.Description || `${groupName} objects`,
              apiSupported: true,
              apiClass: sampleType.FullName
            };
          }
        }
      });
    });

    return aotStructure;
  }

  /**
   * Determine type group for organizing similar types
   */
  private static determineTypeGroup(typeName: string): string {
    // Remove Ax prefix for grouping
    const baseName = typeName.replace(/^Ax/, '');
    
    // Handle special cases
    if (baseName.includes('Extension')) {
      return `${baseName.replace('Extension', '')} Extensions`;
    }
    
    if (baseName.includes('Template')) {
      return `${baseName.replace('Template', '')} Templates`;
    }
    
    return baseName.endsWith('s') ? baseName : `${baseName}s`;
  }

  /**
   * Get appropriate icon for type
   */
  private static getIconForType(typeName: string): string {
    const iconMap: Record<string, string> = {
      'AxClass': 'Class.ico',
      'AxEnum': 'BaseEnum.ico',
      'AxTable': 'Table.ico',
      'AxForm': 'Form.ico',
      'AxReport': 'Report.ico',
      'AxQuery': 'Query.ico',
      'AxView': 'View.ico',
      'AxEdt': 'EDTString.ico'
    };

    // Try exact match first
    if (iconMap[typeName]) {
      return iconMap[typeName];
    }

    // Try pattern matching
    for (const [pattern, icon] of Object.entries(iconMap)) {
      if (typeName.startsWith(pattern)) {
        return icon;
      }
    }

    return 'default.ico';
  }

  /**
   * Get the structure (compatibility method)
   */
  static getStructure(): AOTStructure | null {
    return this.cachedStructure;
  }

  /**
   * Get all discovered object types
   */
  static getAllDiscoveredTypes(): Map<string, DiscoveredTypeInfo> {
    return this.discoveredObjectTypes;
  }

  /**
   * Get object types list
   */
  static getAllObjectTypes(): string[] {
    return Array.from(this.discoveredObjectTypes.keys());
  }

  /**
   * Get object type from file path
   */
  static getObjectTypeFromPath(filePath: string): string {
    // Extract folder name that should match an object type
    const pathParts = filePath.split(/[/\\]/);
    
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const part = pathParts[i];
      const axType = `AX${part.toUpperCase()}`;
      
      if (this.discoveredObjectTypes.has(axType)) {
        return axType;
      }
    }
    
    return "UNKNOWN";
  }

  /**
   * Discover available object types from filesystem (compatibility method)
   */
  static async discoverAvailableObjectTypes(basePath: string): Promise<void> {
    // For dynamic structure, we already have this from reflection
    // This method is kept for compatibility with existing code
    console.log(`📍 Using dynamic reflection data instead of filesystem discovery`);
  }

  /**
   * Get structured tree representation
   */
  static getStructuredTree(availableTypes: string[]): string {
    const structure = this.getStructure();
    if (!structure) {
      return "No AOT structure loaded";
    }

    let output = "D365 F&O AOT Structure (Dynamic from Reflection)\n";
    output += "=" .repeat(50) + "\n\n";

    Object.entries(structure.aotStructure).forEach(([categoryName, categoryConfig]) => {
      const categoryTypes = Array.from(this.discoveredObjectTypes.values())
        .filter(type => type.category === categoryName);
      
      output += `📂 ${categoryName} (${categoryTypes.length} types)\n`;
      output += `   ${categoryConfig.description || ''}\n`;
      
      if (categoryConfig.children && Object.keys(categoryConfig.children).length > 0) {
        Object.entries(categoryConfig.children).forEach(([childName, childConfig]) => {
          const childTypes = categoryTypes.filter(type => 
            type.typeName?.toLowerCase().includes(childName.toLowerCase().replace(/s$/, '')) || false
          );
          output += `   └── ${childName} (${childTypes.length})\n`;
        });
      }
      
      output += "\n";
    });

    return output;
  }

  /**
   * Generate compatibility config for tools still expecting the old format
   */
  static async generateCompatibilityConfig(): Promise<any> {
    const structure = this.getStructure();
    if (!structure) {
      throw new Error("No dynamic structure loaded");
    }

    return {
      generatedAt: new Date().toISOString(),
      source: "Dynamic reflection from VS2022 service",
      note: "This config is generated dynamically - no longer uses aot-structure.json",
      ...structure
    };
  }

  /**
   * Check if cache needs refresh and regenerate if needed
   */
  static async ensureFreshCache(): Promise<void> {
    const cacheManager = AOTStructureCacheManager.getInstance();
    const isStale = await cacheManager.isCacheStale();
    
    if (isStale) {
      console.log('🔄 AOT structure cache is stale, regenerating...');
      await cacheManager.generateAOTStructureCache();
    }
  }

  /**
   * Get statistics about the dynamic structure
   */
  static getStats(): any {
    return {
      totalTypes: this.discoveredObjectTypes.size,
      categories: this.cachedStructure ? Object.keys(this.cachedStructure.aotStructure).length : 0,
      source: "Dynamic reflection from VS2022 service",
      configFile: "ELIMINATED - Using pure reflection data"
    };
  }
}
