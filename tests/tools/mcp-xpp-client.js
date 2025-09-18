/**
 * ============================================================================
 * MCP X++ CLIENT - Professional MCP Server Integration
 * ============================================================================
 * 
 * USAGE EXAMPLES:
 * 
 * 1. BASIC SETUP:
 * ```javascript
 * import { MCPXppClient } from './tests/tools/mcp-xpp-client.js';
 * 
 * const client = new MCPXppClient();
 * // Client auto-connects, no need to call connect()
 * 
 * try {
 *   // Your tool calls here
 * } finally {
 *   // No close() method needed for this client
 * }
 * ```
 * 
 * 2. AVAILABLE TOOLS:
 * - get_current_config: Get server configuration
 * - search_objects_pattern: Search D365 objects by pattern
 * - build_object_index: Build search index
 * - create_xpp_object: Create D365 objects (classes, tables, enums, etc)
 * - create_form: Create D365 forms with patterns
 * - find_xpp_object: Find specific objects by name
 * - inspect_xpp_object: Analyze objects and extract source code
 * - discover_modification_capabilities: Get modification methods
 * - execute_object_modification: Modify objects (NEW: supports arrays!)
 * 
 * 3. SINGLE OBJECT MODIFICATION:
 * ```javascript
 * const result = await client.executeTool('execute_object_modification', {
 *   objectType: 'AxTable',
 *   objectName: 'CustTable',
 *   methodName: 'AddField',
 *   parameters: {
 *     concreteType: 'AxTableFieldString',
 *     Name: 'MyField',
 *     Label: 'My Custom Field',
 *     SaveContents: 'Yes',
 *     Mandatory: 'No',
 *     AllowEditOnCreate: 'Yes',
 *     AllowEdit: 'Yes',
 *     Visible: 'Yes',
 *     AosAuthorization: 'None',
 *     MinReadAccess: 'Auto',
 *     IgnoreEDTRelation: 'No',
 *     Null: 'Yes',
 *     IsSystemGenerated: 'No',
 *     IsManuallyUpdated: 'No',
 *     IsObsolete: 'No',
 *     GeneralDataProtectionRegulation: 'None',
 *     SysSharingType: 'Duplicate'
 *   }
 * });
 * ```
 * 
 * 4. ARRAY/BATCH MODIFICATIONS (NEW FEATURE):
 * ```javascript
 * const result = await client.executeTool('execute_object_modification', {
 *   objectType: 'AxTable',
 *   objectName: 'CustTable',
 *   modifications: [
 *     {
 *       methodName: 'AddField',
 *       parameters: {
 *         concreteType: 'AxTableFieldString',
 *         Name: 'Field1',
 *         Label: 'First Field',
 *         SaveContents: 'Yes',
 *         Mandatory: 'No',
 *         AllowEditOnCreate: 'Yes',
 *         AllowEdit: 'Yes',
 *         Visible: 'Yes',
 *         AosAuthorization: 'None',
 *         MinReadAccess: 'Auto',
 *         IgnoreEDTRelation: 'No',
 *         Null: 'Yes',
 *         IsSystemGenerated: 'No',
 *         IsManuallyUpdated: 'No',
 *         IsObsolete: 'No',
 *         GeneralDataProtectionRegulation: 'None',
 *         SysSharingType: 'Duplicate'
 *       }
 *     },
 *     {
 *       methodName: 'AddField', 
 *       parameters: {
 *         concreteType: 'AxTableFieldInt',
 *         Name: 'Field2',
 *         Label: 'Second Field',
 *         SaveContents: 'Yes',
 *         Mandatory: 'No',
 *         AllowEditOnCreate: 'Yes',
 *         AllowEdit: 'Yes',
 *         Visible: 'Yes',
 *         AosAuthorization: 'None',
 *         MinReadAccess: 'Auto',
 *         IgnoreEDTRelation: 'No',
 *         Null: 'Yes',
 *         IsSystemGenerated: 'No',
 *         IsManuallyUpdated: 'No',
 *         IsObsolete: 'No',
 *         GeneralDataProtectionRegulation: 'None',
 *         SysSharingType: 'Duplicate'
 *       }
 *     }
 *   ]
 * });
 * ```
 * 
 * 5. RESPONSE FORMAT:
 * - Single modification: Returns success/failure with details
 * - Array modifications: Returns per-operation results with summary:
 *   ```json
 *   {
 *     "objectType": "AxTable",
 *     "objectName": "CustTable",
 *     "totalOperations": 3,
 *     "successCount": 2,
 *     "failureCount": 1,
 *     "operations": [
 *       {"methodName": "AddField", "success": true, "result": "..."},
 *       {"methodName": "AddField", "success": true, "result": "..."},
 *       {"methodName": "AddIndex", "success": false, "error": "..."}
 *     ]
 *   }
 *   ```
 * 
 * 6. ERROR HANDLING:
 * ```javascript
 * try {
 *   const result = await client.executeTool('execute_object_modification', {...});
 *   console.log('Success:', result?.content?.[0]?.text);
 * } catch (error) {
 *   console.error('Error:', error.message);
 * }
 * ```
 * 
 * 7. COMMON PATTERNS:
 * - Use client.executeTool() method (not callTool)
 * - Always check result?.content?.[0]?.text for response text
 * - No close() method needed - client handles cleanup automatically
 * - Check for JSON data in response text for detailed results
 * - Retry individual failed operations from array results
 * - Use discover_modification_capabilities to get correct parameters
 * 
 * ============================================================================
 */

