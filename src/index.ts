#!/usr/bin/env node

// =============================================================================
// IMPORTS
// =============================================================================
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import { join, extname} from "path";
import { z } from "zod";

// Import modules
import { DiskLogger, createLoggedResponse } from "./modules/logger.js";
import { setXppCodebasePath, getXppCodebasePath, XPP_EXTENSIONS } from "./modules/config.js";
import { AppConfig } from "./modules/app-config.js";
import { AOTStructureManager } from "./modules/aot-structure.js";
import { ObjectIndexManager } from "./modules/object-index.js";
import { EnhancedSearchManager } from "./modules/search.js";
import { parseXppClass, parseXppTable, findXppObject, getXppObjectType } from "./modules/parsers.js";
import { safeReadFile, getDirectoryListing, searchInFiles } from "./modules/file-utils.js";
import { isXppRelatedFile } from "./modules/utils.js";

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================

// Global server start time - set when server actually starts
let serverStartTime: Date | null = null;

/**
 * Get the server start time
 */
export function getServerStartTime(): Date | null {
  return serverStartTime;
}

// Create server instance
const server = new Server({
  name: "mcp-xpp-server",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  await DiskLogger.logRequest(request);
  
  const toolsResponse = {
    tools: [
      {
        name: "browse_directory",
        description: "Browse a directory in the X++ codebase and list its contents",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Relative path from X++ codebase root (leave empty for root)",
            },
            showHidden: {
              type: "boolean",
              description: "Whether to show hidden files and directories",
              default: false,
            },
          },
        },
      },
      {
        name: "read_file",
        description: "Read the contents of a file in the X++ codebase",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Relative path to the file from X++ codebase root",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "search_files",
        description: "Search for text within X++ codebase files",
        inputSchema: {
          type: "object",
          properties: {
            searchTerm: {
              type: "string",
              description: "Text to search for (case insensitive)",
            },
            path: {
              type: "string",
              description: "Relative path to search within (leave empty to search entire codebase)",
            },
            extensions: {
              type: "array",
              items: { type: "string" },
              description: "File extensions to include in search (e.g., ['.xpp', '.xml'])",
            },
          },
          required: ["searchTerm"],
        },
      },
      {
        name: "get_file_info",
        description: "Get detailed information about a file or directory",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Relative path to the file or directory from X++ codebase root",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "find_xpp_object",
        description: "Find and analyze X++ objects (classes, tables, forms, etc.) by name. Can also be used to validate if an object exists in the codebase.",
        inputSchema: {
          type: "object",
          properties: {
            objectName: {
              type: "string",
              description: "Name of the X++ object to find",
            },
            objectType: {
              type: "string",
              description: "Type of object to search for (CLASSES, TABLES, FORMS, etc.)",
              enum: ["CLASSES", "TABLES", "FORMS", "REPORTS", "ENUMS", "EDTS", "VIEWS", "MAPS", "SERVICES", "WORKFLOWS", "QUERIES", "MENUS", "MENUITEM"],
            },
          },
          required: ["objectName"],
        },
      },
      {
        name: "get_class_methods",
        description: "Get detailed method signatures and information for a specific X++ class",
        inputSchema: {
          type: "object",
          properties: {
            className: {
              type: "string",
              description: "Name of the X++ class to analyze",
            },
          },
          required: ["className"],
        },
      },
      {
        name: "get_table_structure",
        description: "Get detailed table structure including fields, indexes, and relations",
        inputSchema: {
          type: "object",
          properties: {
            tableName: {
              type: "string",
              description: "Name of the X++ table to analyze",
            },
          },
          required: ["tableName"],
        },
      },
      {
        name: "discover_object_types_json",
        description: "Return the raw JSON structure from aot-structure.json file",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "build_object_index",
        description: "Build or update the object index for faster searches",
        inputSchema: {
          type: "object",
          properties: {
            objectType: {
              type: "string",
              description: "Specific object type to index (optional, if not provided will index all)",
            },
            forceRebuild: {
              type: "boolean",
              description: "Force a complete rebuild of the index",
              default: false,
            },
          },
        },
      },
      {
        name: "list_objects_by_type",
        description: "List all objects of a specific type from the index",
        inputSchema: {
          type: "object",
          properties: {
            objectType: {
              type: "string",
              description: "Type of objects to list",
            },
            sortBy: {
              type: "string",
              description: "Sort criteria",
              enum: ["name", "package", "size"],
              default: "name",
            },
            limit: {
              type: "number",
              description: "Maximum number of objects to return",
            },
          },
          required: ["objectType"],
        },
      },
      {
        name: "smart_search",
        description: "Perform an intelligent search across the X++ codebase using multiple strategies",
        inputSchema: {
          type: "object",
          properties: {
            searchTerm: {
              type: "string",
              description: "Term to search for",
            },
            searchPath: {
              type: "string",
              description: "Relative path to search within (optional)",
            },
            extensions: {
              type: "array",
              items: { type: "string" },
              description: "File extensions to include (optional)",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results",
              default: 50,
            },
          },
          required: ["searchTerm"],
        },
      },
      {
        name: "get_current_config",
        description: "Get comprehensive server configuration including paths, index statistics, and system information",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };

  await DiskLogger.logResponse(toolsResponse, (request as any).id);
  return toolsResponse;
});

