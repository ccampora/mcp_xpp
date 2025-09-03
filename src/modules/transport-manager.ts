import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";
import cors from "cors";
import { DiskLogger } from "./logger.js";
import { ToolDefinitions } from "./tool-definitions.js";
import { ToolHandlers } from "./tool-handlers.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export interface TransportConfig {
  stdio?: boolean;
  http?: {
    enabled: boolean;
    port: number;
    host?: string;
  };
}

/**
 * Transport manager that handles both STDIO and HTTP transports for MCP server
 */
export class TransportManager {
  private server: Server;
  private config: TransportConfig;
  private httpServer: any = null;
  private expressApp: express.Application | null = null;

  constructor(server: Server, config: TransportConfig) {
    this.server = server;
    this.config = config;
  }

  /**
   * Start the configured transports
   */
  async start(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Start STDIO transport if enabled (default)
    if (this.config.stdio !== false) {
      promises.push(this.startStdioTransport());
    }

    // Start HTTP transport if enabled
    if (this.config.http?.enabled) {
      promises.push(this.startHttpTransport());
    }

    // If no transports are enabled, default to STDIO
    if (promises.length === 0) {
      promises.push(this.startStdioTransport());
    }

    await Promise.all(promises);
  }

  /**
   * Start STDIO transport (for local VS Code integration)
   */
  private async startStdioTransport(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      await DiskLogger.logDebug("MCP X++ Server started with STDIO transport");
    } catch (error) {
      await DiskLogger.logError(error, "STDIO transport startup");
      throw new Error(`Failed to start STDIO transport: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start HTTP transport (for external services like Copilot Studio)
   */
  private async startHttpTransport(): Promise<void> {
    if (!this.config.http) {
      throw new Error("HTTP configuration is required for HTTP transport");
    }

    try {
      this.expressApp = express();
      
      // Middleware
      this.expressApp.use(cors());
      this.expressApp.use(express.json({ limit: '10mb' }));

      // Health check endpoint
      this.expressApp.get('/health', (req: Request, res: Response) => {
        res.json({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          transport: 'http'
        });
      });

      // MCP endpoints
      this.setupMcpEndpoints();

      const { port, host = '0.0.0.0' } = this.config.http;
      
      this.httpServer = this.expressApp.listen(port, host, () => {
        DiskLogger.logDebug(`🌐 MCP X++ Server HTTP transport listening on ${host}:${port}`);
      });

      await DiskLogger.logDebug(`MCP X++ Server started with HTTP transport on ${host}:${port}`);
    } catch (error) {
      await DiskLogger.logError(error, "HTTP transport startup");
      throw new Error(`Failed to start HTTP transport: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Setup MCP-compatible HTTP endpoints
   */
  private setupMcpEndpoints(): void {
    if (!this.expressApp) return;

    // Tools list endpoint
    this.expressApp.get('/mcp/tools', async (req: Request, res: Response) => {
      try {
        await DiskLogger.logDebug("HTTP request: GET /mcp/tools");
        const toolsResponse = await ToolDefinitions.getToolDefinitions();
        res.json(toolsResponse);
      } catch (error) {
        await DiskLogger.logError(error, "HTTP tools list");
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    });

    // Tool execution endpoint
    this.expressApp.post('/mcp/tools/:toolName', async (req: Request, res: Response) => {
      try {
        const { toolName } = req.params;
        const { arguments: args = {} } = req.body;
        const requestId = `http-${Date.now()}`;

        await DiskLogger.logDebug(`HTTP request: POST /mcp/tools/${toolName}`);

        const result = await this.executeToolCall(toolName, args, requestId);
        res.json(result);
      } catch (error) {
        await DiskLogger.logError(error, `HTTP tool call: ${req.params.toolName}`);
        
        if (error instanceof McpError) {
          res.status(400).json({ 
            error: error.message,
            code: error.code
          });
        } else {
          res.status(500).json({ 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }
    });

    // Generic MCP JSON-RPC endpoint
    this.expressApp.post('/mcp/rpc', async (req: Request, res: Response) => {
      try {
        const { method, params, id = `http-${Date.now()}` } = req.body;
        
        await DiskLogger.logDebug(`HTTP RPC request: ${method}`);

        if (method === "tools/list") {
          const result = await ToolDefinitions.getToolDefinitions();
          res.json({ ...result, id });
        } else if (method === "tools/call") {
          const { name, arguments: args } = params;
          const result = await this.executeToolCall(name, args, id);
          res.json({ ...result, id });
        } else {
          res.status(404).json({ 
            error: `Method not found: ${method}`,
            id 
          });
        }
      } catch (error) {
        await DiskLogger.logError(error, `HTTP RPC call: ${req.body.method}`);
        
        if (error instanceof McpError) {
          res.status(400).json({ 
            error: error.message,
            code: error.code,
            id: req.body.id || null
          });
        } else {
          res.status(500).json({ 
            error: error instanceof Error ? error.message : "Unknown error",
            id: req.body.id || null
          });
        }
      }
    });
  }

  /**
   * Execute a tool call using the same logic as the MCP server
   */
  private async executeToolCall(name: string, args: any, requestId: string): Promise<any> {
    try {
      switch (name) {
        case "create_xpp_object":
          return await ToolHandlers.createXppObject(args, requestId);
        
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
  }

  /**
   * Stop all transports
   */
  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.httpServer) {
      promises.push(new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          resolve();
        });
      }));
    }

    await Promise.all(promises);
    await DiskLogger.logDebug("🛑 MCP X++ Server transports stopped");
  }

  /**
   * Get transport status information
   */
  getStatus(): { stdio: boolean; http: boolean; httpPort?: number } {
    return {
      stdio: this.config.stdio !== false,
      http: this.config.http?.enabled || false,
      httpPort: this.config.http?.port
    };
  }
}
