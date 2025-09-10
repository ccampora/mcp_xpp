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
          description: "🔍 BROWSE OBJECT TYPES: Call without parameters to see all 544+ available D365 F&O object types organized by category. 🏗️ CREATE OBJECTS: Provide parameters to create D365 F&O objects using VS2022 service integration. Supports classes, tables, forms, enums, data entities, reports, workflows, services, and more.",
          inputSchema: {
            type: "object",
            properties: {
              objectName: {
                type: "string",
                description: "Name of the D365 object to create (e.g., 'MyCustomClass', 'CustInvoiceTable', 'SalesOrderForm'). Must follow D365 naming conventions.",
              },
              objectType: {
                type: "string",
                enum: availableObjectTypes,
                description: "D365 object type to create. 🔍 IMPORTANT: Call this tool WITHOUT parameters first to see all 544+ available types organized by category! Common types: 'AxClass' (X++ classes), 'AxTable' (data tables), 'AxForm' (UI forms), 'AxEnum' (enumerations), 'AxEdt' (extended data types), 'AxView' (database views), 'AxQuery' (queries), 'AxReport' (SSRS reports), 'AxMenuItemDisplay' (menu items), 'AxDataEntityView' (OData entities), 'AxWorkflowHierarchyProvider' (workflow), 'AxService' (services), 'AxMap' (data maps)."
              },
              layer: {
                type: "string",
                enum: availableLayers,
                description: "D365 application layer for the object. Common layers: 'usr' (user layer - customizations), 'cus' (customer layer - modifications), 'var' (partner layer - VAR solutions), 'isl' (independent software layer), 'sys' (system layer - Microsoft). Choose 'usr' for most custom development."
              },
              outputPath: {
                type: "string",
                description: "Output directory path for the created object structure (relative to D365 metadata root). Default 'Models' creates under Models/ directory. Use existing model names like 'MyCustomModel' to add objects to specific models.",
                default: "Models",
              },
              publisher: {
                type: "string",
                description: "Publisher/company name for the object metadata. Used in model descriptors and copyright headers. Should match your organization name.",
                default: "YourCompany",
              },
              version: {
                type: "string",
                description: "Version number for the object in semantic versioning format (Major.Minor.Build.Revision). Used for model versioning and dependency tracking.",
                default: "1.0.0.0",
              },
              dependencies: {
                type: "array",
                items: { type: "string" },
                description: "List of D365 model dependencies required by this object. Common dependencies: 'ApplicationPlatform' (core platform APIs), 'ApplicationFoundation' (base business logic), 'ApplicationSuite' (standard business processes), 'ApplicationCommon' (shared components). Add specific models for custom dependencies.",
                default: ["ApplicationPlatform", "ApplicationFoundation"],
              },
              properties: {
                type: "object",
                description: "Advanced object-specific properties for specialized configuration. Use for complex scenarios like custom table relations, form data sources, report parameters, workflow configurations, etc. Structure varies by object type."
              }
            },
            required: [], // No required fields - allows calling without parameters to list object types
            examples: [
              {
                description: "🔍 DISCOVER: Browse all 544+ available object types organized by category (CALL THIS FIRST)",
                parameters: {}
              },
              {
                description: "🏗️ CREATE: Custom business logic class",
                parameters: {
                  objectName: "MyBusinessLogicClass",
                  objectType: "AxClass",
                  layer: "usr"
                }
              },
              {
                description: "🏗️ CREATE: Data table for customer extensions",
                parameters: {
                  objectName: "CustTableExtension",
                  objectType: "AxTable",
                  layer: "usr",
                  dependencies: ["ApplicationPlatform", "ApplicationFoundation", "ApplicationSuite"]
                }
              },
              {
                description: "🏗️ CREATE: Form for data entry",
                parameters: {
                  objectName: "MyDataEntryForm",
                  objectType: "AxForm",
                  layer: "usr",
                  outputPath: "MyCustomModel"
                }
              },
              {
                description: "🏗️ CREATE: Enumeration for status values",
                parameters: {
                  objectName: "MyStatusEnum",
                  objectType: "AxEnum",
                  layer: "usr"
                }
              },
              {
                description: "🏗️ CREATE: Data entity for OData/integration",
                parameters: {
                  objectName: "MyDataEntity",
                  objectType: "AxDataEntityView",
                  layer: "usr",
                  dependencies: ["ApplicationPlatform", "ApplicationFoundation", "ApplicationSuite"]
                }
              }
            ]
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
          description: "Get server configuration with flexible detail levels. No parameters = summary view with model names only. Use 'objectTypeList' for available object types, or specify model name for detailed model info.",
          inputSchema: {
            type: "object",
            properties: {
              model: {
                type: "string",
                description: "Optional: Get detailed information for a specific model name (e.g., 'ApplicationSuite', 'CaseManagement'). Returns full model details including dependencies, version, and description.",
              },
              objectTypeList: {
                type: "boolean",
                description: "Optional: Set to true to return the list of all available D365 object types (536+ types). Use this to see what object types can be created.",
                default: false,
              },
              includeVS2022Service: {
                type: "boolean",
                description: "Optional: Include VS2022 service status check (may add latency). Default false for faster response.",
                default: false,
              },
            },
            examples: [
              {
                description: "📋 SUMMARY: Get configuration summary with model names only (fast)",
                parameters: {}
              },
              {
                description: "🏗️ OBJECT TYPES: Get list of all available D365 object types for creation",
                parameters: {
                  objectTypeList: true
                }
              },
              {
                description: "🔍 MODEL DETAILS: Get detailed information for a specific model",
                parameters: {
                  model: "ApplicationSuite"
                }
              },
              {
                description: "🔧 FULL STATUS: Include VS2022 service status (slower)",
                parameters: {
                  includeVS2022Service: true
                }
              }
            ]
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
        {
          name: "discover_modification_capabilities", 
          description: "Discover available modification methods for any D365 object type in real-time using reflection. Shows what operations (AddField, AddMethod, etc.) are possible for the specified object type.",
          inputSchema: {
            type: "object",
            properties: {
              objectType: {
                type: "string",
                description: "D365 object type name (e.g., 'AxTable', 'AxClass', 'AxForm'). **IMPORTANT**: This tool discovers exact concrete type names (like 'AxTableFieldString', 'AxTableFieldEnum') that must be used in the 'concreteType' parameter of execute_object_modification. Use get_current_config with objectTypeList=true to see all available types.",
                examples: ["AxTable", "AxClass", "AxForm", "AxEnum", "AxView", "AxQuery", "AxReport"]
              }
            },
            required: ["objectType"],
            examples: [
              {
                description: "🔍 TABLE CAPABILITIES: Discover field types and modification methods for D365 tables",
                parameters: {
                  objectType: "AxTable"
                }
              },
              {
                description: "🔍 CLASS CAPABILITIES: Discover what modifications are possible on D365 classes", 
                parameters: {
                  objectType: "AxClass"
                }
              },
              {
                description: "🔍 FORM CAPABILITIES: Discover form datasource and control types for D365 forms",
                parameters: {
                  objectType: "AxForm"
                }
              }
            ]
          }
        },
        {
          name: "execute_object_modification",
          description: "Execute a specific modification method on a D365 object. Use discover_modification_capabilities first to see available methods and required parameters.",
          inputSchema: {
            type: "object",
            properties: {
              objectType: {
                type: "string",
                description: "D365 object type name (e.g., 'AxTable', 'AxClass', 'AxForm')",
                examples: ["AxTable", "AxClass", "AxForm", "AxEnum", "AxView", "AxQuery", "AxReport"]
              },
              objectName: {
                type: "string",
                description: "Name of the existing D365 object to modify (e.g., 'CustTable', 'SalesTable')"
              },
              methodName: {
                type: "string",
                description: "Name of the modification method to execute (e.g., 'AddField', 'AddMethod', 'AddIndex'). Get exact method names from discover_modification_capabilities."
              },
              parameters: {
                type: "object",
                description: "Parameters required by the modification method. **CRITICAL**: Must include 'concreteType' parameter with exact type name from discovery (e.g., 'AxTableFieldString', 'AxTableFieldEnum', 'AxFormDataSourceRoot'). Use discover_modification_capabilities to get exact concrete type names and required parameters.",
                additionalProperties: true,
                properties: {
                  fieldName: {
                    type: "string",
                    description: "Name of the field/object being added"
                  },
                  concreteType: {
                    type: "string", 
                    description: "**REQUIRED**: Exact concrete type name from discover_modification_capabilities. Examples: 'AxTableFieldString', 'AxTableFieldEnum', 'AxTableFieldInt', 'AxFormDataSourceRoot', 'AxEnumValue'. This enables pure reflection architecture without hardcoded mappings."
                  },
                  label: {
                    type: "string",
                    description: "Optional display label for the object"
                  },
                  helpText: {
                    type: "string",
                    description: "Optional help text for the object"
                  }
                }
              }
            },
            required: ["objectType", "objectName", "methodName"],
            examples: [
              {
                description: "🔧 ADD STRING FIELD: Add a string field using exact concrete type from discovery",
                parameters: {
                  objectType: "AxTable",
                  objectName: "CustTable", 
                  methodName: "AddField",
                  parameters: {
                    fieldName: "MyCustomField",
                    concreteType: "AxTableFieldString",
                    label: "My Custom Field",
                    helpText: "Custom field description"
                  }
                }
              },
              {
                description: "🔧 ADD ENUM FIELD: Add an enum field with custom enum reference",
                parameters: {
                  objectType: "AxTable",
                  objectName: "CustTable",
                  methodName: "AddField",
                  parameters: {
                    fieldName: "CustomerStatus",
                    concreteType: "AxTableFieldEnum",
                    label: "Customer Status",
                    enumType: "MyCustomEnum"
                  }
                }
              },
              {
                description: "🔧 ADD ENUM VALUE: Add a value to a custom enum",
                parameters: {
                  objectType: "AxEnum",
                  objectName: "MyCustomEnum",
                  methodName: "AddEnumValue",
                  parameters: {
                    fieldName: "Active",
                    concreteType: "AxEnumValue",
                    label: "Active",
                    value: 0
                  }
                }
              },
              {
                description: "🔧 ADD FORM DATASOURCE: Add a datasource to a form",
                parameters: {
                  objectType: "AxForm",
                  objectName: "MyCustomForm",
                  methodName: "AddDataSource",
                  parameters: {
                    fieldName: "Customer",
                    concreteType: "AxFormDataSourceRoot",
                    table: "CustTable",
                    label: "Customer Data Source"
                  }
                }
              }
            ]
          }
        },
      ],
    };
  }
}