// =============================================================================
// TOOL HANDLERS
// =============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  await DiskLogger.logRequest(request);
  
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "set_xpp_codebase_path": {
        const schema = z.object({
          path: z.string(),
        });
        const { path } = schema.parse(args);
        
        // Validate path exists
        try {
          const stats = await fs.stat(path);
          if (!stats.isDirectory()) {
            throw new Error("Path is not a directory");
          }
        } catch (error) {
          throw new Error(`Invalid path: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        setXppCodebasePath(path);
        ObjectIndexManager.setIndexPath(path);
        await ObjectIndexManager.loadIndex();
        
        const content = `X++ codebase path set to: ${path}

Index will be maintained at: ${join(path, '.mcp-index.json')}

Use build_object_index to create an index for faster searching.`;
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "browse_directory": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "read_file": {
        const schema = z.object({
          path: z.string(),
        });
        const { path } = schema.parse(args);
        
        if (!getXppCodebasePath()) {
          throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
        }
        
        const fullPath = join(getXppCodebasePath(), path);
        const content = await safeReadFile(fullPath);
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "search_files": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "get_file_info": {
        const schema = z.object({
          path: z.string(),
        });
        const { path } = schema.parse(args);
        
        if (!getXppCodebasePath()) {
          throw new Error("X++ codebase path not configured. Use --xpp-path argument when starting the server.");
        }
        
        const fullPath = join(getXppCodebasePath(), path);
        
        try {
          const stats = await fs.stat(fullPath);
          const isDirectory = stats.isDirectory();
          
          let content = `File Information: ${path}\n\n`;
          content += `Type: ${isDirectory ? 'Directory' : 'File'}\n`;
          content += `Size: ${stats.size} bytes\n`;
          content += `Created: ${stats.birthtime.toISOString()}\n`;
          content += `Modified: ${stats.mtime.toISOString()}\n`;
          content += `Accessed: ${stats.atime.toISOString()}\n`;
          
          if (!isDirectory) {
            content += `Extension: ${extname(path)}\n`;
            content += `X++ Related: ${isXppRelatedFile(path) ? 'Yes' : 'No'}\n`;
            
            if (isXppRelatedFile(path)) {
              content += `Detected Object Type: ${getXppObjectType(fullPath)}\n`;
            }
          }
          
          return await createLoggedResponse(content, (request as any).id, name);
        } catch (error) {
          throw new Error(`Could not get file info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      case "find_xpp_object": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "get_class_methods": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "get_table_structure": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "discover_object_types_json": {
        await AOTStructureManager.loadStructure();
        const structure = AOTStructureManager.getRawStructure();
        
        if (!structure) {
          throw new Error("Could not load AOT structure");
        }
        
        const content = JSON.stringify(structure, null, 2);
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "build_object_index": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "list_objects_by_type": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "smart_search": {
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
        
        return await createLoggedResponse(content, (request as any).id, name);
      }

      case "get_current_config": {
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
          
          return await createLoggedResponse(JSON.stringify(response, null, 2), (request as any).id, name);
        } catch (error) {
          const errorMsg = `Error retrieving configuration: ${error instanceof Error ? error.message : 'Unknown error'}`;
          return await createLoggedResponse(errorMsg, (request as any).id, name);
        }
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    await DiskLogger.logError(error, name);
    
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    throw error instanceof McpError ? error : new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : "An unexpected error occurred"
    );
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function runServer() {
  try {
    // Initialize configuration system
    await AppConfig.initialize();
    
    // Set XPP codebase path for backward compatibility with existing code
    const xppPath = AppConfig.getXppPath();
    if (xppPath) {
      setXppCodebasePath(xppPath);
      console.error(`XPP codebase path configured: ${xppPath}`);
      
      const metadataFolder = AppConfig.getXppMetadataFolder();
      if (metadataFolder) {
        console.error(`XPP metadata folder configured: ${metadataFolder}`);
      }
    }

    // Initialize ObjectIndexManager if path is available
    if (getXppCodebasePath()) {
      ObjectIndexManager.setIndexPath(getXppCodebasePath());
    }

    await DiskLogger.logStartup();
    
    // Load index if XPP path is set
    if (getXppCodebasePath()) {
      try {
        await ObjectIndexManager.loadIndex();
        await DiskLogger.logDebug(`Loaded object index for: ${getXppCodebasePath()}`);
      } catch (error) {
        await DiskLogger.logDebug(`Could not load existing index: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Set server start time after successful connection
    serverStartTime = new Date();
    
    await DiskLogger.logDebug("🚀 MCP X++ Server started and listening on stdio");
  } catch (error) {
    await DiskLogger.logError(error, "startup");
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Only start the server if this module is being run directly (not imported)
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  runServer();
}
