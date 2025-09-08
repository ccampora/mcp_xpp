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
                description: "Optional filter by object type. Common values: AxTable, AxClass, AxForm, AxEnum, AxQuery, AxView, AxEdt, AxMenu, AxReport, AxWorkflow, AxService, AxMap, AxInterface, AxMacro, etc. Leave empty to search all types.",
              },
              model: {
                type: "string",
                description: "Optional filter by D365 model/package name (e.g., ApplicationSuite, CaseManagement, ApplicationPlatform). Leave empty to search all models.",
              },
            },
            required: ["objectName"],
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
          name: "get_current_config",
          description: "Get comprehensive server configuration including paths, index statistics, VS2022 service status, and models grouped by custom vs standard",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "search_objects_pattern",
          description: "Search D365 objects by name pattern using wildcards, or browse all objects in a specific model. Supports * (any characters) and ? (single character) patterns for flexible object discovery. Can also be used to browse entire models by using '*' as pattern with a model filter. Supports both human-readable text and structured JSON output for AOT tree building.",
          inputSchema: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Search pattern with wildcards (e.g., 'Cust*', '*Table', '*Invoice*', '?'). Use '*' to return all objects (useful when browsing a specific model). Use ? for single character matching.",
              },
              objectType: {
                type: "string",
                description: "Optional filter by object type (e.g., 'AxClass', 'AxTable', 'AxForm', 'AxEnum'). Leave empty to search all object types.",
              },
              model: {
                type: "string",
                description: "Optional filter by D365 model/package name (e.g., 'ApplicationSuite', 'ApplicationFoundation', 'CaseManagement'). Leave empty to search all models. Use with pattern '*' to browse all objects in a specific model.",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return. Default is 50. Use higher values (e.g., 500) when browsing entire models.",
                default: 50,
              },
              format: {
                type: "string",
                enum: ["text", "json"],
                description: "Output format: 'text' for human-readable results (default), 'json' for structured data suitable for AOT tree building and programmatic use.",
                default: "text",
              },
            },
            required: ["pattern"],
            examples: [
              {
                pattern: "Cust*",
                description: "Find all objects starting with 'Cust'"
              },
              {
                pattern: "*Table",
                objectType: "AxTable", 
                description: "Find all tables ending with 'Table'"
              },
              {
                pattern: "*",
                model: "ApplicationSuite",
                limit: 200,
                description: "Browse all objects in ApplicationSuite model (first 200)"
              },
              {
                pattern: "*",
                model: "CaseManagement",
                objectType: "AxClass",
                description: "Browse all classes in CaseManagement model"
              },
              {
                pattern: "*",
                objectType: "AxTable",
                format: "json",
                limit: 1000,
                description: "Get all tables in structured JSON format for AOT tree building"
              },
              {
                pattern: "*",
                model: "ApplicationSuite",
                format: "json",
                description: "Get all objects in ApplicationSuite as structured JSON grouped by model and type"
              }
            ]
          },
        },
      ],
    };
  }
}
