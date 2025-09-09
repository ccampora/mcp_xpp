import { z } from "zod";
import { join } from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createLoggedResponse } from "./logger.js";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { ObjectIndexManager } from "./object-index.js";
import { findXppObject } from "./parsers.js";
import { getServerStartTime } from "../index.js";

import { ObjectCreators } from "./object-creators.js";
import { SQLiteObjectLookup, ObjectLocation } from "./sqlite-lookup.js";

/**
 * Tool handlers for all MCP tools
 */
export class ToolHandlers {

  static async createXppObject(args: any, requestId: string): Promise<any> {
    // DEBUG: Let's see what we actually receive
    console.log('🔍 DEBUG createXppObject received args:', JSON.stringify(args, null, 2));
    
    // Handle the client's argument wrapping - check both direct args and wrapped args
    const actualArgs = args?.arguments || args;
    console.log('🔍 DEBUG actualArgs after unwrapping:', JSON.stringify(actualArgs, null, 2));
    
    // Special case: if no args provided, return cached object types
    if (!actualArgs || Object.keys(actualArgs).length === 0) {
      console.log('📋 No parameters provided, returning cached object types from index...');
      
      try {
        const cachedTypes = await ObjectIndexManager.getCachedObjectTypes();
        
        if (cachedTypes.length === 0) {
          return await createLoggedResponse(
            "❌ No object types cached. Please run build_object_index first to cache object types from VS2022 service.",
            requestId,
            "create_xpp_object"
          );
        }
        
        // Organize types by category for better display
        const typesByCategory: Record<string, string[]> = {
          'Core Objects': [],
          'Data Entities': [],
          'Reports': [],
          'Forms': [],
          'Security': [],
          'Workflow': [],
          'Other': []
        };
        
        cachedTypes.forEach(type => {
          if (type.includes('Class') || type.includes('Table') || type.includes('Enum') || type.includes('View')) {
            typesByCategory['Core Objects'].push(type);
          } else if (type.includes('DataEntity') || type.includes('Aggregate')) {
            typesByCategory['Data Entities'].push(type);
          } else if (type.includes('Report') || type.includes('Ssrs')) {
            typesByCategory['Reports'].push(type);
          } else if (type.includes('Form') || type.includes('Menu')) {
            typesByCategory['Forms'].push(type);
          } else if (type.includes('Security') || type.includes('Role') || type.includes('Duty') || type.includes('Privilege')) {
            typesByCategory['Security'].push(type);
          } else if (type.includes('Workflow')) {
            typesByCategory['Workflow'].push(type);
          } else {
            typesByCategory['Other'].push(type);
          }
        });
        
        let content = `Available D365 Object Types (${cachedTypes.length} total)\n`;
        content += `Cached from VS2022 service reflection\n\n`;
        
        // Show organized categories
        Object.entries(typesByCategory).forEach(([category, types]) => {
          if (types.length > 0) {
            content += `${category} (${types.length}):\n`;
            types.slice(0, 10).forEach(type => {
              content += `  • ${type}\n`;
            });
            if (types.length > 10) {
              content += `  ... and ${types.length - 10} more\n`;
            }
            content += '\n';
          }
        });
        
        content += `\nTo create an object, use:\n`;
        content += `create_xpp_object with objectName and objectType parameters\n`;
        content += `\nCommon examples:\n`;
        content += `• AxClass - X++ Class\n`;
        content += `• AxTable - Table definition\n`;
        content += `• AxEnum - Enumeration\n`;
        content += `• AxForm - User interface form\n`;
        content += `• AxDataEntity - Data entity\n`;
        
        return await createLoggedResponse(content, requestId, "create_xpp_object");
        
      } catch (error) {
        return await createLoggedResponse(
          `❌ Error retrieving cached object types: ${error instanceof Error ? error.message : 'Unknown error'}`,
          requestId,
          "create_xpp_object"
        );
      }
    }
    
    // Regular object creation flow with parameters
    const schema = z.object({
      objectName: z.string(),
      objectType: z.string(),
      layer: z.string().optional(),
      publisher: z.string().default("YourCompany"),
      version: z.string().default("1.0.0.0"),
      dependencies: z.array(z.string()).default(["ApplicationPlatform", "ApplicationFoundation"]),
      outputPath: z.string().default("Models"),
      properties: z.record(z.any()).optional(),
    });
    
    const params = schema.parse(actualArgs);
    
    // Note: xppPath no longer required - VS2022 service handles all operations
    console.log(`Creating ${params.objectType} '${params.objectName}' using direct VS2022 service integration...`);
    
    let content: string;
    const startTime = Date.now();
    
    try {
      // Direct VS2022 service integration based on objectType
      switch (params.objectType.toLowerCase()) {
        case "model":
          content = await ObjectCreators.createModel(params.objectName, { 
            layer: params.layer, 
            publisher: params.publisher, 
            version: params.version, 
            dependencies: params.dependencies, 
            outputPath: params.outputPath 
          });
          break;
        case "class":
          content = await ObjectCreators.createClass(params.objectName, { 
            layer: params.layer, 
            outputPath: params.outputPath 
          });
          break;
        case "table":
          content = await ObjectCreators.createTable(params.objectName, { 
            layer: params.layer, 
            outputPath: params.outputPath 
          });
          break;
        case "enum":
          content = await ObjectCreators.createEnum(params.objectName, { 
            layer: params.layer, 
            outputPath: params.outputPath 
          });
          break;
        case "form":
          content = await ObjectCreators.createForm(params.objectName, { 
            layer: params.layer, 
            outputPath: params.outputPath 
          });
          break;
        default:
          throw new Error(`Unsupported object type: ${params.objectType}. Supported types: model, class, table, enum, form`);
      }
      
      const executionTime = Date.now() - startTime;
      content += `\n\nPerformance: ${executionTime}ms using direct VS2022 service integration\n`;
      content += `Direct Microsoft API: Zero configuration overhead\n`;
      
      return await createLoggedResponse(content, requestId, "create_xpp_object");
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      content = `Failed to create ${params.objectType} '${params.objectName}'\n\n`;
      content += `Error: ${errorMsg}\n\n`;
      content += `Execution time: ${executionTime}ms\n`;
      content += `Ensure VS2022 service is running and object type is supported\n`;
      
      return await createLoggedResponse(content, requestId, "create_xpp_object");
    }
  }

