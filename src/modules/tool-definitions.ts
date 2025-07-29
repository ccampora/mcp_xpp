import { AOTStructureManager } from "./aot-structure.js";

/**
 * Tool definitions for the MCP X++ Server
 */
export class ToolDefinitions {
  /**
   * Get all tool definitions with dynamic configuration
   */
  static async getToolDefinitions() {
    // Get available layers and object types dynamically from configuration
    const availableLayers = await AOTStructureManager.getAvailableLayers();
    const availableObjectTypes = await AOTStructureManager.getAvailableObjectTypes();
    
    return {
      tools: [
        {
          name: "create_xpp_object",
          description: "Create D365 F&O objects (models, classes, tables, enums, forms, etc.) with unified interface",
          inputSchema: {
            type: "object",
            properties: {
              objectName: {
                type: "string",
                description: "Name of the object to create",
              },
              objectType: {
                type: "string",
                enum: availableObjectTypes,
                description: "Type of X++ object to create"
              },
              layer: {
                type: "string",
                enum: availableLayers,
                description: "Application layer for the object"
              },
              outputPath: {
                type: "string",
                description: "Output path for the object structure (relative to X++ codebase root)",
                default: "Models",
              },
              publisher: {
                type: "string",
                description: "Publisher name for the object",
                default: "YourCompany",
              },
              version: {
                type: "string",
                description: "Version number for the object (e.g., '1.0.0.0')",
                default: "1.0.0.0",
              },
              dependencies: {
                type: "array",
                items: { type: "string" },
                description: "List of object dependencies",
                default: ["ApplicationPlatform", "ApplicationFoundation"],
              }
            },
            required: ["objectName", "objectType"],
          },
        },
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
  }
}
