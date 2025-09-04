import { z } from "zod";
import { join } from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createLoggedResponse } from "./logger.js";
import { XPP_EXTENSIONS } from "./config.js";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { ObjectIndexManager } from "./object-index.js";
import { EnhancedSearchManager } from "./search.js";
import { parseXppClass, parseXppTable, findXppObject } from "./parsers.js";
import { safeReadFile, getDirectoryListing, searchInFiles } from "./file-utils.js";
import { ObjectCreators } from "./object-creators.js";
import { SQLiteObjectLookup } from "./sqlite-lookup.js";

/**
 * Tool handlers for all MCP tools
 */
export class ToolHandlers {

  static async createXppObject(args: any, requestId: string): Promise<any> {
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
    
    const params = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
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
        default:
          throw new Error(`Unsupported object type: ${params.objectType}. Supported types: model, class, table, enum`);
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

  static async browseDirectory(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      path: z.string().optional().default(""),
      showHidden: z.boolean().optional().default(false),
    });
    const { path, showHidden } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const fullPath = path ? join(xppPath, path) : xppPath;
    const entries = await getDirectoryListing(fullPath, showHidden);
    
    let content = `Directory: ${path || "/"}\n`;
    content += `Total items: ${entries.length}\n\n`;
    
    for (const entry of entries) {
      const icon = entry.type === 'directory' ? '[DIR]' : '[FILE]';
      const size = entry.type === 'file' ? ` (${entry.size} bytes)` : '';
      content += `${icon} ${entry.name}${size}\n`;
    }
    