  static async findXppObject(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectName: z.string(),
      objectType: z.string().optional(),
      model: z.string().optional(),
    });
    const { objectName, objectType, model } = schema.parse(args);
    
    // No need to check XPP path - findXppObject uses SQLite first, filesystem fallback
    const results = await findXppObject(objectName, objectType, model);
    
    let content = `Search results for X++ object "${objectName}"`;
    if (objectType) content += ` of type "${objectType}"`;
    if (model) content += ` in model "${model}"`;
    content += `:\n\n`;
    
    if (results.length === 0) {
      content += "No objects found. The object does not exist in the codebase.\n";
    } else {
      content += `Found ${results.length} object(s):\n\n`;
      for (const result of results) {
        content += `${result.name}\n`;
        content += `   Type: ${result.type}\n`;
        content += `   Path: ${result.path}\n`;
        if (result.model) content += `   Model: ${result.model}\n`;
        content += `\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "find_xpp_object");
  }

  static async buildCache(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectType: z.string().optional(),
      forceRebuild: z.boolean().optional().default(false),
    });
    const { objectType, forceRebuild } = schema.parse(args);
    
    // Note: xppPath no longer required for index building - VS2022 service provides all data
    let content = "";
  
    // Build file object index
    await ObjectIndexManager.buildFullIndex(forceRebuild);
    const stats = ObjectIndexManager.getStats();
    content = `Full index build complete:\n`;
    content += `- Total objects: ${stats.totalObjects}\n\n`;
    content += "By type:\n";
    for (const [type, count] of Object.entries(stats.byType)) {
      content += `- ${type}: ${count}\n`;
    }
    
    // Also cache object types from VS2022 service during index build
    try {
      content += "\n=== Caching Object Types from VS2022 Service ===\n";
      const availableTypes = await AOTStructureManager.getAvailableObjectTypes();
      
      // Cache object types in SQLite for fast retrieval
      await ObjectIndexManager.cacheObjectTypes(availableTypes);
      
      content += `✅ Cached ${availableTypes.length} object types from VS2022 reflection\n`;
      content += `📊 Sample types: ${availableTypes.slice(0, 10).join(', ')}...\n`;
      
      // Show type distribution
      const typePatterns: Record<string, number> = {};
      availableTypes.forEach(type => {
        const prefix = type.substring(0, 4);
        typePatterns[prefix] = (typePatterns[prefix] || 0) + 1;
      });
      
      content += "\n🏷️ Type Distribution (top 10):\n";
      Object.entries(typePatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([prefix, count]) => {
          content += `   ${prefix}*: ${count} types\n`;
        });
        
    } catch (error) {
      content += `⚠️ Failed to cache object types: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
    }

    return await createLoggedResponse(content, requestId, "build_object_index");
  }

  static async getCurrentConfig(args: any, requestId: string): Promise<any> {
    try {
      const config = await AppConfig.getApplicationConfiguration();
      
      // Handle specific model request
      if (args?.model) {
        const targetModel = config.models.find(m => 
          m.name.toLowerCase() === args.model.toLowerCase() ||
          m.displayName?.toLowerCase() === args.model.toLowerCase()
        );
        
        if (!targetModel) {
          const availableModels = config.models.map(m => m.name).slice(0, 10);
          return await createLoggedResponse(
            `Model '${args.model}' not found. Available models (first 10): ${availableModels.join(', ')}...`, 
            requestId, 
            "get_current_config"
          );
        }
        
        const response = {
          _meta: {
            type: "model-detail",
            timestamp: new Date().toISOString(),
            version: "1.0.0"
          },
          model: targetModel,
          serverInfo: {
            name: "MCP X++ Server",
            version: "1.0.0",
            startTime: getServerStartTime(),
            uptime: getServerStartTime() ? 
              Math.floor((Date.now() - getServerStartTime()!.getTime()) / 1000) + "s" : "unknown"
          }
        };
        
        return await createLoggedResponse(JSON.stringify(response, null, 2), requestId, "get_current_config");
      }
      
      // Handle object type list request
      if (args?.objectTypeList === true) {
        const availableObjectTypes = await AOTStructureManager.getAvailableObjectTypes();
        const objectTypesInfo = ToolHandlers.categorizeObjectTypes(availableObjectTypes);
        
        const response = {
          _meta: {
            type: "object-types",
            timestamp: new Date().toISOString(),
            version: "1.0.0"
          },
          objectTypes: {
            total: availableObjectTypes.length,
            list: availableObjectTypes,
            categories: objectTypesInfo.categories,
            samples: {
              classes: availableObjectTypes.filter(t => t.includes('Class')).slice(0, 5),
              tables: availableObjectTypes.filter(t => t.includes('Table')).slice(0, 5),
              forms: availableObjectTypes.filter(t => t.includes('Form')).slice(0, 5),
              enums: availableObjectTypes.filter(t => t.includes('Enum')).slice(0, 5),
              other: availableObjectTypes.filter(t => !t.includes('Class') && !t.includes('Table') && !t.includes('Form') && !t.includes('Enum')).slice(0, 5)
            }
          },
          serverInfo: {
            name: "MCP X++ Server",
            version: "1.0.0",
            cacheStatus: "Using cached object types from SQLite"
          }
        };
        
        return await createLoggedResponse(JSON.stringify(response, null, 2), requestId, "get_current_config");
      }
      
      // Default: Return summary view with model names only
      const groupedModels = ToolHandlers.groupModelsByType(config.models);
      
      // Only call VS2022 service if explicitly requested via args.includeVS2022Service
      let vs2022ServiceInfo = null;
      if (args?.includeVS2022Service === true) {
        try {
          // Wrap the entire D365 service interaction in a more robust error handler
          const servicePromise = (async () => {
            const { D365ServiceClient } = await import('./d365-service-client.js');
            const client = new D365ServiceClient();
            
            // Set up error handler for the client to prevent unhandled errors
            client.on('error', (error) => {
              console.warn('D365 Service Client error (handled):', error.message);
            });
            
            await client.connect();
            
            // Get service health and models from VS2022 service
            const [healthStatus, serviceModels] = await Promise.all([
              client.healthCheck().catch(() => ({ status: 'unavailable' })),
              client.getModels().catch(() => null)
            ]);
            
            const result = {
              status: healthStatus.status || 'connected',
              modelsCount: serviceModels?.length || 0,
              serviceModels: serviceModels || [],
              lastUpdated: new Date().toISOString()
            };
            
            await client.disconnect();
            return result;
          })();
          
          // Add a timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Service connection timeout')), 3000);
          });
          
          vs2022ServiceInfo = await Promise.race([servicePromise, timeoutPromise]);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Service connection failed';
          console.warn('D365 Service unavailable:', errorMessage);
          
          vs2022ServiceInfo = {
            status: 'unavailable',
            error: errorMessage,
            lastUpdated: new Date().toISOString()
          };
        }
      } else {
        vs2022ServiceInfo = {
          status: 'not-requested',
          note: 'Use includeVS2022Service: true parameter to get live VS2022 service status',
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Summary response: simplified model information (names only)
      const summaryModels = {
        custom: groupedModels.custom.map(m => ({ name: m.name, displayName: m.displayName })),
        standard: groupedModels.standard.map(m => ({ name: m.name, displayName: m.displayName })),
        summary: groupedModels.summary
      };
      
      const response = {
        _meta: {
          type: "configuration-summary",
          timestamp: new Date().toISOString(),
          version: "1.0.0"
        },
        serverConfig: config.serverConfig,
        indexStats: config.indexStats,
        models: summaryModels, // Simplified model structure with names only
        applicationInfo: config.applicationInfo,
        systemInfo: config.systemInfo,
        vs2022Service: vs2022ServiceInfo,
        summary: {
          totalModels: config.models.length,
          customModels: groupedModels.custom.length,
          standardModels: groupedModels.standard.length,
          indexedObjects: config.indexStats.totalObjects,
          serverStatus: (vs2022ServiceInfo as any)?.status || 'not-requested'
        }
      };
      
      return await createLoggedResponse(JSON.stringify(response, null, 2), requestId, "get_current_config");
    } catch (error) {
      const errorMsg = `Error retrieving configuration: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return await createLoggedResponse(errorMsg, requestId, "get_current_config");
    }
  }

  /**
   * Group models by custom vs standard based on layer and publisher
   */
  private static groupModelsByType(models: any[]): { custom: any[], standard: any[], summary: any } {
    const customLayers = ['usr', 'cus', 'var', 'isv'];
    const microsoftPublishers = ['Microsoft Corporation', 'Microsoft', 'Microsoft Dynamics'];
    
    const custom: any[] = [];
    const standard: any[] = [];
    
    for (const model of models) {
      const isCustomLayer = customLayers.includes(model.layer?.toLowerCase());
      const isMicrosoftPublisher = microsoftPublishers.some(pub => 
        model.publisher?.toLowerCase().includes(pub.toLowerCase())
      );
      
      // Consider it custom if it's in a custom layer OR not published by Microsoft
      if (isCustomLayer || !isMicrosoftPublisher) {
        custom.push({
          ...model,
          modelType: 'custom',
          reason: isCustomLayer ? `Custom layer: ${model.layer}` : `Non-Microsoft publisher: ${model.publisher}`
        });
      } else {
        standard.push({
          ...model,
          modelType: 'standard',
          reason: `Microsoft standard model in layer: ${model.layer}`
        });
      }
    }
    
    // Sort each group by name
    custom.sort((a, b) => a.name.localeCompare(b.name));
    standard.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      custom,
      standard,
      summary: {
        totalModels: models.length,
        customCount: custom.length,
        standardCount: standard.length,
        customLayers: [...new Set(custom.map(m => m.layer).filter(Boolean))],
        standardLayers: [...new Set(standard.map(m => m.layer).filter(Boolean))],
        publishers: [...new Set(models.map(m => m.publisher).filter(Boolean))]
      }
    };
  }

  /**
   * Categorize object types into logical groups for better UX
   */
  private static categorizeObjectTypes(objectTypes: string[]): any {
    const categories = {
      core: [] as string[],
      ui: [] as string[],
      data: [] as string[],
      workflow: [] as string[],
      integration: [] as string[],
      reporting: [] as string[],
      security: [] as string[],
      other: [] as string[]
    };

    // Define categorization rules
    const coreTypes = ['class', 'enum', 'edt', 'macro', 'interface'];
    const uiTypes = ['form', 'menu', 'menuItem', 'tile', 'perspective'];
    const dataTypes = ['table', 'view', 'query', 'dataEntity', 'map'];
    const workflowTypes = ['workflow'];
    const integrationTypes = ['service', 'serviceGroup'];
    const reportingTypes = ['report'];
    const securityTypes = ['securityKey', 'securityDuty', 'securityPrivilege', 'securityRole', 'securityPolicy'];

    // Categorize each object type
    for (const type of objectTypes) {
      const lowerType = type.toLowerCase();
      
      if (coreTypes.some(ct => lowerType.includes(ct))) {
        categories.core.push(type);
      } else if (uiTypes.some(ut => lowerType.includes(ut))) {
        categories.ui.push(type);
      } else if (dataTypes.some(dt => lowerType.includes(dt))) {
        categories.data.push(type);
      } else if (workflowTypes.some(wt => lowerType.includes(wt))) {
        categories.workflow.push(type);
      } else if (integrationTypes.some(it => lowerType.includes(it))) {
        categories.integration.push(type);
      } else if (reportingTypes.some(rt => lowerType.includes(rt))) {
        categories.reporting.push(type);
      } else if (securityTypes.some(st => lowerType.includes(st))) {
        categories.security.push(type);
      } else {
        categories.other.push(type);
      }
    }

    // Sort each category
    Object.values(categories).forEach(cat => cat.sort());

    return {
      total: objectTypes.length,
      categories,
      summary: {
        core: categories.core.length,
        ui: categories.ui.length,
        data: categories.data.length,
        workflow: categories.workflow.length,
        integration: categories.integration.length,
        reporting: categories.reporting.length,
        security: categories.security.length,
        other: categories.other.length
      },
      allTypes: objectTypes.sort()
    };
  }

  /**
   * Build structured object data for JSON format responses, suitable for AOT tree building
   */
  private static buildStructuredObjectData(objects: any[], isModelBrowse: boolean): any {
    if (isModelBrowse) {
      // For model browsing, group by object type first, then by model
      const byType: { [key: string]: { [key: string]: any[] } } = {};
      
      objects.forEach(obj => {
        if (!byType[obj.type]) {
          byType[obj.type] = {};
        }
        if (!byType[obj.type][obj.model]) {
          byType[obj.type][obj.model] = [];
        }
        byType[obj.type][obj.model].push({
          name: obj.name,
          path: obj.path,
          model: obj.model,
          type: obj.type
        });
      });

      // Sort object types and models
      const sortedTypes = Object.keys(byType).sort();
      const result: any = {};
      
      sortedTypes.forEach(type => {
        const sortedModels = Object.keys(byType[type]).sort();
        result[type] = {};
        
        sortedModels.forEach(model => {
          result[type][model] = byType[type][model].sort((a, b) => a.name.localeCompare(b.name));
        });
      });
      
      return result;
    } else {
      // For pattern searches, group by model first, then by object type
      const byModel: { [key: string]: { [key: string]: any[] } } = {};
      
      objects.forEach(obj => {
        if (!byModel[obj.model]) {
          byModel[obj.model] = {};
        }
        if (!byModel[obj.model][obj.type]) {
          byModel[obj.model][obj.type] = [];
        }
        byModel[obj.model][obj.type].push({
          name: obj.name,
          path: obj.path,
          model: obj.model,
          type: obj.type
        });
      });

      // Sort models and types
      const sortedModels = Object.keys(byModel).sort();
      const result: any = {};
      
      sortedModels.forEach(model => {
        const sortedTypes = Object.keys(byModel[model]).sort();
        result[model] = {};
        
        sortedTypes.forEach(type => {
          result[model][type] = byModel[model][type].sort((a, b) => a.name.localeCompare(b.name));
        });
      });
      
      return result;
    }
  }

  static async searchObjectsPattern(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      pattern: z.string(),
      objectType: z.string().optional(),
      model: z.string().optional(),
      limit: z.number().optional().default(50),
      format: z.enum(["text", "json"]).optional().default("text"),
    });
    const { pattern, objectType, model, limit, format } = schema.parse(args);

    let lookup: SQLiteObjectLookup | null = null;
    
    try {
      lookup = new SQLiteObjectLookup();
      
      if (!lookup.initialize()) {
        return await createLoggedResponse(
          `SQLite object database not available. Run migration: node misc/migrate-to-sqlite.mjs`,
          requestId,
          "search_objects_pattern"
        );
      }

      const startTime = Date.now();
      let results;
      
      // Determine search strategy based on parameters
      if (pattern === "*" && model && !objectType) {
        // Browse all objects in a specific model
        results = lookup.findObjectsByModel(model);
      } else if (pattern === "*" && model && objectType) {
        // Browse specific object type in a specific model
        results = lookup.findObjectsByModelAndType(model, objectType);
      } else if (objectType && !model) {
        // Optimized pattern + type search (most common case)
        results = lookup.searchObjectsByPatternAndType(pattern, objectType);
      } else {
        // Pattern-based search with optional filters
        results = lookup.searchObjects(pattern);
        
        // Apply additional filters if specified
        if (objectType) {
          results = results.filter(obj => obj.type === objectType);
        }
        
        if (model) {
          results = results.filter(obj => obj.model === model);
        }
      }
      
      const limitedResults = results.slice(0, limit);
      const duration = Date.now() - startTime;
      
      // Handle JSON format for AOT tree building
      if (format === "json") {
        const jsonResponse = {
          meta: {
            queryType: pattern === "*" && model ? "modelBrowse" : "patternSearch",
            pattern,
            objectType: objectType || null,
            model: model || null,
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            totalResults: results.length,
            returnedResults: limitedResults.length,
            limitApplied: limitedResults.length < results.length
          },
          data: ToolHandlers.buildStructuredObjectData(limitedResults, pattern === "*" && !!model)
        };
        
        return await createLoggedResponse(JSON.stringify(jsonResponse, null, 2), requestId, "search_objects_pattern");
      }
      
      // Generate context-aware header for text format
      let content: string;
      if (pattern === "*" && model) {
        content = `📦 Model Browser: "${model}"`;
        if (objectType) content += ` (${objectType} objects only)`;
      } else {
        content = `🔍 Pattern Search: "${pattern}"`;
        if (objectType) content += ` (${objectType} only)`;
        if (model) content += ` in ${model}`;
      }
      content += `\n⚡ Query time: ${duration}ms\n\n`;

      if (results.length === 0) {
        if (pattern === "*" && model) {
          content += `❌ No objects found in model "${model}"`;
          if (objectType) content += ` of type "${objectType}"`;
          content += `\n\n💡 Suggestions:\n`;
          content += `   • Check model name spelling\n`;
          content += `   • Try without object type filter\n`;
          content += `   • Search pattern: search_objects_pattern("*", "", "${model}")\n`;
        } else {
          content += `❌ No objects found matching pattern "${pattern}"`;
          if (objectType || model) {
            content += ` with the specified filters`;
          }
          content += `\n\n💡 Pattern Examples:\n`;
          content += `   • "Cust*" - objects starting with "Cust"\n`;
          content += `   • "*Table" - objects ending with "Table"\n`;
          content += `   • "*Invoice*" - objects containing "Invoice"\n`;
          content += `   • "Sales?" - "Sales" + one character\n`;
          content += `   • "*" + model filter - browse entire model\n`;
        }
      } else {
        content += `✅ Found ${results.length} matches`;
        if (limitedResults.length < results.length) {
          content += ` (showing first ${limitedResults.length})`;
        }
        content += `\n\n`;

        // For model browsing (pattern="*"), group by object type for better readability
        if (pattern === "*" && model) {
          const grouped: { [key: string]: typeof limitedResults } = {};
          limitedResults.forEach((obj: ObjectLocation) => {
            if (!grouped[obj.type]) {
              grouped[obj.type] = [];
            }
            grouped[obj.type].push(obj);
          });

          for (const [type, objects] of Object.entries(grouped)) {
            content += `🏷️  ${type} (${objects.length}):\n`;
            objects.forEach((obj: ObjectLocation) => {
              content += `   • ${obj.name}\n`;
            });
            content += `\n`;
          }
        } else {
          // For pattern searches, show individual results
          limitedResults.forEach((obj, i) => {
            content += `${i + 1}. ${obj.name}\n`;
            content += `   📦 ${obj.model} → ${obj.type}\n`;
            content += `   📁 ${obj.path}\n`;
            content += `\n`;
          });
        }

        if (limitedResults.length < results.length) {
          content += `... and ${results.length - limitedResults.length} more matches\n\n`;
          content += `💡 Use higher limit to see more: search_objects_pattern("${pattern}", "${objectType || ''}", "${model || ''}", ${results.length})\n`;
        }
        
        // Provide usage examples for complex scenarios
        if (pattern === "*" && model && results.length > 100) {
          content += `\n📝 Usage Examples:\n`;
          content += `   • Filter by type: search_objects_pattern("*", "AxClass", "${model}")\n`;
          content += `   • Search within model: search_objects_pattern("Cust*", "", "${model}")\n`;
        }
      }

      return await createLoggedResponse(content, requestId, "search_objects_pattern");
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return await createLoggedResponse(
        `Error in pattern search: ${errorMsg}`,
        requestId,
        "search_objects_pattern"
      );
    } finally {
      if (lookup) {
        lookup.close();
      }
    }
  }
}
