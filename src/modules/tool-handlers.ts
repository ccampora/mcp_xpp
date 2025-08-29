import { z } from "zod";
import { join } from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createLoggedResponse } from "./logger.js";
import { getXppCodebasePath, setXppCodebasePath, XPP_EXTENSIONS } from "./config.js";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { ObjectIndexManager } from "./object-index.js";
import { EnhancedSearchManager } from "./search.js";
import { parseXppClass, parseXppTable, findXppObject } from "./parsers.js";
import { safeReadFile, getDirectoryListing, searchInFiles } from "./file-utils.js";
import { ObjectCreators } from "./object-creators.js";
import { ObjectDescriptionManager } from "./object-creation/object-description-manager.js";
import { TemplateFirstEngine } from "./object-creation/template-first-engine.js";

// Template-First Architecture - Global instances
let descriptionManager: ObjectDescriptionManager | null = null;
let templateEngine: TemplateFirstEngine | null = null;

/**
 * Initialize Template-First Architecture components
 */
async function initializeTemplateFirst(): Promise<void> {
  if (!descriptionManager) {
    console.log('🏛️ Initializing Template-First Architecture...');
    descriptionManager = new ObjectDescriptionManager();
    templateEngine = new TemplateFirstEngine(descriptionManager);
    await templateEngine.initialize();
  }
}

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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    try {
      // Initialize Template-First Architecture
      await initializeTemplateFirst();
      
      console.log(`🏗️ Creating ${params.objectType} '${params.objectName}' using Template-First Architecture...`);
      
      // Use Template-First Engine for object creation
      const result = await templateEngine!.createObject(params);
      
      let content: string;
      
      if (result.success) {
        content = `✅ Successfully created ${result.objectType} '${result.objectName}'\n\n`;
        content += `📊 Performance: ${result.executionTime}ms using ${result.strategy} strategy\n`;
        content += `📁 Files generated: ${result.filesGenerated?.length || 0}\n\n`;
        
        if (result.filesGenerated && result.filesGenerated.length > 0) {
          content += `📄 Generated files:\n`;
          for (const file of result.filesGenerated) {
            content += `   • ${file}\n`;
          }
          content += `\n`;
        }
        
        if (result.metadata?.validation && result.metadata.validation.length > 0) {
          content += `⚠️ Validation warnings:\n`;
          for (const warning of result.metadata.validation) {
            content += `   • ${warning}\n`;
          }
          content += `\n`;
        }
        
        content += `🎯 Template-First Architecture: Zero external API dependencies\n`;
        content += `⚡ Performance target: <100ms (actual: ${result.executionTime}ms)\n`;
        
      } else {
        content = `❌ Failed to create ${result.objectType} '${result.objectName}'\n\n`;
        content += `Error: ${result.error}\n\n`;
        
        if (result.troubleshooting && result.troubleshooting.length > 0) {
          content += `🔧 Troubleshooting suggestions:\n`;
          for (const suggestion of result.troubleshooting) {
            content += `   • ${suggestion}\n`;
          }
          content += `\n`;
        }
        
        content += `📊 Execution time: ${result.executionTime}ms\n`;
        content += `🎯 Strategy attempted: ${result.strategy}\n`;
      }
      
      return await createLoggedResponse(content, requestId, "create_xpp_object");
      
    } catch (error) {
      // Fallback to legacy ObjectCreators for backward compatibility
      console.log(`🔄 Template-First failed, falling back to legacy ObjectCreators...`);
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Template-First error: ${errorMsg}`);
      
      // Legacy route based on objectType
      let content: string;
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
          throw new Error(`Unsupported object type: ${params.objectType}. Template-First Architecture supports 553+ object types, but this type may not have a description file yet.`);
      }
      
      // Add legacy notice to response
      content += `\n\n⚠️ Created using legacy ObjectCreators (Template-First Architecture failed)\n`;
      content += `🔧 Consider updating object description files for better performance\n`;
      
      return await createLoggedResponse(content, requestId, "create_xpp_object");
    }
  }

  static async browseDirectory(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      path: z.string().optional().default(""),
      showHidden: z.boolean().optional().default(false),
    });
    const { path, showHidden } = schema.parse(args);
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const fullPath = path ? join(getXppCodebasePath(), path) : getXppCodebasePath();
    const entries = await getDirectoryListing(fullPath, showHidden);
    
    let content = `Directory: ${path || "/"}\n`;
    content += `Total items: ${entries.length}\n\n`;
    
    for (const entry of entries) {
      const icon = entry.type === 'directory' ? '📁' : '📄';
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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const fullPath = join(getXppCodebasePath(), path);
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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const searchPath = path ? join(getXppCodebasePath(), path) : getXppCodebasePath();
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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const results = await findXppObject(objectName, objectType);
    
    let content = `Search results for X++ object "${objectName}"`;
    if (objectType) content += ` of type "${objectType}"`;
    content += `:\n\n`;
    
    if (results.length === 0) {
      content += "❌ No objects found. The object does not exist in the codebase.\n";
    } else {
      content += `✅ Found ${results.length} object(s):\n\n`;
      for (const result of results) {
        content += `📦 ${result.name}\n`;
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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    // Find the class file first
    const classObjects = await findXppObject(className, "CLASSES");
    
    if (classObjects.length === 0) {
      throw new Error(`Class "${className}" not found in the codebase.`);
    }
    
    const classPath = join(getXppCodebasePath(), classObjects[0].path);
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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    // Find the table file first
    const tableObjects = await findXppObject(tableName, "TABLES");
    
    if (tableObjects.length === 0) {
      throw new Error(`Table "${tableName}" not found in the codebase.`);
    }
    
    const tablePath = join(getXppCodebasePath(), tableObjects[0].path);
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
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    let content = "";
    
    if (objectType) {
      const results = await ObjectIndexManager.buildIndexByType(getXppCodebasePath(), objectType, forceRebuild);
      content = `Index build complete for ${objectType}:\n`;
      content += `- Indexed: ${results.indexedCount} objects\n`;
      content += `- Skipped: ${results.skippedCount} objects\n`;
    } else {
      await ObjectIndexManager.buildFullIndex(getXppCodebasePath(), forceRebuild);
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
      objectType: z.string(),
      sortBy: z.enum(["name", "package", "size"]).optional().default("name"),
      limit: z.number().optional(),
    });
    const { objectType, sortBy, limit } = schema.parse(args);
    
    if (!getXppCodebasePath()) {
      throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
    }
    
    const objects = ObjectIndexManager.listObjectsByType(objectType, sortBy, limit);
    
    // Get total count (before applying limit)
    const totalCount = ObjectIndexManager.getObjectCountByType(objectType);
    
    const response = {
      objectType,
      totalCount,
      objects: objects.map(obj => ({
        name: obj.name,
        package: obj.package,
        path: obj.path,
        size: obj.size
      }))
    };
    
    const content = JSON.stringify(response, null, 2);
    
    return await createLoggedResponse(content, requestId, "list_objects_by_type");
  }

  static async smartSearch(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      searchTerm: z.string(),
      searchPath: z.string().optional().default(""),
      extensions: z.array(z.string()).optional().default([]),
      maxResults: z.number().optional().default(50),
    });
    const { searchTerm, searchPath, extensions, maxResults } = schema.parse(args);
    
    if (!getXppCodebasePath()) {
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
        content += `🎯 OBJECT: ${result.name} (${result.objectType})\n`;
        content += `   Package: ${result.package}\n`;
        content += `   Path: ${result.path}\n\n`;
      } else {
        content += `📄 FILE: ${result.path}\n`;
        content += `   Line ${result.line}: ${result.content}\n\n`;
      }
    }
    
    return await createLoggedResponse(content, requestId, "smart_search");
  }

  static async getCurrentConfig(args: any, requestId: string): Promise<any> {
    try {
      const config = await AppConfig.getApplicationConfiguration();
      const response = {
        _meta: {
          type: "configuration",
          timestamp: new Date().toISOString(),
          version: "1.0.0"
        },
        ...config
      };
      
      return await createLoggedResponse(JSON.stringify(response, null, 2), requestId, "get_current_config");
    } catch (error) {
      const errorMsg = `Error retrieving configuration: ${error instanceof Error ? error.message : 'Unknown error'}`;
      return await createLoggedResponse(errorMsg, requestId, "get_current_config");
    }
  }
}
