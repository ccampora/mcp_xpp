import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ToolDefinitions } from "./tool-definitions.js";
import { ToolHandlers } from "./tool-handlers.js";
import { DiskLogger } from "./logger.js";

/**
 * Server manager for the MCP X++ Server
 */
export class ServerManager {
  private server: Server;
  private serverStartTime: Date | null = null;

  constructor() {
    this.server = new Server({
      name: "mcp-xpp-server",
      version: "1.0.0",
    }, {
      capabilities: {
        tools: {},
      },
    });
  }

  /**
   * Get the server start time
   */
  getServerStartTime(): Date | null {
    return this.serverStartTime;
  }

  /**
   * Initialize the server with request handlers
   */
  async initialize(): Promise<void> {
    await this.setupRequestHandlers();
  }

  /**
   * Setup all request handlers
   */
  private async setupRequestHandlers(): Promise<void> {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      await DiskLogger.logRequest(request);
      
      const toolsResponse = await ToolDefinitions.getToolDefinitions();
      
      await DiskLogger.logResponse(toolsResponse, (request as any).id);
      return toolsResponse;
    });

    // Handle call tool request
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await DiskLogger.logRequest(request);
      
      const { name, arguments: args } = request.params;
      
      try {
        const requestId = (request as any).id;
        
        switch (name) {
          case "create_xpp_object":
            return await ToolHandlers.createXppObject(args, requestId);
          
          case "set_xpp_codebase_path":
            return await ToolHandlers.setXppCodebasePath(args, requestId);
          
          case "browse_directory":
            return await ToolHandlers.browseDirectory(args, requestId);
          
          case "read_file":
            return await ToolHandlers.readFile(args, requestId);
          
          case "search_files":
            return await ToolHandlers.searchFiles(args, requestId);
          
          case "find_xpp_object":
            return await ToolHandlers.findXppObject(args, requestId);
          
          case "get_class_methods":
            return await ToolHandlers.getClassMethods(args, requestId);
          
          case "get_table_structure":
            return await ToolHandlers.getTableStructure(args, requestId);
          
          case "discover_object_types_json":
            return await ToolHandlers.discoverObjectTypesJson(args, requestId);
          
          case "build_object_index":
            return await ToolHandlers.buildObjectIndex(args, requestId);
          
          case "list_objects_by_type":
            return await ToolHandlers.listObjectsByType(args, requestId);
          
          case "smart_search":
            return await ToolHandlers.smartSearch(args, requestId);
          
          case "get_current_config":
            return await ToolHandlers.getCurrentConfig(args, requestId);
          
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
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Set server start time after successful connection
    this.serverStartTime = new Date();
    
    await DiskLogger.logDebug("🚀 MCP X++ Server started and listening on stdio");
  }
}