// =============================================================================
// MCP X++ CLIENT - Professional MCP Server Integration
// =============================================================================
// Purpose: Unified client for testing MCP X++ server functionality
// Architecture: Supports both direct ToolHandlers and STDIO/HTTP transports
// Focus: Production-ready client for comprehensive server testing

import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CLIENT_CONFIG = {
  transport: {
    direct: true,        // Use direct ToolHandlers import
    stdio: false,        // Use STDIO transport
    http: false          // Use HTTP transport
  },
  http: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000
  },
  validation: {
    enableStrictValidation: true,
    validateToolResponses: true,
    validateMCPFormat: true
  },
  tools: {
    // Available MCP tools (8 optimized tools)
    availableTools: [
      'get_current_config',
      'search_objects_pattern', 
      'build_object_index',
      'create_xpp_object',
      'create_form',
      'find_xpp_object',
      'inspect_xpp_object',
      'discover_modification_capabilities',
      'execute_object_modification'
    ],
    defaultTimeout: 30000
  }
};

// =============================================================================
// MCP X++ CLIENT CLASS
// =============================================================================

export class MCPXppClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...CLIENT_CONFIG, ...options };
    this.isInitialized = false;
    this.toolHandlers = null;
  }

  /**
   * Initialize the client and load dependencies
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load ToolHandlers for direct communication
      if (this.config.transport.direct) {
        const { ToolHandlers } = await import('../../build/modules/tool-handlers.js');
        this.toolHandlers = ToolHandlers;
        this.emit('initialized', { transport: 'direct' });
      }

      this.isInitialized = true;
    } catch (error) {
      this.emit('error', { phase: 'initialization', error });
      throw new Error(`Failed to initialize MCP client: ${error.message}`);
    }
  }

  /**
   * Execute MCP tool with validation
   */
  async executeTool(toolName, args = {}, requestId = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Generate request ID if not provided
    const id = requestId || this._generateRequestId();

    // Validate tool availability
    if (!this.config.tools.availableTools.includes(toolName)) {
      throw new Error(`Unknown tool: ${toolName}. Available: ${this.config.tools.availableTools.join(', ')}`);
    }

    try {
      let result;
      const startTime = Date.now();

      // Execute based on transport type
      if (this.config.transport.direct && this.toolHandlers) {
        result = await this._executeDirectTool(toolName, args, id);
      } else if (this.config.transport.http) {
        result = await this._executeHttpTool(toolName, args, id);
      } else {
        throw new Error('No valid transport configured');
      }

      const duration = Date.now() - startTime;

      // Validate response if enabled
      if (this.config.validation.validateToolResponses) {
        this._validateToolResponse(toolName, result);
      }

      this.emit('tool_executed', { toolName, args, duration, success: true });
      return result;

    } catch (error) {
      this.emit('tool_error', { toolName, args, error: error.message });
      throw error;
    }
  }

  /**
   * Execute tool using direct ToolHandlers
   */
  async _executeDirectTool(toolName, args, requestId) {
    if (!this.toolHandlers) {
      throw new Error('ToolHandlers not initialized');
    }

    const methodMap = {
      'get_current_config': 'getCurrentConfig',
      'search_objects_pattern': 'searchObjectsPattern',
      'build_object_index': 'buildCache',
      'create_xpp_object': 'createXppObject',
      'create_form': 'createForm',
      'find_xpp_object': 'findXppObject',
      'inspect_xpp_object': 'inspectXppObject',
      'discover_modification_capabilities': 'discoverModificationCapabilities',
      'execute_object_modification': 'executeObjectModification'
    };

    const methodName = methodMap[toolName];
    if (!methodName || !this.toolHandlers[methodName]) {
      throw new Error(`Tool method not found: ${toolName} -> ${methodName}`);
    }

    // Format arguments based on tool requirements
    const formattedArgs = this._formatToolArguments(toolName, args);

    // Execute the tool
    return await this.toolHandlers[methodName](formattedArgs, requestId);
  }

  /**
   * Execute tool using HTTP transport
   */
  async _executeHttpTool(toolName, args, requestId) {
    const url = `${this.config.http.baseUrl}/mcp/tools/${toolName}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        arguments: args,
        requestId: requestId
      }),
      signal: AbortSignal.timeout(this.config.http.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Format tool arguments based on specific tool requirements
   */
  _formatToolArguments(toolName, args) {
    switch (toolName) {
      case 'get_current_config':
        return args; // No special formatting needed
      
      case 'search_objects_pattern':
        return args; // Direct pass-through
      
      case 'build_object_index':
        return args; // Direct pass-through (ToolHandlers.buildCache expects args directly)
      
      case 'create_xpp_object':
        return args; // Direct pass-through (ToolHandlers.createXppObject expects args directly)
      
      case 'find_xpp_object':
        return args; // Direct pass-through
      
      default:
        return args;
    }
  }

  /**
   * Validate tool response format
   */
  _validateToolResponse(toolName, response) {
    if (!response) {
      throw new Error(`Empty response from tool: ${toolName}`);
    }

    // Basic MCP response validation
    if (this.config.validation.validateMCPFormat) {
      // Check for required response structure
      if (typeof response !== 'object') {
        throw new Error(`Invalid response format from ${toolName}: expected object`);
      }

      // Validate common MCP response patterns - content can be string or object
      if (response.content !== undefined) {
        const contentType = typeof response.content;
        if (contentType !== 'string' && contentType !== 'object') {
          throw new Error(`Invalid content format in ${toolName} response: expected string or object, got ${contentType}`);
        }
      }
    }
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return `test-${randomBytes(8).toString('hex')}`;
  }

  /**
   * Get available tools
   */
  getAvailableTools() {
    return [...this.config.tools.availableTools];
  }

  /**
   * Set transport mode
   */
  setTransport(mode) {
    // Reset all transport modes
    Object.keys(this.config.transport).forEach(key => {
      this.config.transport[key] = false;
    });

    // Set the requested mode
    if (this.config.transport.hasOwnProperty(mode)) {
      this.config.transport[mode] = true;
    } else {
      throw new Error(`Invalid transport mode: ${mode}. Available: ${Object.keys(this.config.transport).join(', ')}`);
    }
  }

  /**
   * Health check - verify client is working
   */
  async healthCheck() {
    try {
      const result = await this.executeTool('get_current_config', {});
      return {
        healthy: true,
        transport: this.config.transport,
        toolsAvailable: this.config.tools.availableTools.length,
        response: !!result
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        transport: this.config.transport
      };
    }
  }
}

// =============================================================================
// MCP TEST UTILITIES
// =============================================================================

export class MCPTestUtils {
  static async createTestClient(options = {}) {
    const client = new MCPXppClient({
      transport: { direct: true, stdio: false, http: false },
      validation: { enableStrictValidation: true },
      ...options
    });

    await client.initialize();
    return client;
  }

  static async validateToolResponse(toolName, response) {
    const validationRules = {
      'get_current_config': (resp) => {
        if (!resp.content) throw new Error('Missing content');
        // Content can be string or object - check for key indicators
        const contentStr = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
        if (!contentStr.includes('applicationInfo')) throw new Error('Missing applicationInfo');
      },
      'search_objects_pattern': (resp) => {
        if (!resp.content) throw new Error('Missing content');
      },
      'build_object_index': (resp) => {
        if (!resp.content) throw new Error('Missing content');
      },
      'find_xpp_object': (resp) => {
        if (!resp.content) throw new Error('Missing content');
      }
    };

    const validator = validationRules[toolName];
    if (validator) {
      validator(response);
    }

    return true;
  }

  static generateTestRequest(toolName, customArgs = {}) {
    const defaultArgs = {
      'get_current_config': {},
      'search_objects_pattern': { pattern: '*', objectType: 'AxClass', limit: 5 },
      'build_object_index': { mode: 'fast' },
      'create_xpp_object': { objectType: 'AxModel', name: 'TestModel_' + Date.now(), model: 'cc' },
      'find_xpp_object': { objectName: 'SalesTable' }
    };

    return {
      tool: toolName,
      arguments: { ...defaultArgs[toolName], ...customArgs },
      requestId: `test-${Date.now()}`
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default MCPXppClient;
