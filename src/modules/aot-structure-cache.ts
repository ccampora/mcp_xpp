import { promises as fs } from "fs";
import { join, dirname } from "path";
import { D365ServiceClient } from "./d365-service-client.js";
import { AppConfig } from "./app-config.js";
import { fileURLToPath } from "url";

/**
 * D365 metadata fields from reflection investigation
 * These fields provide rich metadata about D365 objects
 */
const D365_METADATA_FIELDS = [
  // Primary classification fields
  'EntityCategory', 'EntityRelationshipType', 'MetaClassId',
  
  // Creatable-related fields  
  'IsReadOnly', 'Visibility', 'IsObsolete', 'IsPublic',
  
  // Additional metadata fields
  'AutoCreateDataverse', 'DataManagementEnabled', 'TableGroup', 
  'OperationalDomain', 'MessagingRole', 'AosAuthorization',
  
  // String metadata
  'PublicEntityName', 'PublicCollectionName', 'Label', 'SingularLabel',
  'ConfigurationKey', 'CountryRegionCodes', 'Tags',
  
  // Reference fields
  'FormRef', 'ListPageRef', 'ReportRef', 'PreviewPartRef', 
  'Query', 'PrimaryKey', 'TitleField1', 'TitleField2'
];

/**
 * AOT Structure Cache Manager - Integrates with existing index build process
 * Generates categorized AOT structure using pure reflection + pattern matching
 */
export class AOTStructureCacheManager {
  private static instance: AOTStructureCacheManager | null = null;
  private static cachedStructure: any = null;

  /**
   * Get singleton instance
   */
  static getInstance(): AOTStructureCacheManager {
    if (!this.instance) {
      this.instance = new AOTStructureCacheManager();
    }
    return this.instance;
  }

  /**
   * Get the AOT structure cache file path
   */
  private getCachePath(): string {
    const currentModulePath = fileURLToPath(import.meta.url);
    const mcpServerDir = join(dirname(currentModulePath), '..', '..');
    const cacheDir = join(mcpServerDir, 'cache');
    
    return join(cacheDir, 'aot-structure-cache.json');
  }

  /**
   * Extract D365 metadata properties from a type
   */
  private extractD365Metadata(type: any): Record<string, any> {
    const d365Props: Record<string, any> = {};
    
    if (!type.Properties || !Array.isArray(type.Properties)) {
      return d365Props;
    }
    
    type.Properties.forEach((prop: any) => {
      if (D365_METADATA_FIELDS.includes(prop.Name)) {
        d365Props[prop.Name] = {
          type: prop.Type,
          fullType: prop.FullType,
          canWrite: prop.CanWrite,
          isStatic: prop.IsStatic,
          isEnum: prop.IsEnum,
          enumValues: prop.EnumValues,
          value: prop.Value // For static constants
        };
      }
    });
    
    return d365Props;
  }