    return await createLoggedResponse(content, requestId, "browse_directory");
  }

  static async readFile(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      path: z.string(),
    });
    const { path } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const fullPath = join(xppPath, path);
    const content = await safeReadFile(fullPath);
    
    return await createLoggedResponse(content, requestId, "read_file");
  }

  static async searchFiles(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      searchTerm: z.string(),
      path: z.string().optional().default(""),
      extensions: z.array(z.string()).optional().default([]),
    });
    const { searchTerm, path, extensions } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const searchPath = path ? join(xppPath, path) : xppPath;
    const results = await searchInFiles(searchTerm, searchPath, extensions.length > 0 ? extensions : XPP_EXTENSIONS);
    
    let content = `Search results for "${searchTerm}":\n`;
    content += `Found ${results.length} matches\n\n`;
    
    for (const result of results) {
      content += `📄 ${result.path}\n`;
      content += `   Size: ${result.size} bytes, Modified: ${result.lastModified}\n\n`;
    }
    
    return await createLoggedResponse(content, requestId, "search_files");
  }

  static async findXppObject(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectName: z.string(),
      objectType: z.string().optional(),
    });
    const { objectName, objectType } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const results = await findXppObject(objectName, objectType);
    
    let content = `Search results for X++ object "${objectName}"`;
    if (objectType) content += ` of type "${objectType}"`;
    content += `:\n\n`;
    
    if (results.length === 0) {
      content += "No objects found. The object does not exist in the codebase.\n";
    } else {
      content += `Found ${results.length} object(s):\n\n`;
      for (const result of results) {
        content += `${result.name}\n`;
        content += `   Type: ${result.type}\n`;
        content += `   Path: ${result.path}\n\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "find_xpp_object");
  }

  static async getClassMethods(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      className: z.string(),
    });
    const { className } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    // Find the class file first
    const classObjects = await findXppObject(className, "CLASSES");
    
    if (classObjects.length === 0) {
      throw new Error(`Class "${className}" not found in the codebase.`);
    }
    
    const classPath = join(xppPath, classObjects[0].path);
    const classInfo = await parseXppClass(classPath);
    
    if (classInfo.error) {
      throw new Error(classInfo.error);
    }
    
    let content = `Class: ${classInfo.name}\n\n`;
    
    if (classInfo.extends) {
      content += `Extends: ${classInfo.extends}\n`;
    }
    
    if (classInfo.implements.length > 0) {
      content += `Implements: ${classInfo.implements.join(', ')}\n`;
    }
    
    content += `Abstract: ${classInfo.isAbstract ? 'Yes' : 'No'}\n`;
    content += `Final: ${classInfo.isFinal ? 'Yes' : 'No'}\n\n`;
    
    if (classInfo.methods.length > 0) {
      content += `Methods (${classInfo.methods.length}):\n\n`;
      for (const method of classInfo.methods) {
        const visibility = method.isPrivate ? 'private' : method.isProtected ? 'protected' : 'public';
        const staticModifier = method.isStatic ? 'static ' : '';
        const params = method.parameters.map((p: any) => `${p.type} ${p.name}`).join(', ');
        
        content += `  ${visibility} ${staticModifier}${method.returnType} ${method.name}(${params})\n`;
      }
    }
    
    if (classInfo.properties.length > 0) {
      content += `\nProperties (${classInfo.properties.length}):\n\n`;
      for (const prop of classInfo.properties) {
        const visibility = prop.isPublic ? 'public' : 'private';
        const staticModifier = prop.isStatic ? 'static ' : '';
        
        content += `  ${visibility} ${staticModifier}${prop.type} ${prop.name}\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "get_class_methods");
  }

  static async getTableStructure(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      tableName: z.string(),
    });
    const { tableName } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    // Find the table file first
    const tableObjects = await findXppObject(tableName, "TABLES");
    
    if (tableObjects.length === 0) {
      throw new Error(`Table "${tableName}" not found in the codebase.`);
    }
    
    const tablePath = join(xppPath, tableObjects[0].path);
    const tableInfo = await parseXppTable(tablePath);
    
    if (tableInfo.error) {
      throw new Error(tableInfo.error);
    }
    
    let content = `Table: ${tableInfo.name}\n\n`;
    
    if (tableInfo.properties.label) {
      content += `Label: ${tableInfo.properties.label}\n`;
    }
    
    if (tableInfo.properties.helpText) {
      content += `Help Text: ${tableInfo.properties.helpText}\n`;
    }
    
    content += '\n';
    
    if (tableInfo.fields.length > 0) {
      content += `Fields (${tableInfo.fields.length}):\n\n`;
      for (const field of tableInfo.fields) {
        content += `  ${field.name} (${field.type})`;
        if (field.label) content += ` - ${field.label}`;
        content += '\n';
      }
    }
    
    if (tableInfo.indexes.length > 0) {
      content += `\nIndexes (${tableInfo.indexes.length}):\n\n`;
      for (const index of tableInfo.indexes) {
        content += `  ${index.name} ${index.unique ? '(Unique)' : '(Non-unique)'}\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "get_table_structure");
  }

  static async discoverObjectTypesJson(args: any, requestId: string): Promise<any> {
    await AOTStructureManager.loadStructure();
    const structure = AOTStructureManager.getRawStructure();
    
    if (!structure) {
      throw new Error("Could not load AOT structure");
    }
    
    const content = JSON.stringify(structure, null, 2);
    return await createLoggedResponse(content, requestId, "discover_object_types_json");
  }

  static async buildObjectIndex(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectType: z.string().optional(),
      forceRebuild: z.boolean().optional().default(false),
    });
    const { objectType, forceRebuild } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    let content = "";
    
    if (objectType) {
      const results = await ObjectIndexManager.buildIndexByType(objectType, forceRebuild);
      content = `Index build complete for ${objectType}:\n`;
      content += `- Indexed: ${results.indexedCount} objects\n`;
      content += `- Skipped: ${results.skippedCount} objects\n`;
    } else {
      await ObjectIndexManager.buildFullIndex(forceRebuild);
      const stats = ObjectIndexManager.getStats();
      content = `Full index build complete:\n`;
      content += `- Total objects: ${stats.totalObjects}\n\n`;
      content += "By type:\n";
      for (const [type, count] of Object.entries(stats.byType)) {
        content += `- ${type}: ${count}\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "build_object_index");
  }

  static async listObjectsByType(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectType: z.string().optional().default("CLASSES"), // Default to CLASSES if not specified
      sortBy: z.enum(["name", "package", "size"]).optional().default("name"),
      limit: z.number().optional().default(50), // Default limit if not specified
    });
    const { objectType, sortBy, limit } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }

    let lookup: SQLiteObjectLookup | null = null;
    
    try {
      lookup = new SQLiteObjectLookup();
      const initialized = lookup.initialize();
      if (!initialized) {
        throw new Error("Failed to initialize SQLite lookup - database may not exist. Run build_object_index first.");
      }
      
      // Find objects by type using SQLite
      const allObjects = lookup.findObjectsByType(objectType);
      
      // Apply sorting
      if (sortBy === "name") {
        allObjects.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === "package") {
        allObjects.sort((a, b) => a.package.localeCompare(b.package));
      } else if (sortBy === "size") {
        allObjects.sort((a, b) => (b.size || 0) - (a.size || 0));
      }
      
      // Apply limit
      const objects = allObjects.slice(0, limit);
      
      const response = {
        objectType,
        totalCount: allObjects.length,
        objects: objects.map(obj => ({
          name: obj.name,
          package: obj.package,
          path: obj.path,
          size: obj.size || 0
        }))
      };
      
      const content = JSON.stringify(response, null, 2);
      
      return await createLoggedResponse(content, requestId, "list_objects_by_type");
    } finally {
      if (lookup) {
        lookup.close();
      }
    }
  }

  static async smartSearch(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      searchTerm: z.string(),
      searchPath: z.string().optional().default(""),
      extensions: z.array(z.string()).optional().default([]),
      maxResults: z.number().optional().default(50),
    });
    const { searchTerm, searchPath, extensions, maxResults } = schema.parse(args);
    
    const xppPath = AppConfig.getXppPath();
    if (!xppPath) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const results = await EnhancedSearchManager.smartSearch(
      searchTerm, 
      searchPath, 
      extensions, 
      maxResults
    );
    
    let content = `Smart search results for "${searchTerm}":\n`;
    content += `Found ${results.length} results\n\n`;
    
    for (const result of results) {
      if (result.type === 'object') {
        content += `OBJECT: ${result.name} (${result.objectType})\n`;
        content += `   Package: ${result.package}\n`;
        content += `   Path: ${result.path}\n\n`;
      } else {
        content += `FILE: ${result.path}\n`;
        content += `   Line ${result.line}: ${result.content}\n\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "smart_search");
  }

  static async getCurrentConfig(args: any, requestId: string): Promise<any> {
    try {
      const config = await AppConfig.getApplicationConfiguration();
      
      // Group models by type (custom vs standard)
      const groupedModels = ToolHandlers.groupModelsByType(config.models);
      
      // Try to get additional information from VS2022 service if available
      let vs2022ServiceInfo = null;
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
          setTimeout(() => reject(new Error('Service connection timeout')), 5000);
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
      
      const response = {
        _meta: {
          type: "configuration",
          timestamp: new Date().toISOString(),
          version: "1.0.0"
        },
        ...config,
        models: groupedModels, // Replace flat models list with grouped structure
        vs2022Service: vs2022ServiceInfo,
        summary: {
          totalModels: config.models.length,
          customModels: groupedModels.custom.length,
          standardModels: groupedModels.standard.length,
          indexedObjects: config.indexStats.totalObjects,
          serverStatus: (vs2022ServiceInfo as any)?.status || 'unknown'
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

  // =====================================================================
  // SQLITE OBJECT LOOKUP TOOLS
  // =====================================================================

  static async findObjectLocation(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectName: z.string(),
      packageName: z.string().optional(),
    });
    const { objectName, packageName } = schema.parse(args);

    let lookup: SQLiteObjectLookup | null = null;
    
    try {
      lookup = new SQLiteObjectLookup();
      
      if (!lookup.initialize()) {
        return await createLoggedResponse(
          `SQLite object database not available. Run migration: node misc/migrate-to-sqlite.mjs`,
          requestId,
          "find_object_location"
        );
      }

      const startTime = Date.now();
      let results;
      
      if (packageName) {
        const exactResult = lookup.findObjectExact(objectName, packageName);
        results = exactResult ? [exactResult] : [];
      } else {
        results = lookup.findObject(objectName);
      }
      
      const duration = Date.now() - startTime;
      
      let content = `🔍 Object Location Search: "${objectName}"`;
      if (packageName) content += ` in package "${packageName}"`;
      content += `\n⚡ Query time: ${duration}ms\n\n`;

      if (results.length === 0) {
        content += `❌ Object "${objectName}" not found in D365 codebase`;
        if (packageName) content += ` within package "${packageName}"`;
        content += `\n\n💡 Suggestions:\n`;
        content += `   • Check object name spelling\n`;
        content += `   • Try pattern search: search_objects_pattern("${objectName}*")\n`;
        content += `   • Browse package: browse_package_objects("PackageName")\n`;
      } else if (results.length === 1) {
        const obj = results[0];
        content += `✅ Found object:\n\n`;
        content += `📦 Package/Model: ${obj.package}\n`;
        content += `🏷️  Object Type: ${obj.type}\n`;
        content += `📁 File Path: ${obj.path}\n`;
        if (obj.size) content += `💾 File Size: ${(obj.size / 1024).toFixed(1)}KB\n`;
        if (obj.lastModified) {
          const date = new Date(obj.lastModified);
          content += `📅 Last Modified: ${date.toLocaleDateString()}\n`;
        }
        content += `\n🎯 Analysis Ready:\n`;
        content += `   Use "read_file" with path: ${obj.path}\n`;
      } else {
        content += `⚠️  Found ${results.length} objects with name "${objectName}":\n\n`;
        results.forEach((obj, i) => {
          content += `${i + 1}. ${obj.package}/${obj.type}\n`;
          content += `   📁 ${obj.path}\n`;
          if (obj.size) content += `   💾 ${(obj.size / 1024).toFixed(1)}KB\n`;
          content += `\n`;
        });
        content += `💡 To resolve conflict, specify package:\n`;
        content += `   find_object_location("${objectName}", "PackageName")\n`;
      }

      return await createLoggedResponse(content, requestId, "find_object_location");
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return await createLoggedResponse(
        `Error in object lookup: ${errorMsg}`,
        requestId,
        "find_object_location"
      );
    } finally {
      if (lookup) {
        lookup.close();
      }
    }
  }

  static async browsePackageObjects(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      packageName: z.string(),
      objectType: z.string().optional(),
      limit: z.number().optional().default(100),
    });
    const { packageName, objectType, limit } = schema.parse(args);

    let lookup: SQLiteObjectLookup | null = null;
    
    try {
      lookup = new SQLiteObjectLookup();
      
      if (!lookup.initialize()) {
        return await createLoggedResponse(
          `SQLite object database not available. Run migration: node misc/migrate-to-sqlite.mjs`,
          requestId,
          "browse_package_objects"
        );
      }

      const startTime = Date.now();
      let results;
      
      if (objectType) {
        results = lookup.findObjectsByPackageAndType(packageName, objectType);
      } else {
        results = lookup.findObjectsByPackage(packageName);
      }
      
      const limitedResults = results.slice(0, limit);
      const duration = Date.now() - startTime;
      
      let content = `📦 Package Browser: "${packageName}"`;
      if (objectType) content += ` (${objectType} objects only)`;
      content += `\n⚡ Query time: ${duration}ms\n\n`;

      if (results.length === 0) {
        content += `❌ No objects found in package "${packageName}"`;
        if (objectType) content += ` of type "${objectType}"`;
        content += `\n\n💡 Suggestions:\n`;
        content += `   • Check package name spelling\n`;
        content += `   • Try pattern search: search_objects_pattern("*", "${packageName}")\n`;
        content += `   • Browse without type filter\n`;
      } else {
        content += `✅ Found ${results.length} objects`;
        if (limitedResults.length < results.length) {
          content += ` (showing first ${limitedResults.length})`;
        }
        content += `\n\n`;

        // Group by object type for better readability
        const grouped: { [key: string]: typeof limitedResults } = {};
        limitedResults.forEach(obj => {
          if (!grouped[obj.type]) {
            grouped[obj.type] = [];
          }
          grouped[obj.type].push(obj);
        });

        for (const [type, objects] of Object.entries(grouped)) {
          content += `🏷️  ${type} (${objects.length}):\n`;
          objects.forEach(obj => {
            content += `   • ${obj.name}`;
            if (obj.size) content += ` (${(obj.size / 1024).toFixed(1)}KB)`;
            content += `\n`;
          });
          content += `\n`;
        }

        if (limitedResults.length < results.length) {
          content += `... and ${results.length - limitedResults.length} more objects\n\n`;
          content += `💡 Use higher limit to see more: browse_package_objects("${packageName}", "${objectType || ''}", ${results.length})\n`;
        }
      }

      return await createLoggedResponse(content, requestId, "browse_package_objects");
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return await createLoggedResponse(
        `Error browsing package: ${errorMsg}`,
        requestId,
        "browse_package_objects"
      );
    } finally {
      if (lookup) {
        lookup.close();
      }
    }
  }

  static async searchObjectsPattern(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      pattern: z.string(),
      objectType: z.string().optional(),
      packageName: z.string().optional(),
      limit: z.number().optional().default(50),
    });
    const { pattern, objectType, packageName, limit } = schema.parse(args);

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
      let results = lookup.searchObjects(pattern);
      
      // Apply additional filters if specified
      if (objectType) {
        results = results.filter(obj => obj.type === objectType);
      }
      
      if (packageName) {
        results = results.filter(obj => obj.package === packageName);
      }
      
      const limitedResults = results.slice(0, limit);
      const duration = Date.now() - startTime;
      
      let content = `🔍 Pattern Search: "${pattern}"`;
      if (objectType) content += ` (${objectType} only)`;
      if (packageName) content += ` in ${packageName}`;
      content += `\n⚡ Query time: ${duration}ms\n\n`;

      if (results.length === 0) {
        content += `❌ No objects found matching pattern "${pattern}"`;
        if (objectType || packageName) {
          content += ` with the specified filters`;
        }
        content += `\n\n💡 Pattern Examples:\n`;
        content += `   • "Cust*" - objects starting with "Cust"\n`;
        content += `   • "*Table" - objects ending with "Table"\n`;
        content += `   • "*Invoice*" - objects containing "Invoice"\n`;
        content += `   • "Sales?" - "Sales" + one character\n`;
      } else {
        content += `✅ Found ${results.length} matches`;
        if (limitedResults.length < results.length) {
          content += ` (showing first ${limitedResults.length})`;
        }
        content += `\n\n`;

        limitedResults.forEach((obj, i) => {
          content += `${i + 1}. ${obj.name}\n`;
          content += `   📦 ${obj.package} → ${obj.type}\n`;
          content += `   📁 ${obj.path}\n`;
          if (obj.size) content += `   💾 ${(obj.size / 1024).toFixed(1)}KB\n`;
          content += `\n`;
        });

        if (limitedResults.length < results.length) {
          content += `... and ${results.length - limitedResults.length} more matches\n\n`;
          content += `💡 Use higher limit to see more: search_objects_pattern("${pattern}", "${objectType || ''}", "${packageName || ''}", ${results.length})\n`;
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
