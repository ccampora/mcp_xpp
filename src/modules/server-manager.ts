import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
import { TransportManager, TransportConfig } from "./transport-manager.js";

/**
 * Server manager for the MCP X++ Server
 */
export class ServerManager {
  private server: Server;
  private transportManager: TransportManager | null = null;
  private serverStartTime: Date | null = null;
  private transportConfig: TransportConfig;

  constructor(transportConfig: TransportConfig = { stdio: true }) {
    this.transportConfig = transportConfig;
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
    this.transportManager = new TransportManager(this.server, this.transportConfig);
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
          
          case "create_form":
            return await ToolHandlers.createForm(args, requestId);
          
          case "find_xpp_object":
            return await ToolHandlers.findXppObject(args, requestId);
          case "inspect_xpp_object":
            return await ToolHandlers.inspectXppObject(args, requestId);
          
          case "build_object_index":
            return await ToolHandlers.buildCache(args, requestId);
          
          case "get_current_config":
            return await ToolHandlers.getCurrentConfig(args, requestId);
          
          case "search_objects_pattern":
            return await ToolHandlers.searchObjectsPattern(args, requestId);
          
          case "discover_modification_capabilities":
            return await ToolHandlers.discoverModificationCapabilities(args, requestId);
          
          case "execute_object_modification":
            return await ToolHandlers.executeObjectModification(args, requestId);
          
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
    if (!this.transportManager) {
      throw new Error("Server not initialized. Call initialize() first.");
    }

    await this.transportManager.start();
    
    // Set server start time after successful connection
    this.serverStartTime = new Date();
    
    await DiskLogger.logDebug("MCP X++ Server started with configured transports");
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.transportManager) {
      await this.transportManager.stop();
    }
  }

  /**
   * Get transport status
   */
  getTransportStatus() {
    return this.transportManager?.getStatus() || null;
  }
}