  /**
   * Pattern-based categorization rules derived from reflection analysis
   */
  private getCategoryPatterns() {
    return {
      "Data Types": {
        patterns: ["^AxEnum", "^AxEdt"],
        description: "Fundamental data type definitions",
        icon: "datatypes.ico"
      },
      "Data Model": {
        patterns: ["^AxTable", "^AxView", "^AxQuery", "^AxData", "^AxMap", "^AxComposite", "^AxAggregate.*Entity"],
        description: "Data storage and relationship definitions", 
        icon: "datamodel.ico"
      },
      "Code": {
        patterns: ["^AxClass", "^AxInterface", "^AxMacro"],
        description: "Business logic and computational components",
        icon: "code.ico"
      },
      "User Interface": {
        patterns: ["^AxForm", "^AxMenu", "^AxPage", "^AxTile"],
        description: "User interaction and presentation components",
        icon: "userinterface.ico"
      },
      "Analytics": {
        patterns: ["^AxReport", "^AxKpi", "^AxPerspective", "^AxAggregate(?!.*Entity)", "^AxMeasure", "^AxDimension"],
        description: "Business intelligence and reporting components",
        icon: "analytics.ico"
      },
      "Security": {
        patterns: ["^AxSecurity", "^AxSecu"],
        description: "Access control and security management", 
        icon: "security.ico"
      },
      "Business Process and Workflow": {
        patterns: ["^AxWorkflow", "^AxWork"],
        description: "Business process automation and workflow management",
        icon: "workflow.ico"
      },
      "Configuration": {
        patterns: ["^AxConfig", "^AxLicense"],
        description: "System configuration and licensing",
        icon: "configuration.ico"
      },
      "Services": {
        patterns: ["^AxService"],
        description: "Web services and integration endpoints",
        icon: "services.ico"
      },
      "Resources": {
        patterns: ["^AxResource", "^AxStyle", "^AxImage"],
        description: "Images, files, and multimedia content",
        icon: "resource.ico"
      },
      "Label Files": {
        patterns: ["^AxLabel", "^AxLabelFile"],
        description: "Localization and text resources",
        icon: "labelfile.ico"
      },
      "References": {
        patterns: ["^AxReference", "^AxDll"],
        description: "External references and assemblies",
        icon: "reference.ico"
      },
      "System Documentation": {
        patterns: ["^AxHelp", "^AxDoc", "^AxTutorial", "^AxGuide", "^AxInfo", "^AxDeprecatedHelp"],
        description: "Help files and system documentation",
        icon: "help.ico"
      }
    };
  }

  /**
   * Categorize a type based on pattern matching
   */
  private categorizeType(typeName: string) {
    const patterns = this.getCategoryPatterns();
    
    for (const [category, config] of Object.entries(patterns)) {
      for (const pattern of config.patterns) {
        if (new RegExp(pattern).test(typeName)) {
          return {
            category: category,
            description: config.description,
            icon: config.icon,
            folderPattern: category.replace(/\\s+/g, ''),
            matchedPattern: pattern
          };
        }
      }
    }
    
    return {
      category: "Uncategorized",
      description: "Types that don't match known patterns",
      icon: "unknown.ico",
      folderPattern: "Uncategorized",
      matchedPattern: "none"
    };
  }

  /**
   * Get reflection data from VS2022 service using existing client
   */
  private async getReflectionDataFromService(): Promise<any> {
    // Use the same connection pattern as other service calls - Named Pipe connection
    const client = new D365ServiceClient('mcp-xpp-d365-service', 30000, 60000);

    try {
      console.log('Connecting to VS2022 service for AOT reflection...');
      await client.connect();
      
      console.log('Requesting pure reflection data...');
      const response = await client.sendRequest('aotstructure', '', {});

      if (!response.Success || !response.Data) {
        throw new Error(`VS2022 service error: ${response.Error || 'Unknown error'}`);
      }

      console.log(`Retrieved ${response.Data.totalTypes} types from VS2022 service`);
      return response.Data;

    } finally {
      await client.disconnect();
    }
  }

