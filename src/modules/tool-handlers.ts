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
      objectName: z.string().optional(),
      objectType: z.string().optional(),
      layer: z.string().optional(),
      publisher: z.string().default("YourCompany"),
      version: z.string().default("1.0.0.0"),
      dependencies: z.array(z.string()).default(["ApplicationPlatform", "ApplicationFoundation"]),
      outputPath: z.string().default("Models"),
      properties: z.record(z.any()).optional(),
      discoverParameters: z.boolean().default(false),
    });
    
    const params = schema.parse(actualArgs);
    
    // Handle parameter discovery mode
    if (params.discoverParameters) {
      if (!params.objectType) {
        return await createLoggedResponse(
          "❌ Parameter discovery requires objectType to be specified.\n\n" +
          "Example: { \"objectType\": \"AxTable\", \"discoverParameters\": true }",
          requestId,
          "create_xpp_object"
        );
      }
      
      console.log(`🔍 Discovering parameters for object type: ${params.objectType}`);
      
      try {
        const discoveryResult = await ObjectCreators.discoverParameters(params.objectType);
        
        if (!discoveryResult.success) {
          return await createLoggedResponse(
            `❌ Parameter discovery failed: ${discoveryResult.errorMessage}`,
            requestId,
            "create_xpp_object"
          );
        }
        
        const schema = discoveryResult.schema.ParameterSchema;
        let content = `🔍 Parameter Discovery for ${params.objectType}\n`;
        content += `Found ${schema.ParameterCount} creation-relevant parameters\n`;
        content += `Discovery time: ${discoveryResult.discoveryTime}ms\n\n`;
        
        // Show required parameters
        if (schema.Required && schema.Required.length > 0) {
          content += `✅ Required Parameters (${schema.Required.length}):\n`;
          schema.Required.forEach((paramName: string) => {
            const param = schema.Parameters[paramName];
            content += `  • ${paramName}: ${param.Type}\n`;
            if (param.Description) {
              content += `    ${param.Description}\n`;
            }
          });
          content += '\n';
        }
        
        // Show recommended parameters
        if (schema.Recommended && schema.Recommended.length > 0) {
          content += `⭐ Recommended Parameters (${schema.Recommended.length}):\n`;
          schema.Recommended.forEach((paramName: string) => {
            const param = schema.Parameters[paramName];
            content += `  • ${paramName}: ${param.Type}\n`;
            if (param.Description) {
              content += `    ${param.Description}\n`;
            }
            if (param.IsEnum && param.EnumValues.length > 0) {
              content += `    Values: ${param.EnumValues.slice(0, 5).join(', ')}`;
              if (param.EnumValues.length > 5) content += ` (and ${param.EnumValues.length - 5} more)`;
              content += '\n';
            }
            if (param.DefaultValue) {
              content += `    Default: ${param.DefaultValue}\n`;
            }
          });
          content += '\n';
        }
        
        // Show all other parameters (summarized)
        const allParamNames = Object.keys(schema.Parameters);
        const requiredNames = schema.Required || [];
        const recommendedNames = schema.Recommended || [];
        const otherParams = allParamNames.filter(
          name => !requiredNames.includes(name) && !recommendedNames.includes(name)
        );
        
        if (otherParams.length > 0) {
          content += `📋 Other Available Parameters (${otherParams.length}):\n`;
          otherParams.slice(0, 10).forEach(paramName => {
            const param = schema.Parameters[paramName];
            content += `  • ${paramName}: ${param.Type}`;
            if (param.IsEnum) content += ` (enum)`;
            content += '\n';
          });
          if (otherParams.length > 10) {
            content += `  ... and ${otherParams.length - 10} more parameters\n`;
          }
          content += '\n';
        }
        
        // Show usage patterns if available
        if (schema.UsagePatterns && Object.keys(schema.UsagePatterns).length > 0) {
          content += `🎯 Usage Patterns:\n`;
          Object.entries(schema.UsagePatterns).forEach(([patternName, patternData]) => {
            const pattern = patternData as any; // Type assertion for unknown pattern structure
            content += `  📐 ${patternName}: ${pattern.description || 'Usage pattern'}\n`;
            if (pattern.scenarios && pattern.scenarios.length > 0) {
              content += `    Scenarios: ${pattern.scenarios.slice(0, 3).join(', ')}\n`;
            }
          });
          content += '\n';
        }
        
        content += `💡 To create an object with parameters:\n`;
        content += `{\n`;
        content += `  "objectType": "${params.objectType}",\n`;
        content += `  "objectName": "MyCustomObject",\n`;
        // Show example with first enum parameter
        const firstEnumParam = allParamNames.find(name => schema.Parameters[name].IsEnum);
        if (firstEnumParam) {
          const param = schema.Parameters[firstEnumParam];
          content += `  "${firstEnumParam}": "${param.EnumValues[0]}"\n`;
        }
        content += `}\n`;
        
        return await createLoggedResponse(content, requestId, "create_xpp_object");
        
      } catch (error) {
        return await createLoggedResponse(
          `❌ Parameter discovery error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          requestId,
          "create_xpp_object"
        );
      }
    }
    
    // Regular object creation flow - require objectName and objectType
    if (!params.objectName || !params.objectType) {
      return await createLoggedResponse(
        "❌ Object creation requires both objectName and objectType parameters.\n\n" +
        "For parameter discovery, use: { \"objectType\": \"AxTable\", \"discoverParameters\": true }\n" +
        "For object creation, use: { \"objectName\": \"MyTable\", \"objectType\": \"AxTable\" }",
        requestId,
        "create_xpp_object"
      );
    }
    
    // Check if this is a form creation request - redirect to specialized form tool
    if (params.objectType === 'AxForm' || params.objectType?.toLowerCase().includes('form')) {
      return await createLoggedResponse(
        `🎯 Form creation detected! For enhanced form creation with datasource and pattern support, use the specialized 'create_form' tool instead.\n\n` +
        `Examples:\n` +
        `📝 Create form with datasources:\n` +
        `{\n` +
        `  "mode": "create",\n` +
        `  "name": "${params.objectName}",\n` +
        `  "datasources": ["Table1", "Table2"],\n` +
        `  "pattern": "SimpleList"\n` +
        `}\n\n` +
        `📋 Discover available patterns:\n` +
        `{\n` +
        `  "mode": "list_patterns"\n` +
        `}\n\n` +
        `This tool provides:\n` +
        `• Automatic datasource integration\n` +
        `• Pattern discovery and application\n` +
        `• Enhanced form structure\n` +
        `• Better D365 integration\n\n` +
        `Use 'create_form' for better results!`,
        requestId,
        "create_xpp_object"
      );
    }

    // Note: xppPath no longer required - VS2022 service handles all operations
    console.log(`Creating ${params.objectType} '${params.objectName}' using direct VS2022 service integration...`);
    
    let content: string;
    const startTime = Date.now();
    
    try {
      // Direct VS2022 service integration - supports all 544+ D365 object types
      content = await ObjectCreators.createGenericObject(params.objectType, params.objectName, {
        layer: params.layer,
        publisher: params.publisher,
        version: params.version,
        dependencies: params.dependencies,
        outputPath: params.outputPath,
        properties: params.properties
      });
      
      // Immediately add the created object to the search index for instant searchability
      try {
        const model = params.properties?.model || 'UnknownModel';
        const filePath = `Models/${model}/${params.objectType}/${params.objectName}.xml`;
        
        const indexSuccess = await ObjectIndexManager.addObjectToIndex(
          params.objectName,
          params.objectType,
          model,
          filePath
        );
        
        if (indexSuccess) {
          content += `\n🔍 Object added to search index - immediately searchable`;
        } else {
          content += `\n⚠️  Object created but not added to search index`;
        }
      } catch (indexError) {
        console.warn(`Failed to add object to search index: ${indexError}`);
        content += `\n⚠️  Object created but search index update failed`;
      }
      
      const executionTime = Date.now() - startTime;
      content += `\n\nPerformance: ${executionTime}ms using VS2022 service integration\n`;
      
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

  static async createForm(args: any, requestId: string): Promise<any> {
    console.log('🎯 Starting createForm with args:', JSON.stringify(args, null, 2));
    
    const actualArgs = args?.arguments || args;
    
    const schema = z.object({
      mode: z.enum(["create", "list_patterns"]),
      formName: z.string().optional(),
      patternName: z.string().optional(),
      patternVersion: z.string().optional(),
      dataSources: z.union([
        z.array(z.string()),
        z.string()
      ]).optional(),
      modelName: z.string().optional()
    });

    const validationResult = schema.safeParse(actualArgs);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return await createLoggedResponse(
        `❌ Invalid parameters: ${errors}`,
        requestId,
        "create_form"
      );
    }

    const params = validationResult.data;

    try {
      // Import D365ServiceClient dynamically
      const { D365ServiceClient } = await import('./d365-service-client.js');
      const client = new D365ServiceClient('mcp-xpp-d365-service', 10000, 60000);
      
      console.log('🔗 Connecting to D365 service...');
      await client.connect();
      console.log('✅ Connected to D365 service');

      let response;

      if (params.mode === "list_patterns") {
        // Handle pattern discovery
        console.log('🔍 Discovering available patterns...');
        response = await client.sendRequest('discover_patterns', undefined, {});
      } else if (params.mode === "create") {
        // Handle form creation
        if (!params.formName) {
          return await createLoggedResponse(
            "❌ formName is required when mode='create'",
            requestId,
            "create_form"
          );
        }
        
        console.log(`🏗️ Creating form: ${params.formName}`);
        
        const formParams = {
          formName: params.formName,
          patternName: params.patternName || 'SimpleListDetails',
          patternVersion: params.patternVersion || 'UX7 1.0',
          modelName: params.modelName || 'ApplicationSuite',
          ...(params.dataSources && { dataSources: params.dataSources })
        };
        
        response = await client.sendRequest('create_form', undefined, formParams);
      }

      // Always disconnect
      await client.disconnect();
      console.log('🔌 Disconnected from D365 service');

      if (params.mode === "list_patterns") {
        return await ToolHandlers.formatPatternListResponse(response, requestId);
      } else {
        return await ToolHandlers.formatFormCreationResponse(response, requestId);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return await createLoggedResponse(
        `❌ Failed to ${params.mode === 'list_patterns' ? 'discover patterns' : 'create form'}: ${errorMsg}`,
        requestId,
        "create_form"
      );
    }
  }

  private static async formatPatternListResponse(response: any, requestId: string): Promise<any> {
    if (response?.Success && response?.Data) {
      let content = "🎯 **Available D365 Form Patterns**\n\n";
      
      if (response.Data.Patterns && response.Data.Patterns.length > 0) {
        content += `Found ${response.Data.Patterns.length} available patterns:\n\n`;
        
        response.Data.Patterns.forEach((pattern: any, index: number) => {
          content += `**${index + 1}. ${pattern.Name}**\n`;
          if (pattern.Version) content += `   📋 Version: ${pattern.Version}\n`;
          if (pattern.Description) content += `   📝 ${pattern.Description}\n`;
          content += `\n`;
        });
        
        content += "\n💡 **Usage Example:**\n";
        content += "```json\n";
        content += '{\n  "mode": "create",\n  "formName": "MyCustomForm",\n  "patternName": "SimpleListDetails",\n  "dataSources": ["CustTable"]\n}\n';
        content += "```\n";
      } else {
        content += "No patterns found in the current D365 environment.\n";
      }
      
      return await createLoggedResponse(content, requestId, "create_form");
    } else {
      return await createLoggedResponse(
        `❌ Pattern discovery failed: ${response?.Error || 'Unknown error'}`,
        requestId,
        "create_form"
      );
    }
  }

  private static async formatFormCreationResponse(response: any, requestId: string): Promise<any> {
    if (response?.Success && response?.Data?.Success) {
      let content = `✅ **Form Created Successfully**\n\n`;
      content += `📄 **Form Name:** ${response.Data.FormName}\n`;
      content += `📦 **Model:** ${response.Data.Model}\n`;
      content += `🎨 **Pattern:** ${response.Data.Pattern} ${response.Data.PatternVersion}\n`;
      content += `✨ **Pattern Applied:** ${response.Data.PatternApplied ? 'Yes' : 'No'}\n`;
      
      if (response.Data.DataSources && response.Data.DataSources.length > 0) {
        content += `🗄️ **DataSources:** ${response.Data.DataSources.length} added (${response.Data.DataSources.join(', ')})\n`;
        content += `📊 **DataSources Added:** ${response.Data.DataSourcesAdded}/${response.Data.DataSources.length}\n`;
      }
      
      content += `\n💬 **Message:** ${response.Data.Message}\n`;
      
      return await createLoggedResponse(content, requestId, "create_form");
    } else {
      return await createLoggedResponse(
        `❌ Form creation failed: ${response?.Error || response?.Data?.Message || 'Unknown error'}`,
        requestId,
        "create_form"
      );
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

  // Helper function to match filter patterns with wildcard support
  static matchesPattern(text: string, pattern: string): boolean {
    if (!pattern) return true;
    
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .toLowerCase()
      .replace(/\*/g, '.*')  // * becomes .*
      .replace(/\?/g, '.');  // ? becomes .
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(text.toLowerCase());
  }

  // Helper function to filter arrays based on pattern
  static filterByPattern<T extends { Name?: string; PropertyName?: string }>(
    items: T[], 
    pattern?: string
  ): T[] {
    if (!pattern || !items) return items;
    
    return items.filter(item => {
      const name = item.Name || item.PropertyName || '';
      return this.matchesPattern(name, pattern);
    });
  }

  static async inspectXppObject(args: any, requestId: string): Promise<any> {
    const schema = z.object({
      objectName: z.string(),
      objectType: z.string().optional(),
      inspectionMode: z.enum(["summary", "properties", "collection", "xppcode"]).optional().default("summary"),
      collectionName: z.string().optional(),
      codeTarget: z.enum(["methods", "specific-method", "event-handlers"]).optional(),
      methodName: z.string().optional(),
      maxCodeLines: z.number().optional(),
      filterPattern: z.string().optional(),
    });
    const { 
      objectName, 
      objectType, 
      inspectionMode, 
      collectionName,
      codeTarget,
      methodName,
      maxCodeLines,
      filterPattern 
    } = schema.parse(args);
    
    // Validate collectionName is provided when inspectionMode is "collection"
    if (inspectionMode === "collection" && !collectionName) {
      return await createLoggedResponse(
        `collectionName parameter is required when inspectionMode is "collection". Use inspectionMode="summary" first to see available collections.`,
        requestId,
        "inspect_xpp_object"
      );
    }
    
    // Validate codeTarget is provided when inspectionMode is "xppcode"
    if (inspectionMode === "xppcode" && !codeTarget) {
      return await createLoggedResponse(
        `codeTarget parameter is required when inspectionMode is "xppcode". Valid values: "methods", "specific-method", "event-handlers"`,
        requestId,
        "inspect_xpp_object"
      );
    }
    
    // Validate methodName is provided when codeTarget is "specific-method"
    if (codeTarget === "specific-method" && !methodName) {
      return await createLoggedResponse(
        `methodName parameter is required when codeTarget is "specific-method".`,
        requestId,
        "inspect_xpp_object"
      );
    }
    
    try {
      const client = ObjectCreators['getServiceClient'](15000); // Use longer timeout for inspection
      await client.connect();
      
      // Route to appropriate C# backend handler based on inspectionMode
      let action: string;
      let requestData: any = { objectName, objectType };
      
      switch (inspectionMode) {
        case "summary":
          action = "objectsummary";
          break;
        case "properties":  
          action = "objectproperties";
          break;
        case "collection":
          action = "objectcollection";
          requestData.collectionName = collectionName;
          break;
        case "xppcode":
          action = "objectcode";
          requestData.codeTarget = codeTarget;
          if (methodName) requestData.methodName = methodName;
          if (maxCodeLines) requestData.maxCodeLines = maxCodeLines;
          break;
        default:
          // Default to summary mode for backward compatibility
          action = "objectsummary";
          break;
      }
      
      const result = await client.sendRequest({
        action: action,
        parameters: requestData
      });
      
      await client.disconnect();
      
      if (!result.Success) {
        return await createLoggedResponse(
          `Failed to inspect object "${objectName}" (mode: ${inspectionMode}): ${result.Error || 'Unknown error'}`,
          requestId,
          "inspect_xpp_object"
        );
      }
      
      let data = result.Data;
      
      // Format output based on inspection mode (filtering handled internally by C# service)
      let content = this.formatInspectionResult(inspectionMode, objectName, data, filterPattern, collectionName);
      
      return await createLoggedResponse(content, requestId, "inspect_xpp_object");
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return await createLoggedResponse(
        `Failed to inspect object "${objectName}" (mode: ${inspectionMode}): ${errorMsg}`,
        requestId,
        "inspect_xpp_object"
      );
    }
  }

  // Format inspection results based on inspection mode
  static formatInspectionResult(inspectionMode: string, objectName: string, data: any, filterPattern?: string, collectionName?: string): string {
    let content = `🔍 Object Inspection for "${objectName}" (${inspectionMode} mode)`;
    if (filterPattern) {
      content += ` (filtered by: ${filterPattern})`;
    }
    content += `\n\n`;

    if (!data || (data.Found === false)) {
      content += `❌ Object not found: ${data?.Error || 'Object does not exist'}\n`;
      if (data?.SearchedTypes) {
        content += `\n🔍 Searched object types: ${data.SearchedTypes.join(', ')}\n`;
      }
      return content;
    }

    switch (inspectionMode) {
      case "summary":
        return this.formatSummaryResult(content, objectName, data);
      case "properties":
        return this.formatPropertiesResult(content, objectName, data);
      case "collection":
        return this.formatCollectionResult(content, objectName, data, collectionName);
      case "xppcode":
        return this.formatCodeResult(content, objectName, data);
      default:
        return this.formatSummaryResult(content, objectName, data);
    }
  }

  // Format summary mode result
  static formatSummaryResult(content: string, objectName: string, data: any): string {
    content += `✅ Object Summary: ${data.ObjectType} "${data.ObjectName}"\n\n`;
    
    if (data.Summary) {
      content += `📊 Overview:\n`;
      content += `   Properties: ${data.Summary.PropertiesCount || 0}\n`;
      content += `   Collections: ${data.Summary.CollectionsCount || 0}\n`;
      content += `   Total Collection Items: ${data.Summary.TotalCollectionItems || 0}\n\n`;
    }

    if (data.Collections) {
      content += `📋 Available Collections:\n`;
      for (const [collectionName, collectionInfo] of Object.entries(data.Collections) as [string, any][]) {
        content += `   ${collectionName}: ${collectionInfo.Count} ${collectionInfo.ItemType}`;
        content += collectionInfo.Available ? ` ✅` : ` ❌`;
        content += `\n`;
      }
      content += `\n💡 Use inspectionMode="properties" to see all properties, or inspectionMode="collection" with collectionName to see specific collections.\n`;
    }

    return content;
  }

  // Format properties mode result with enhanced descriptions
  static formatPropertiesResult(content: string, objectName: string, data: any): string {
    content += `✅ Object Properties: ${data.ObjectType} "${data.ObjectName}"\n\n`;
    
    if (data.Properties && data.Properties.length > 0) {
      content += `🔧 Properties (${data.Properties.length}):\n`;
      for (const prop of data.Properties) {
        content += `   📋 ${prop.Name} (${prop.Type})`;
        if (prop.CurrentValue && prop.CurrentValue !== '<not available>') {
          content += ` = ${prop.CurrentValue}`;
        }
        content += `\n`;
        
        // Add description if available
        if (prop.Description && prop.Description !== "") {
          content += `      💭 ${prop.Description}\n`;
        }
        
        // Add possible values for enums if available
        if (prop.PossibleValues && prop.PossibleValues.length > 0) {
          if (prop.PossibleValues.length <= 5) {
            content += `      🎯 Values: [${prop.PossibleValues.join(', ')}]\n`;
          } else {
            content += `      🎯 Values: [${prop.PossibleValues.slice(0, 5).join(', ')}, ... (${prop.PossibleValues.length - 5} more)]\n`;
          }
        }
        
        // Add readonly indicator if applicable
        if (prop.IsReadOnly === true) {
          content += `      🔒 Read-only\n`;
        }
      }
    } else {
      content += `No properties found.\n`;
    }

    return content;
  }

  // Format collection mode result
  static formatCollectionResult(content: string, objectName: string, data: any, collectionName?: string): string {
    content += `✅ Collection "${collectionName}": ${data.ObjectType} "${data.ObjectName}"\n\n`;
    
    if (data.Collection) {
      content += `📋 ${data.CollectionName} Collection:\n`;
      content += `   Item Type: ${data.Collection.ItemType}\n`;
      content += `   Count: ${data.Collection.FilteredCount || data.Collection.Count}\n`;
      
      // Show filtering info if pattern was applied
      if (data.FilterPattern && data.Collection.TotalCount > (data.Collection.FilteredCount || data.Collection.Count)) {
        content += `   (${data.Collection.FilteredCount || data.Collection.Count} of ${data.Collection.TotalCount} items matching "${data.FilterPattern}")\n`;
      }
      content += `\n`;
      
      if (data.Collection.Items && data.Collection.Items.length > 0) {
        content += `Items:\n`;
        for (const item of data.Collection.Items) {
          content += `   - ${item}\n`;
        }
      } else {
        content += `No items in collection.\n`;
      }
    } else {
      content += `Collection "${collectionName}" not found or empty.\n`;
    }

    return content;
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
          `SQLite object database not available. Database will be auto-created during build process.`,
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

  static async discoverModificationCapabilities(args: any, requestId: string): Promise<any> {
    console.log('🔍 Starting discoverModificationCapabilities with args:', JSON.stringify(args, null, 2));
    
    const actualArgs = args?.arguments || args;
    
    // Validate required parameters
    const objectTypeSchema = z.object({
      objectType: z.string().min(1, "objectType is required and must be non-empty")
    });

    const validationResult = objectTypeSchema.safeParse(actualArgs);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new McpError(ErrorCode.InvalidParams, `Validation failed: ${errors}`);
    }

    const { objectType } = validationResult.data;

    try {
      console.log(`🔍 Discovering modification capabilities for object type: ${objectType}`);

      // Import D365ServiceClient dynamically to avoid circular dependencies
      const { D365ServiceClient } = await import('./d365-service-client.js');
      const client = new D365ServiceClient('mcp-xpp-d365-service', 10000, 30000);
      
      // Connect to the service
      console.log('🔗 Connecting to D365 service...');
      await client.connect();
      console.log('✅ Connected to D365 service');

      // Discover modification capabilities
      console.log(`🚀 Requesting modification capabilities for ${objectType}...`);
      const response = await client.discoverModificationCapabilities(objectType);
      console.log('📦 Raw service response:', JSON.stringify(response, null, 2));

      // Ensure we disconnect
      await client.disconnect();
      console.log('🔌 Disconnected from D365 service');

      // Extract the capabilities data
      const capabilities = response.Data || response.data || response;
      
      if (!capabilities) {
        return await createLoggedResponse(
          `❌ No modification capabilities found for object type: ${objectType}`,
          requestId,
          "discover_modification_capabilities"
        );
      }

      // Format the response for display
      const formattedResponse = {
        objectType: capabilities.ObjectType || objectType,
        fullTypeName: capabilities.FullTypeName,
        availableMethods: capabilities.Methods || [],
        methodCount: (capabilities.Methods || []).length,
        reflectionInfo: {
          namespace: capabilities.Namespace,
          assembly: capabilities.Assembly,
          isPublic: capabilities.IsPublic,
          isAbstract: capabilities.IsAbstract,
          isSealed: capabilities.IsSealed
        }
      };

      // Use structured inheritance hierarchy from C# service (NO MORE STRING MATCHING!)
      const concreteTypes = capabilities.RelatedTypeConstructors || [];
      const modificationMethods = capabilities.ModificationMethods || [];
      
      // NEW: Use proper inheritance hierarchy mapping from C# service
      const inheritanceHierarchy = capabilities.InheritanceHierarchy || {};
      const reflectionInfo = capabilities.ReflectionInfo || {};
      
      console.log('🔍 DEBUG: InheritanceHierarchy from C# service:', JSON.stringify(inheritanceHierarchy, null, 2));
      
      // Build type groups using the explicit inheritance mapping from C# service
      const typeGroups: { [key: string]: any[] } = {};
      
      // For each method, use the inheritance hierarchy to get concrete types
      modificationMethods.forEach((method: any) => {
        const requirements = method.ParameterCreationRequirements || [];
        if (requirements.length > 0) {
          const parameterType = requirements[0].ParameterType;
          if (parameterType && !typeGroups[parameterType]) {
            // Use explicit inheritance mapping from C# service
            if (inheritanceHierarchy[parameterType]) {
              typeGroups[parameterType] = inheritanceHierarchy[parameterType];
            } else {
              // Fallback: if not in hierarchy, it's likely a concrete type already
              const concreteType = concreteTypes.find((t: any) => t.Name === parameterType);
              if (concreteType) {
                typeGroups[parameterType] = [concreteType];
              }
            }
          }
        }
      });

      // Create enhanced method documentation with explicit concrete type guidance
      const methodsDocumentation = formattedResponse.availableMethods && formattedResponse.availableMethods.length > 0 ?
        `🔧 **MODIFICATION METHODS WITH CONCRETE TYPE REQUIREMENTS:**\n` +
        formattedResponse.availableMethods.map((method: any) => {
          let methodDoc = `\n   📝 **${method.Name}**\n`;
          methodDoc += `      • Description: ${method.Description || 'Modifies the object'}\n`;
          
          // Find the corresponding method in ModificationMethods to get parameter requirements
          const modMethod = modificationMethods.find((m: any) => m.Name === method.Name);
          if (modMethod && modMethod.ParameterCreationRequirements && modMethod.ParameterCreationRequirements.length > 0) {
            const parameterType = modMethod.ParameterCreationRequirements[0].ParameterType;
            const availableConcreteTypes = typeGroups[parameterType] || [];
            
            if (availableConcreteTypes.length > 1) {
              // Multiple concrete types available - this is an abstract type
              methodDoc += `      • Parameters: ${parameterType} (abstract - must use concrete type)\n`;
              methodDoc += `      • 🎯 **Concrete types for ${parameterType}:** ${availableConcreteTypes.map(t => t.Name).join(', ')}\n`;
              methodDoc += `      • ⚠️  **Usage**: "concreteType": "${availableConcreteTypes[0].Name}" (choose from above list)\n`;
            } else if (availableConcreteTypes.length === 1) {
              // Only one concrete type - already concrete
              methodDoc += `      • Parameters: ${parameterType} (concrete type)\n`;
            } else {
              // No concrete types found, check if this type is in the concrete types list directly
              const directConcreteType = concreteTypes.find((t: any) => t.Name === parameterType);
              if (directConcreteType) {
                methodDoc += `      • Parameters: ${parameterType} (concrete type)\n`;
              } else {
                methodDoc += `      • Parameters: ${parameterType} (system type)\n`;
              }
            }
          } else {
            // No parameter requirements found, use basic signature
            const paramMatch = method.Description?.match(/Parameters:\s*\(([^)]+)\)/);
            const parameterType = paramMatch ? paramMatch[1] : 'Object';
            methodDoc += `      • Parameters: ${parameterType}\n`;
          }
          
          return methodDoc;
        }).join('') + '\n' : '';

      // Create concrete types section with inheritance explanation
      const concreteTypeInfo = concreteTypes.length > 0 ? 
        `�️ **D365 METADATA TYPE SYSTEM:**\n\n` +
        `   The D365 metadata API uses inheritance hierarchies. Methods expecting abstract base types\n` +
        `   (like AxTableField) must be called with concrete implementations.\n\n` +
        `🎯 **AVAILABLE CONCRETE TYPES:**\n` +
        concreteTypes.map((type: any) => {
          return `   • ${type.Name}: Use as 'concreteType' parameter\n` +
                 `     Full Name: ${type.FullName}\n` +
                 `     Description: ${type.Description || `D365 metadata type: ${type.Name} (Namespace: ${type.Namespace || 'Unknown'})`}`;
        }).join('\n') + '\n\n' : '';

      // Generate contextually appropriate usage examples
      const exampleObjectName = objectType === 'AxTable' ? 'MyTable' : 
                                objectType === 'AxForm' ? 'MyForm' :
                                objectType === 'AxClass' ? 'MyClass' :
                                'MyObject';
      
      const exampleMethodName = objectType === 'AxTable' ? 'AddField' :
                               objectType === 'AxForm' ? 'AddDataSource' :
                               objectType === 'AxClass' ? 'AddMethod' :
                               'AddElement';
      
      // Get a relevant concrete type example from available types
      const exampleConcreteType = concreteTypes && concreteTypes.length > 0 ? 
                                  concreteTypes[0].Name : 
                                  (objectType === 'AxTable' ? 'AxTableFieldString' :
                                   objectType === 'AxForm' ? 'AxFormDataSourceRoot' :
                                   objectType === 'AxClass' ? 'AxMethod' :
                                   'ConcreteType');

      const usageExamples = `💡 **USAGE EXAMPLES:**\n\n` +
        `   📋 **Step 1: Discover capabilities**\n` +
        `   discover_modification_capabilities({ objectType: "${objectType}" })\n\n` +
        `   🔧 **Step 2: Execute modification**\n` +
        `   execute_object_modification({\n` +
        `     objectType: "${objectType}",\n` +
        `     objectName: "${exampleObjectName}",\n` +
        `     methodName: "${exampleMethodName}",\n` +
        `     parameters: {\n` +
        `       concreteType: "${exampleConcreteType}",  // ← Key: specify concrete type\n` +
        `       Name: "MyElement",\n` +
        `       // ... other required properties from discovery\n` +
        `     }\n` +
        `   })\n\n`;

      // Debug logging
      console.log('🔍 DEBUG methodsDocumentation length:', methodsDocumentation.length);
      console.log('🔍 DEBUG methodsDocumentation preview:', methodsDocumentation.substring(0, 200));
      console.log('🔍 DEBUG concreteTypeInfo length:', concreteTypeInfo.length);
      console.log('🔍 DEBUG usageExamples length:', usageExamples.length);

      const summary = `🎯 **MODIFICATION CAPABILITIES FOR ${objectType.toUpperCase()}**\n\n` +
        `📋 **Object Information:**\n` +
        `   • Type: ${formattedResponse.objectType}\n` +
        `   • Full Name: ${formattedResponse.fullTypeName}\n` +
        `   • Namespace: ${reflectionInfo.Namespace || 'Unknown'}\n` +
        `   • Assembly: ${reflectionInfo.Assembly || 'Unknown'}\n\n` +
        methodsDocumentation +
        concreteTypeInfo +
        usageExamples;

      return await createLoggedResponse(
        summary,
        requestId,
        "discover_modification_capabilities"
      );

    } catch (error: any) {
      console.error('❌ Error discovering modification capabilities:', error);
      
      const errorMessage = error.message || 'An unexpected error occurred';
      
      if (errorMessage.includes('timeout') || errorMessage.includes('ENOENT')) {
        return await createLoggedResponse(
          `⚠️ **Connection Error**: Could not connect to D365 metadata service.\n\n` +
          `**Possible Solutions:**\n` +
          `1. Ensure the C# service is running (Build and Run C# Service task)\n` +
          `2. Check if Visual Studio 2022 with D365 tools is installed\n` +
          `3. Verify the service configuration\n\n` +
          `**Error:** ${errorMessage}`,
          requestId,
          "discover_modification_capabilities"
        );
      }

      return await createLoggedResponse(
        `❌ **Error discovering modification capabilities for ${objectType}:**\n${errorMessage}`,
        requestId,
        "discover_modification_capabilities"
      );
    }
  }

  static async executeObjectModification(args: any, requestId: string): Promise<any> {
    console.log('🔧 Starting executeObjectModification with args:', JSON.stringify(args, null, 2));
    
    const actualArgs = args?.arguments || args;
    
    // Define schema for array-based modifications only
    const arrayModificationSchema = z.object({
      objectType: z.string().min(1, "objectType is required and must be non-empty"),
      objectName: z.string().min(1, "objectName is required and must be non-empty"),
      modifications: z.array(z.object({
        methodName: z.string().min(1, "methodName is required and must be non-empty"),
        parameters: z.record(z.any()).optional().default({})
      })).min(1, "modifications array must contain at least one modification")
    });

    // Validate array modification format only
    const arrayValidation = arrayModificationSchema.safeParse(actualArgs);
    
    if (!arrayValidation.success) {
      const errors = arrayValidation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new McpError(ErrorCode.InvalidParams, 
        `❌ Invalid format. This tool only accepts array-based modifications.\n` +
        `📋 Required format: { objectType, objectName, modifications: [{ methodName, parameters }] }\n` +
        `🚫 Validation errors: ${errors}\n` +
        `� For single operations, use: modifications: [{ methodName: "AddField", parameters: {...} }]`
      );
    }
    
    const objectType = arrayValidation.data.objectType;
    const objectName = arrayValidation.data.objectName;
    const modifications = arrayValidation.data.modifications;
    
    console.log(`🔧 Processing ${modifications.length} modifications for ${objectType}:${objectName}`);

    try {
      // Import D365ServiceClient dynamically to avoid circular dependencies
      const { D365ServiceClient } = await import('./d365-service-client.js');
      const client = new D365ServiceClient('mcp-xpp-d365-service', 10000, 60000); // Longer timeout for modifications
      
      // Connect to the service
      console.log('🔗 Connecting to D365 service...');
      await client.connect();
      console.log('✅ Connected to D365 service');

      // Process each modification and collect results
      const operationResults: Array<{
        methodName: string;
        parameters: Record<string, any>;
        success: boolean;
        result?: string;
        error?: string;
        processingTimeMs?: number;
      }> = [];

      let successCount = 0;
      let failureCount = 0;

      console.log(`🚀 Starting execution of ${modifications.length} modification(s)...`);
      
      for (let i = 0; i < modifications.length; i++) {
        const modification = modifications[i];
        console.log(`📝 [${i + 1}/${modifications.length}] Executing ${modification.methodName}...`);
        
        try {
          const startTime = Date.now();
          const response = await client.executeObjectModification(
            objectType, 
            objectName, 
            modification.methodName, 
            modification.parameters
          );
          const processingTime = Date.now() - startTime;
          
          console.log(`📦 [${i + 1}/${modifications.length}] Response:`, JSON.stringify(response, null, 2));
          
          // Extract the result data
          const result = response.Data || response.data || response;
          
          if (!result) {
            operationResults.push({
              methodName: modification.methodName,
              parameters: modification.parameters,
              success: false,
              error: 'No result returned from service',
              processingTimeMs: processingTime
            });
            failureCount++;
            continue;
          }
          
          // Check for errors in the result
          if (result.Error || result.error || !result.Success) {
            const errorMsg = result.Error || result.error || 'Unknown error occurred during modification';
            operationResults.push({
              methodName: modification.methodName,
              parameters: modification.parameters,
              success: false,
              error: errorMsg,
              processingTimeMs: processingTime
            });
            failureCount++;
          } else {
            operationResults.push({
              methodName: modification.methodName,
              parameters: modification.parameters,
              success: true,
              result: `${modification.methodName} executed successfully`,
              processingTimeMs: processingTime
            });
            successCount++;
          }
          
        } catch (operationError: any) {
          console.error(`❌ [${i + 1}/${modifications.length}] Error in ${modification.methodName}:`, operationError);
          operationResults.push({
            methodName: modification.methodName,
            parameters: modification.parameters,
            success: false,
            error: operationError.message || 'Unexpected error during operation',
            processingTimeMs: 0
          });
          failureCount++;
        }
      }

      // Ensure we disconnect
      await client.disconnect();
      console.log('🔌 Disconnected from D365 service');

      // Format the response based on whether it was single or array modification
      const isArrayResponse = modifications.length > 1;
      
      if (isArrayResponse) {
        // Array modification response
        const summary = `${successCount > 0 ? '✅' : '❌'} **BATCH MODIFICATION RESULTS**\n\n` +
          `🎯 **Target Object:** ${objectType}:${objectName}\n` +
          `� **Summary:** ${successCount} succeeded, ${failureCount} failed (${modifications.length} total)\n\n` +
          `� **Operation Results:**\n` +
          operationResults.map((op, index) => 
            `   ${index + 1}. ${op.success ? '✅' : '❌'} **${op.methodName}** ` +
            `(${op.processingTimeMs}ms)${op.success ? '' : `\n      💥 Error: ${op.error}`}`
          ).join('\n') +
          `\n\n💾 **Next Steps:**\n` +
          `   • Save the modified object to persist changes\n` +
          `   • Build/compile the project to apply modifications\n` +
          `   • ${failureCount > 0 ? 'Retry failed operations if needed\n   • ' : ''}Test the modified object functionality`;

        return await createLoggedResponse(
          summary,
          requestId,
          "execute_object_modification"
        );
      } else {
        // Single modification response (backwards compatibility)
        const operation = operationResults[0];
        if (operation.success) {
          const summary = `✅ **MODIFICATION EXECUTED SUCCESSFULLY**\n\n` +
            `🎯 **Operation Details:**\n` +
            `   • Method: ${operation.methodName}\n` +
            `   • Target: ${objectType}:${objectName}\n` +
            `   • Parameters: ${Object.keys(operation.parameters).length} provided\n\n` +
            `📊 **Execution Results:**\n` +
            `   • Status: Success\n` +
            `   • Processing Time: ${operation.processingTimeMs}ms\n` +
            `   • Timestamp: ${new Date().toLocaleString()}\n\n` +
            `💾 **Next Steps:**\n` +
            `   • Save the modified object to persist changes\n` +
            `   • Build/compile the project to apply modifications\n` +
            `   • Test the modified object functionality`;

          return await createLoggedResponse(
            summary,
            requestId,
            "execute_object_modification"
          );
        } else {
          return await createLoggedResponse(
            `❌ **Modification Failed:**\n\n` +
            `🎯 **Operation:** ${operation.methodName} on ${objectType}:${objectName}\n` +
            `💥 **Error:** ${operation.error}\n\n` +
            `💡 **Suggestions:**\n` +
            `   • Verify the object exists in the metadata\n` +
            `   • Check parameter format using discover_modification_capabilities\n` +
            `   • Ensure required parameters are provided`,
            requestId,
            "execute_object_modification"
          );
        }
      }

    } catch (error: any) {
      console.error('❌ Error executing object modification:', error);
      
      const errorMessage = error.message || 'An unexpected error occurred';
      
      if (errorMessage.includes('timeout') || errorMessage.includes('ENOENT')) {
        return await createLoggedResponse(
          `⚠️ **Connection Error**: Could not connect to D365 metadata service.\n\n` +
          `**Possible Solutions:**\n` +
          `1. Ensure the C# service is running (Build and Run C# Service task)\n` +
          `2. Check if Visual Studio 2022 with D365 tools is installed\n` +
          `3. Verify the service configuration\n\n` +
          `**Error:** ${errorMessage}`,
          requestId,
          "execute_object_modification"
        );
      }

      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        return await createLoggedResponse(
          `🔍 **Object Not Found**: The specified object could not be located.\n\n` +
          `**Target:** ${objectType}:${objectName}\n\n` +
          `**Suggestions:**\n` +
          `• Verify object name spelling and case\n` +
          `• Check if object exists in the current model\n` +
          `• Use find_xpp_object to locate the object first\n\n` +
          `**Error:** ${errorMessage}`,
          requestId,
          "execute_object_modification"
        );
      }

      return await createLoggedResponse(
        `❌ **Error executing modifications on ${objectType}:${objectName}:**\n${errorMessage}`,
        requestId,
        "execute_object_modification"
      );
    }
  }

  // Format code inspection result
  static formatCodeResult(content: string, objectName: string, data: any): string {
    if (!data.CodeContent) {
      content += `❌ No code content available\n`;
      return content;
    }

    const codeData = data.CodeContent;
    
    // Add header with extraction info
    content += `📄 Object Type: ${data.ObjectType}\n`;
    content += `🔧 Code Target: ${data.CodeTarget}\n`;
    content += `📅 Extracted: ${data.ExtractedAt}\n`;
    if (data.MethodName) {
      content += `🎯 Method: ${data.MethodName}\n`;
    }
    content += `\n`;

    if (codeData.Error) {
      content += `❌ Error: ${codeData.Error}\n`;
      return content;
    }

    // Handle different code extraction results
    if (codeData.Method) {
      // Single method result
      content += this.formatSingleMethod(codeData.Method);
    } else if (codeData.Methods && Array.isArray(codeData.Methods)) {
      // Multiple methods result
      content += `📊 **Summary:**\n`;
      content += `   • Total Methods: ${codeData.TotalMethods || codeData.Methods.length}\n`;
      content += `   • Total Lines: ${codeData.TotalLinesOfCode || 'Unknown'}\n`;
      content += `   • Language: ${codeData.Language || 'X++'}\n\n`;
      
      content += `💻 **Method Source Code:**\n\n`;
      
      codeData.Methods.forEach((method: any, index: number) => {
        content += `--- Method ${index + 1}: ${method.Name || 'Unknown'} ---\n`;
        content += this.formatSingleMethod(method);
        content += `\n`;
      });
    } else {
      content += `⚠️ Unexpected code result format\n`;
    }

    return content;
  }

  // Format a single method's code data
  static formatSingleMethod(method: any): string {
    let content = '';
    
    if (method.Error) {
      content += `❌ Error: ${method.Error}\n`;
      return content;
    }

    // Method signature and metadata
    content += `🏷️  **Method:** ${method.Name || 'Unknown'}\n`;
    if (method.Signature) {
      content += `📝 **Signature:** \`${method.Signature}\`\n`;
    }
    
    // Method characteristics
    const characteristics = [];
    if (method.Visibility) characteristics.push(`${method.Visibility}`);
    if (method.ReturnType) characteristics.push(`returns ${method.ReturnType}`);
    if (method.IsStatic) characteristics.push('static');
    if (method.IsAbstract) characteristics.push('abstract');
    if (method.IsOverride) characteristics.push('override');
    
    if (characteristics.length > 0) {
      content += `🔧 **Type:** ${characteristics.join(', ')}\n`;
    }
    
    // Code metrics
    const metrics = [];
    if (method.LineCount) metrics.push(`${method.LineCount} lines`);
    if (method.CharacterCount) metrics.push(`${method.CharacterCount} chars`);
    if (method.Parameters && method.Parameters.length > 0) {
      metrics.push(`${method.Parameters.length} parameters`);
    }
    
    if (metrics.length > 0) {
      content += `📊 **Metrics:** ${metrics.join(', ')}\n`;
    }

    // Parameters
    if (method.Parameters && method.Parameters.length > 0) {
      content += `📋 **Parameters:**\n`;
      method.Parameters.forEach((param: any) => {
        content += `   • ${param.Name}: ${param.Type || 'unknown'}`;
        if (param.DefaultValue) content += ` = ${param.DefaultValue}`;
        if (param.Optional) content += ' (optional)';
        content += `\n`;
      });
    }

    // Code flags
    const flags = [];
    if (method.HasSuperCall) flags.push('calls super()');
    if (method.HasTryCatch) flags.push('has try/catch');
    
    if (flags.length > 0) {
      content += `🏷️  **Features:** ${flags.join(', ')}\n`;
    }

    // Source code
    if (method.HasSourceCode && method.SourceCode) {
      content += `\n💻 **Source Code:**\n\`\`\`xpp\n${method.SourceCode}\n\`\`\`\n`;
    } else {
      content += `\n❌ **No source code available**\n`;
    }

    return content;
  }


}
