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
          description: "🔍 BROWSE OBJECT TYPES: Call without parameters to see all 544+ available D365 F&O object types organized by category. 🏗️ CREATE OBJECTS: Provide parameters to create D365 F&O objects using VS2022 service integration. Supports classes, tables, enums, data entities, reports, workflows, services, and more. ⚠️ IMPORTANT: For creating FORMS, use the dedicated 'create_form' tool instead as it provides specialized pattern support and datasource integration.",
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
              },
              discoverParameters: {
                type: "boolean",
                description: "Set to true to discover available parameters for the specified object type instead of creating an object. Returns a detailed parameter schema with descriptions, types, and usage patterns.",
                default: false
              }
            },
            required: [], // No required fields - allows calling without parameters to list object types
            examples: [
              {
                description: "🔍 DISCOVER: Browse all 544+ available object types organized by category (CALL THIS FIRST)",
                parameters: {}
              },
              {
                description: "🔍 DISCOVER: Find available parameters for AxTable objects",
                parameters: {
                  objectType: "AxTable",
                  discoverParameters: true
                }
              },
              {
                description: "🔍 DISCOVER: Find available parameters for AxClass objects",
                parameters: {
                  objectType: "AxClass", 
                  discoverParameters: true
                }
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
          name: "create_form",
          description: "🎯 SPECIALIZED FORM CREATION TOOL: Create D365 forms with advanced pattern support and datasource integration. This tool combines form creation and pattern discovery in one interface. 🔧 MODE 1 (create): Create forms with patterns, datasources, and proper D365 integration. 🔍 MODE 2 (list_patterns): Discover available D365 form patterns with descriptions. Use this tool instead of 'create_xpp_object' for all form-related operations as it provides specialized form capabilities.",
          inputSchema: {
            type: "object",
            properties: {
              mode: {
                type: "string",
                enum: ["create", "list_patterns"],
                description: "Operation mode: 'create' to create a new form with patterns and datasources, 'list_patterns' to discover available D365 form patterns with descriptions and requirements."
              },
              formName: {
                type: "string",
                description: "Name of the D365 form to create (e.g., 'MyCustomForm', 'SalesOrderDetailsForm'). Required when mode='create'. Must follow D365 naming conventions."
              },
              patternName: {
                type: "string",
                description: "D365 form pattern to apply (e.g., 'SimpleListDetails', 'Details Master', 'Dialog - Basic'). Optional - if not specified, defaults to 'SimpleListDetails'. Use mode='list_patterns' first to see all available patterns."
              },
              patternVersion: {
                type: "string",
                description: "Version of the form pattern (e.g., 'UX7 1.0', 'UX7 2.0'). Optional - defaults to 'UX7 1.0' if not specified."
              },
              dataSources: {
                type: "array",
                items: { type: "string" },
                description: "Optional array of D365 table names to add as form datasources (e.g., ['CustTable', 'VendTable', 'InventTable']). Can also be a single string or comma-separated string. Datasources are created independently without pattern mapping."
              },
              modelName: {
                type: "string", 
                description: "D365 model/package name to create the form in (e.g., 'ApplicationSuite', 'MyCustomModel'). Optional - defaults to 'ApplicationSuite'."
              }
            },
            required: ["mode"],
          },
          examples: [
            {
              description: "🔍 LIST PATTERNS: Discover all available D365 form patterns",
              parameters: {
                mode: "list_patterns"
              }
            },
            {
              description: "🏗️ CREATE SIMPLE FORM: Create a basic list form with single datasource",
              parameters: {
                mode: "create",
                formName: "MyCustomerListForm",
                patternName: "SimpleListDetails",
                dataSources: ["CustTable"]
              }
            },
            {
              description: "🏗️ CREATE COMPLEX FORM: Create a form with multiple datasources and specific pattern",
              parameters: {
                mode: "create",
                formName: "MySalesOrderForm",
                patternName: "Details Master",
                patternVersion: "UX7 1.0",
                dataSources: ["SalesTable", "SalesLine", "CustTable"],
                modelName: "MyCustomModel"
              }
            },
            {
              description: "🏗️ CREATE DIALOG FORM: Create a dialog form without datasources",
              parameters: {
                mode: "create",
                formName: "MyConfirmationDialog",
                patternName: "Dialog - Basic"
              }
            },
            {
              description: "🏗️ CREATE WITH CSV DATASOURCES: Using comma-separated datasource string",
              parameters: {
                mode: "create", 
                formName: "MyInventoryForm",
                dataSources: ["InventTable,InventDim,InventSum"]
              }
            }
          ]
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
          name: "inspect_xpp_object",
          description: "🔍 ENHANCED D365 OBJECT INSPECTION v2.0 - Advanced inspection with summary-first architecture for optimal agent workflows. Supports 4 inspection modes: fast summaries, targeted properties, specific collections, and X++ source code extraction. ✅ PERFORMANCE OPTIMIZED: 10x faster summaries, unlimited collection access (619+ methods, 193+ fields), no truncation limits. ✅ UNIVERSAL SUPPORT: Works with all 544+ D365 object types (Tables, Classes, Forms, Enums, etc.) using dynamic discovery. ✅ AGENT-FRIENDLY: Progressive disclosure pattern - start with summary, drill down as needed.",
          inputSchema: {
            type: "object",
            properties: {
              objectName: {
                type: "string",
                description: "Name of the X++ object to inspect (e.g., 'CustTable', 'SalesFormLetter', 'SalesTable')",
              },
              objectType: {
                type: "string",
                description: "D365 object type to inspect. Common values: 'AxTable' (data tables), 'AxClass' (business logic), 'AxForm' (UI forms), 'AxEnum' (enumerations), 'AxQuery' (queries), 'AxView' (database views), 'AxEdt' (extended data types), 'AxMenu' (navigation menus), 'AxReport' (SSRS reports), 'AxWorkflow' (workflow definitions), 'AxService' (web services), 'AxMap' (table maps). This parameter is required for object inspection.",
              },
              inspectionMode: {
                type: "string",
                enum: ["summary", "properties", "collection", "xppcode"],
                description: "Controls inspection detail level: 'summary' = Fast overview with collection counts (~50ms, agent-friendly), 'properties' = All object properties without collections (~100ms), 'collection' = Specific collection items without limits (requires collectionName), 'xppcode' = Extract X++ source code from methods (requires codeTarget). Default: 'summary'.",
              },
              collectionName: {
                type: "string",
                description: "Required when inspectionMode='collection'. Collection to retrieve: Tables='Methods'|'Fields'|'Relations'|'Indexes'|'FieldGroups'; Classes='Methods'|'Members'|'Variables'; Forms='DataSources'|'Controls'|'Parts'; Enums='Values'. Use 'summary' mode first to see available collections for the object.",
              },
              codeTarget: {
                type: "string",
                enum: ["methods", "specific-method", "event-handlers"],
                description: "Required when inspectionMode='xppcode'. Target for code extraction: 'methods' = All method source code, 'specific-method' = Single method by name (requires methodName), 'event-handlers' = Event handler methods.",
              },
              methodName: {
                type: "string",
                description: "Required when codeTarget='specific-method'. Name of the specific method to extract source code from.",
              },
              maxCodeLines: {
                type: "number",
                description: "Optional limit on lines of source code returned per method. Useful for large methods to prevent overwhelming output.",
              },
              filterPattern: {
                type: "string",
                description: "Filter results with wildcards (*=any chars, ?=single char). Examples: '*validate*' (methods containing 'validate'), 'cust*' (items starting with 'cust'), '*Address*'. Applies to property/method/field names to reduce response size.",
              },
            },
            required: ["objectName", "objectType"],
            examples: [
              {
                description: "🚀 RECOMMENDED: Fast summary overview - see what's available",
                parameters: {
                  objectName: "CustTable",
                  objectType: "AxTable",
                  inspectionMode: "summary"
                }
              },
              {
                description: "🔧 GET PROPERTIES: All object properties without collections",
                parameters: {
                  objectName: "CustTable", 
                  objectType: "AxTable",
                  inspectionMode: "properties"
                }
              },
              {
                description: "📋 DRILL DOWN: Get all methods from a table (no limits!)",
                parameters: {
                  objectName: "SalesTable",
                  objectType: "AxTable", 
                  inspectionMode: "collection",
                  collectionName: "Methods"
                }
              },
              {
                description: "📋 CLASS METHODS: Get all methods from a business logic class",
                parameters: {
                  objectName: "SalesFormLetter",
                  objectType: "AxClass",
                  inspectionMode: "collection", 
                  collectionName: "Methods"
                }
              },
              {
                description: "📋 TABLE FIELDS: Get all fields from a data table",
                parameters: {
                  objectName: "CustTable",
                  objectType: "AxTable",
                  inspectionMode: "collection",
                  collectionName: "Fields"
                }
              },
              {
                description: "💻 CODE EXTRACTION: Get source code from all methods",
                parameters: {
                  objectName: "SalesFormLetter",
                  objectType: "AxClass",
                  inspectionMode: "code",
                  codeTarget: "methods"
                }
              },
              {
                description: "💻 SPECIFIC METHOD: Get source code for one method",
                parameters: {
                  objectName: "CustTable",
                  objectType: "AxTable",
                  inspectionMode: "code",
                  codeTarget: "specific-method",
                  methodName: "validateWrite"
                }
              },
              {
                description: "💻 LIMITED CODE: Get method code with line limits",
                parameters: {
                  objectName: "SalesTable",
                  objectType: "AxTable",
                  inspectionMode: "code",
                  codeTarget: "methods",
                  maxCodeLines: 50
                }
              },
              {
                description: "🔍 FILTERED SEARCH: Find validation methods only", 
                parameters: {
                  objectName: "SalesTable",
                  objectType: "AxTable",
                  inspectionMode: "collection",
                  collectionName: "Methods", 
                  filterPattern: "*validate*"
                }
              },
              {
                description: "� PROPERTIES INSPECTION: Get all object properties with descriptions",
                parameters: {
                  objectName: "CustTable",
                  objectType: "AxTable",
                  inspectionMode: "properties"
                }
              },
              {
                description: "🎯 ENUM VALUES: Get all values from an enumeration",
                parameters: {
                  objectName: "CustVendNegInstProtestStatus",
                  objectType: "AxEnum",
                  inspectionMode: "collection",
                  collectionName: "Values"
                }
              },
              {
                description: "📱 FORM DATASOURCES: See form data binding structure",
                parameters: {
                  objectName: "CustTable",
                  objectType: "AxForm",
                  inspectionMode: "collection",
                  collectionName: "DataSources"
                }
              },
              {
                description: "⚡ PERFORMANCE COMPARISON: Fast summary vs properties inspection",
                parameters: {
                  objectName: "SalesTable",
                  objectType: "AxTable",
                  inspectionMode: "summary"
                }
              }
            ]
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