  /**
   * Generate categorized AOT structure cache
   * This is called as part of the index build process
   */
  async generateAOTStructureCache(): Promise<void> {
    const startTime = Date.now();
    console.log('Generating AOT structure cache using Template-First architecture...');

    try {
      // Step 1: Get pure reflection data from VS2022 service  
      const reflectionData = await this.getReflectionDataFromService();
      
      // Step 2: Apply MCP pattern-based categorization
      console.log('Applying pattern-based categorization...');
      const categorizedTypes: Record<string, any> = {};
      let categorizedCount = 0;
      
      reflectionData.discoveredTypes.forEach((type: any) => {
        const categoryInfo = this.categorizeType(type.Name);
        
        if (!categorizedTypes[categoryInfo.category]) {
          categorizedTypes[categoryInfo.category] = {
            categoryName: categoryInfo.category,
            description: categoryInfo.description,
            icon: categoryInfo.icon,
            folderPattern: categoryInfo.folderPattern,
            types: []
          };
        }
        
        categorizedTypes[categoryInfo.category].types.push({
          ...type,
          matchedPattern: categoryInfo.matchedPattern,
          d365Metadata: this.extractD365Metadata(type)
        });
        
        if (categoryInfo.category !== "Uncategorized") {
          categorizedCount++;
        }
      });
      
      const categorizationRate = (categorizedCount / reflectionData.totalTypes * 100).toFixed(1);
      console.log(`Categorization complete: ${categorizedCount}/${reflectionData.totalTypes} types (${categorizationRate}%)`);
      
      // Step 3: Generate complete structure
      const completeStructure = {
        metadata: {
          generatedAt: new Date().toISOString(),
          totalTypes: reflectionData.totalTypes,
          categorizedTypes: categorizedCount,
          uncategorizedTypes: reflectionData.totalTypes - categorizedCount,
          categorizationRate: `${categorizationRate}%`,
          sourceAssembly: reflectionData.assemblyPath,
          generationTimeMs: Date.now() - startTime
        },
        categories: Object.entries(categorizedTypes)
          .sort(([,a], [,b]) => (b as any).types.length - (a as any).types.length)
          .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {} as Record<string, any>)
      };
      
      // Step 4: Save cache
      const cachePath = this.getCachePath();
      await fs.mkdir(dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(completeStructure, null, 2));
      
      // Cache in memory for quick access
      AOTStructureCacheManager.cachedStructure = completeStructure;
      
      const endTime = Date.now() - startTime;
      console.log(`AOT structure cache generated successfully in ${endTime}ms`);
      console.log(`Cache saved to: ${cachePath}`);
      console.log(`Categories: ${Object.keys(categorizedTypes).length}, Types: ${reflectionData.totalTypes}`);
      
    } catch (error) {
      console.error('Failed to generate AOT structure cache:', error);
      throw error;
    }
  }

  /**
   * Load AOT structure cache from disk
   */
  async loadCache(): Promise<any> {
    if (AOTStructureCacheManager.cachedStructure) {
      return AOTStructureCacheManager.cachedStructure;
    }

    try {
      const cachePath = this.getCachePath();
      const cacheContent = await fs.readFile(cachePath, 'utf8');
      AOTStructureCacheManager.cachedStructure = JSON.parse(cacheContent);
      return AOTStructureCacheManager.cachedStructure;
    } catch (error) {
      // Cache doesn't exist or is corrupted
      return null;
    }
  }

  /**
   * Check if cache needs refresh (called during index build)
   */
  async isCacheStale(): Promise<boolean> {
    try {
      const cache = await this.loadCache();
      if (!cache || !cache.metadata.generatedAt) {
        return true; // No cache or invalid cache
      }

      // Check if cache is older than 24 hours
      const cacheTime = new Date(cache.metadata.generatedAt).getTime();
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      return (now - cacheTime) > maxAge;
    } catch (error) {
      return true; // Error reading cache, consider stale
    }
  }

  /**
   * Get cached AOT structure for MCP tools
   */
  async getCachedStructure(): Promise<any> {
    const cache = await this.loadCache();
    if (!cache) {
      throw new Error('AOT structure cache not available. Run index build to generate cache.');
    }
    return cache;
  }

  /**
   * Get category statistics from cache
   */
  async getCategoryStats(): Promise<any> {
    const cache = await this.getCachedStructure();
    const stats: Record<string, number> = {};
    
    Object.entries(cache.categories).forEach(([category, data]: [string, any]) => {
      stats[category] = data.types.length;
    });

    return {
      totalCategories: Object.keys(cache.categories).length,
      totalTypes: cache.metadata.totalTypes,
      categorizationRate: cache.metadata.categorizationRate,
      categoryBreakdown: stats
    };
  }
}
