
# MCP X++ Server

A Model Context Protocol (MCP) server for Microsoft Dynamics 365 Finance & Operations development. This tool enables D365 object creation, modification, and analysis through the MCP standard, allowing integration with various development environments.

**Date:** September 18, 2025  
**Status:** Functional with VS2022 service integration and enhanced form creation

## Recent Updates ✨

**September 19, 2025 - Safe Object Deletion Feature:**
- 🗑️ **NEW delete_xpp_object Tool**: Safe D365 object deletion with dependency validation and cascade support
- 🛡️ **Dependency Protection**: Prevents deletion if other objects depend on target, avoiding breaking changes
- 🔄 **Cache Consistency**: Automatic search index updates after successful deletions
- ⚡ **High Performance**: Direct metadata provider integration with ISingleKeyedMetadataProvider.Delete
- 🌲 **Cascade Deletion**: Optional deletion of child objects (form parts, table relations, etc.)
- ✅ **Comprehensive Testing**: Full create/delete cycle validation across object types

**September 18, 2025 - Array Modifications & Form Creation Enhancements:**
- 🚀 **NEW Array-Only Modifications**: `execute_object_modification` now exclusively uses batch format for consistent operations
- 🔄 **Enforced Bulk Processing**: Single operations use array with one element - no more consecutive separate calls
- 📊 **Enhanced Response Tracking**: Per-operation success/failure reporting with detailed timing and error messages
- 📋 **Best Practice Documentation**: Clear guidance to group all modifications for same object into single call
- 🎯 **NEW create_form Tool**: Specialized form creation with pattern support and datasource integration
- 🔧 **DetailsMaster Pattern Fixed**: Resolved validation issues through intelligent field control creation  
- 🗄️ **Enhanced DataSource Support**: Flexible datasource handling (arrays, strings, comma-separated)
- 📋 **Pattern Discovery**: 36 filtered form patterns with descriptions and requirements
- ✅ **Pattern Validation**: Automatic field control creation for patterns requiring them

## Overview

This MCP server provides D365 F&O development capabilities including:

- **Object Creation**: Support for D365 classes, tables, forms, enums, and 544+ other object types
- **Form Creation**: ✨ **Enhanced** - Specialized form creation with pattern validation and datasource integration
- **Object Deletion**: ✨ **NEW** - Safe object deletion with dependency validation and cascade support
- **Object Modification**: Add methods, fields, and other components to existing objects
- **Object Inspection**: Analyze D365 objects and extract X++ source code
- **Codebase Search**: Browse and search through D365 codebases with pattern matching
- **MCP Protocol**: Compatible with Claude Desktop, VS Code, and other MCP clients

## Architecture

The system consists of two main components communicating through Windows Named Pipes:

### MCP X++ Server (Node.js/TypeScript)
- Implements the Model Context Protocol (STDIO)
- Handles object creation, modification, and search operations
- Provides file browsing and codebase indexing
- Compatible with MCP clients like Claude Desktop and VS Code

### D365 Metadata Service (C# .NET 4.8)
- Integrates with Microsoft's D365 assemblies
- Handles object creation and modification through VS2022 APIs
- Provides dynamic reflection for runtime object discovery
- Communicates via Named Pipe: `mcp-xpp-d365-service`

The architecture enables D365 development from various MCP-compatible clients while maintaining compatibility with existing D365 development workflows.

## Available Tools

The server provides 10 specialized tools for D365 development:

1. **create_xpp_object** - Create D365 objects (classes, tables, enums, etc.) - *Note: Use create_form for forms*
2. **create_form** - ✨ **NEW** - Specialized form creation with pattern support and datasource integration
3. **delete_xpp_object** - ✨ **NEW** - Safe D365 object deletion with dependency validation and cache consistency
4. **execute_object_modification** - ✨ **ENHANCED** - Array-based object modification with batch processing - **BEST PRACTICE**: Group all modifications for same object
5. **discover_modification_capabilities** - Explore available modification methods
6. **find_xpp_object** - Find specific objects by name/type
7. **search_objects_pattern** - Pattern search with wildcard support
8. **inspect_xpp_object** - Object analysis with X++ source code extraction
9. **get_current_config** - System configuration and status
10. **build_object_index** - Index management for search performance

## Prerequisites

- **Visual Studio 2022** (Community, Professional, or Enterprise)
- **Dynamics 365 Development Tools** for Visual Studio 2022
- **Node.js** (latest LTS version recommended)
- **.NET Framework 4.8** (typically included with Windows)

## Installation

1. Clone the repository
2. Install Node.js dependencies: `npm install`
3. Run setup to configure VS2022 integration: `.\tools\build-and-run.ps1 -Action setup`
4. Build the project: `.\tools\build-and-run.ps1 -Action build`

## Usage

### Starting the Server

Run the MCP server using:
```bash
node build/index.js
```

The server automatically detects D365 paths from your VS2022 installation. For manual configuration, use:
```bash
node build/index.js --xpp-path "C:\path\to\PackagesLocalDirectory"
```

### MCP Client Configuration

#### VS Code
Configure in `.vscode/mcp.json`:
```json
{
  "servers": {
    "mcp-xpp-server": {
      "command": "node",
      "args": ["./build/index.js"],
      "cwd": "${workspaceFolder}",
      "type": "stdio"
    }
  }
}
```

#### Claude Desktop
Add to Claude Desktop configuration file:
```json
{
  "mcpServers": {
    "mcp-xpp-server": {
      "command": "node",
      "args": ["path/to/mcp_xpp/build/index.js"]
    }
  }
}
```

## Tool Reference

### Object Creation

#### `create_xpp_object`
Creates D365 F&O objects using VS2022 service integration. 

⚠️ **Important:** For creating forms, use the dedicated `create_form` tool instead as it provides specialized pattern support and datasource integration.

**Parameters:**
- `objectName` (string) - Name of the D365 object
- `objectType` (string) - Object type (AxClass, AxTable, AxEnum, etc.) - *Excludes AxForm*
- `layer` (string, optional) - Application layer (usr, cus, var)
- `outputPath` (string, optional) - Output directory (default: "Models")
- `publisher` (string, optional) - Company name (default: "YourCompany")
- `version` (string, optional) - Version number (default: "1.0.0.0")
- `dependencies` (array, optional) - Model dependencies
- `properties` (object, optional) - Object-specific configuration

**Example:**
```javascript
create_xpp_object({
  "objectName": "MyCustomClass",
  "objectType": "AxClass",
  "layer": "usr"
})
```

#### `create_form` ✨ **NEW**
Specialized tool for creating D365 forms with advanced pattern support and datasource integration. This tool combines form creation and pattern discovery in one interface.

**Parameters:**
- `mode` (string, required) - Operation mode:
  - `"create"` - Create a new form with patterns and datasources
  - `"list_patterns"` - Discover available D365 form patterns
- `formName` (string, optional) - Form name (required when mode='create')
- `patternName` (string, optional) - D365 form pattern to apply (e.g., 'SimpleListDetails', 'DetailsMaster', 'Dialog')
- `patternVersion` (string, optional) - Pattern version (default: 'UX7 1.0')
- `dataSources` (array|string, optional) - Table names for form datasources
- `modelName` (string, optional) - D365 model/package name (default: 'ApplicationSuite')

**Key Features:**
- 🎯 **Pattern-Aware**: Automatically adds field controls when patterns require them (e.g., DetailsMaster)
- 🗄️ **Flexible DataSources**: Supports arrays, single strings, or comma-separated strings
- 🔍 **Pattern Discovery**: Lists all 36+ available D365 form patterns with descriptions
- ✅ **Enhanced Validation**: Resolves pattern validation issues through intelligent field control creation

**Examples:**

```javascript
// Discover available patterns
create_form({"mode": "list_patterns"})

// Create simple list form with datasource
create_form({
  "mode": "create",
  "formName": "MyCustomerListForm", 
  "patternName": "SimpleListDetails",
  "dataSources": ["CustTable"]
})

// Create DetailsMaster form with multiple datasources
create_form({
  "mode": "create",
  "formName": "MySalesOrderForm",
  "patternName": "DetailsMaster",
  "patternVersion": "UX7 1.0", 
  "dataSources": ["SalesTable", "SalesLine", "CustTable"],
  "modelName": "MyCustomModel"
})

// Create dialog form without datasources
create_form({
  "mode": "create",
  "formName": "MyConfirmationDialog",
  "patternName": "Dialog"
})
```

**Technical Notes:**
- Patterns like DetailsMaster, SimpleListDetails, and ListPage automatically get enhanced with field controls (RecId, Name, Description, Code) when datasources are provided
- Pattern validation has been fixed - forms can be created with or without datasources depending on pattern requirements
- The tool uses direct VS2022 service integration for optimal D365 compatibility

#### `delete_xpp_object` ✨ **NEW**
Safely deletes D365 F&O objects with comprehensive dependency validation and cache consistency. This tool prevents breaking changes by validating dependencies before deletion.

**Parameters:**
- `objectName` (string, required) - Name of the D365 object to delete
- `objectType` (string, required) - D365 object type (AxClass, AxTable, AxForm, AxEnum, etc.)
- `cascadeDelete` (boolean, optional) - Delete dependent objects too (default: false)

**Key Features:**
- 🛡️ **Dependency Validation**: Prevents deletion if other objects depend on the target
- 🗑️ **Safe Deletion**: Uses D365's ISingleKeyedMetadataProvider.Delete for proper cleanup
- 🔄 **Cache Consistency**: Automatically updates search index after successful deletion
- ⚡ **Fast Performance**: Direct metadata provider integration for optimal speed
- 🌲 **Cascade Support**: Optional deletion of child objects (forms with parts/controls, etc.)

**Examples:**

```javascript
// Delete a custom class
delete_xpp_object({
  "objectName": "MyCustomClass",
  "objectType": "AxClass"
})

// Delete a table with cascade (removes dependent field groups, relations, etc.)
delete_xpp_object({
  "objectName": "MyTestTable", 
  "objectType": "AxTable",
  "cascadeDelete": true
})

// Delete a form (will fail if dependencies exist without cascade)
delete_xpp_object({
  "objectName": "MyCustomForm",
  "objectType": "AxForm"
})
```

**Response Format:**
```json
{
  "success": true,
  "message": "Successfully deleted object: MyCustomClass (AxClass)",
  "objectName": "MyCustomClass",
  "objectType": "AxClass",
  "cascadeDelete": false,
  "dependenciesRemoved": [],
  "cacheUpdate": "Success",
  "performance": "156ms"
}
```

**⚠️ Safety Notes:**
- **HIGH RISK OPERATION**: Deletion is permanent and cannot be undone
- Always verify dependencies with `find_xpp_object` before deletion
- Use `cascadeDelete: false` (default) for maximum safety
- Test deletions in development environments first
- Tool will fail safely if dependencies exist without cascade flag
- Cache updates ensure immediate search consistency after deletion

**Common Object Types:**
- `AxClass` - X++ classes and business logic
- `AxTable` - Data tables and schema
- `AxForm` - User interface forms  
- `AxEnum` - Enumerations and value lists
- `AxEdt` - Extended data types
- `AxView` - Database views
- `AxQuery` - Data queries
- `AxReport` - SSRS reports

### Object Discovery

#### `find_xpp_object`
Locates X++ objects by name with optional filtering.

**Parameters:**
- `objectName` (string, required) - Name of the X++ object
- `objectType` (string, optional) - Filter by object type
- `model` (string, optional) - Filter by D365 model/package name

#### `search_objects_pattern`
Searches D365 objects using wildcard patterns.

**Parameters:**
- `pattern` (string, required) - Search pattern with wildcards (*, ?)
- `objectType` (string, optional) - Filter by object type
- `model` (string, optional) - Filter by D365 model/package name
- `limit` (number, optional) - Maximum results (default: 50)
- `format` (string, optional) - Output format: 'text' or 'json'

#### `inspect_xpp_object`
Analyzes D365 objects with multiple inspection modes.

**Parameters:**
- `objectName` (string, required) - Name of the X++ object
- `objectType` (string, optional) - D365 object type
- `inspectionMode` (string, optional) - Inspection level:
  - `summary` - Fast overview with collection counts
  - `properties` - All object properties with descriptions
  - `collection` - Specific collection items (requires collectionName)
  - `xppcode` - Extract X++ source code (requires codeTarget)
- `collectionName` (string, optional) - Required when inspectionMode='collection'
- `codeTarget` (string, optional) - Required when inspectionMode='xppcode':
  - `methods` - Extract all method source code
  - `specific-method` - Single method (requires methodName)
  - `event-handlers` - Event handler methods only
- `methodName` (string, optional) - Required when codeTarget='specific-method'
- `maxCodeLines` (number, optional) - Limit lines of source code per method
- `filterPattern` (string, optional) - Wildcard filter for results

**Examples:**
```javascript
// Get object summary
inspect_xpp_object({"objectName": "CustTable", "inspectionMode": "summary"})

// Extract specific method source code
inspect_xpp_object({
  "objectName": "SalesLine", 
  "objectType": "AxTable", 
  "inspectionMode": "xppcode", 
  "codeTarget": "specific-method", 
  "methodName": "validateWrite"
})
```

### Object Modification

#### `execute_object_modification` ✨ **ENHANCED WITH BATCH PROCESSING**
Executes modification methods on existing D365 objects with array-based batch processing. **Always use array format** - single operations use array with one element.

**📋 BEST PRACTICE**: Group ALL modifications for the same object into ONE call instead of making separate calls. This provides better performance, error handling, and transactional integrity.

**Parameters:**
- `objectType` (string, required) - D365 object type (e.g., 'AxTable', 'AxClass', 'AxForm')
- `objectName` (string, required) - Name of existing object to modify
- `modifications` (array, required) - Array of modification operations:
  - `methodName` (string, required) - Modification method to execute
  - `parameters` (object, required) - Method-specific parameters including:
    - `concreteType` (string, required) - Exact type from discover_modification_capabilities
    - `Name` (string) - Field/object name (use 'Name' not 'fieldName')
    - Other D365-specific parameters as required

**✅ Features:**
- **Per-operation tracking**: Each operation returns individual success/failure status
- **Detailed error reporting**: Clear validation messages for failed operations
- **Sequential processing**: Operations execute in order with timing information
- **Batch efficiency**: Multiple operations in single service call

**Examples:**

✅ **Single field (array with one element):**
```javascript
execute_object_modification({
  "objectType": "AxTable",
  "objectName": "CustTable",
  "modifications": [
    {
      "methodName": "AddField",
      "parameters": {
        "concreteType": "AxTableFieldString",
        "Name": "MyCustomField",
        "Label": "My Custom Field",
        "HelpText": "Custom field description",
        "SaveContents": "Yes",
        "Mandatory": "No",
        "AllowEditOnCreate": "Yes",
        "AllowEdit": "Yes",
        "Visible": "Yes",
        "AosAuthorization": "None",
        "MinReadAccess": "Auto",
        "IgnoreEDTRelation": "No",
        "Null": "Yes",
        "IsSystemGenerated": "No",
        "IsManuallyUpdated": "No",
        "IsObsolete": "No",
        "GeneralDataProtectionRegulation": "None",
        "SysSharingType": "Duplicate"
      }
    }
  ]
})
```

⭐ **Multiple fields in one batch (PREFERRED):**
```javascript
execute_object_modification({
  "objectType": "AxTable",
  "objectName": "CustTable",
  "modifications": [
    {
      "methodName": "AddField",
      "parameters": {
        "concreteType": "AxTableFieldString",
        "Name": "CustomerCategory",
        "Label": "Customer Category",
        "HelpText": "Customer classification category",
        "SaveContents": "Yes",
        "Mandatory": "No",
        "AllowEditOnCreate": "Yes",
        "AllowEdit": "Yes",
        "Visible": "Yes",
        "AosAuthorization": "None",
        "MinReadAccess": "Auto",
        "IgnoreEDTRelation": "No",
        "Null": "Yes",
        "IsSystemGenerated": "No",
        "IsManuallyUpdated": "No",
        "IsObsolete": "No",
        "GeneralDataProtectionRegulation": "None",
        "SysSharingType": "Duplicate"
      }
    },
    {
      "methodName": "AddField", 
      "parameters": {
        "concreteType": "AxTableFieldInt",
        "Name": "CustomerPriority",
        "Label": "Customer Priority",
        "HelpText": "Priority level for customer",
        "SaveContents": "Yes",
        "Mandatory": "No",
        "AllowEditOnCreate": "Yes",
        "AllowEdit": "Yes",
        "Visible": "Yes",
        "AosAuthorization": "None",
        "MinReadAccess": "Auto",
        "IgnoreEDTRelation": "No",
        "Null": "Yes",
        "IsSystemGenerated": "No",
        "IsManuallyUpdated": "No",
        "IsObsolete": "No",
        "GeneralDataProtectionRegulation": "None",
        "SysSharingType": "Duplicate"
      }
    }
  ]
})
```

**📊 Response Format:**
The tool returns detailed per-operation results:
```json
{
  "summary": "2 succeeded, 1 failed (3 total)",
  "targetObject": "AxTable:CustTable",
  "operations": [
    {
      "methodName": "AddField",
      "success": true,
      "processingTime": "371ms",
      "message": "Successfully executed AddField on AxTable:CustTable"
    },
    {
      "methodName": "AddField",
      "success": false,
      "processingTime": "0ms",
      "error": "Parameter validation failed: Missing required parameters"
    }
  ]
}
```

**💡 Tips:**
- Use `discover_modification_capabilities` first to get exact parameter requirements
- All D365 table fields require parameters like `SaveContents`, `Mandatory`, etc.
- Group related modifications together for better performance
- Check individual operation results for debugging failed operations

#### `discover_modification_capabilities`
Discovers available modification methods for D365 object types.

**Parameters:**
- `objectType` (string, required) - D365 object type to analyze

### System Management

#### `get_current_config`
Returns comprehensive server configuration and status information.

#### `build_object_index`
Builds or updates the searchable object index.

**Parameters:**
- `objectType` (string, optional) - Specific object type to index
- `forceRebuild` (boolean, optional) - Force complete rebuild

## Supported Object Types

Common D365 object types supported:
- **AxClass** - X++ classes
- **AxTable** - Data tables  
- **AxForm** - User interface forms
- **AxEnum** - Enumerations
- **AxEdt** - Extended data types
- **AxView** - Database views
- **AxQuery** - Data queries
- **AxReport** - SSRS reports
- **AxMenuItemDisplay** - Menu items
- **AxDataEntityView** - OData entities

The system supports 544+ object types total.

## Build Scripts

The `build-and-run.ps1` script provides unified project management:

```powershell
# Setup VS2022 integration
.\tools\build-and-run.ps1 -Action setup

# Build both TypeScript and C# components
.\tools\build-and-run.ps1 -Action build

# Run the MCP server
.\tools\build-and-run.ps1 -Action run -Target mcp

# Run the C# service
.\tools\build-and-run.ps1 -Action run -Target csharp

# Run tests
.\tools\build-and-run.ps1 -Action test

# Clean builds
.\tools\build-and-run.ps1 -Action clean
```

## Example Workflows

### Creating a New Class
```bash
# Create a custom class
create_xpp_object {
  "objectName": "MyBusinessLogic",
  "objectType": "AxClass",
  "layer": "usr"
}

# Add a method to the class
execute_object_modification {
  "objectType": "AxClass",
  "objectName": "MyBusinessLogic",
  "methodName": "AddMethod",
  "parameters": {
    "methodName": "processData",
    "returnType": "void",
    "source": "public void processData() { }"
  }
}
```

### Searching and Analyzing Objects
```bash
# Find customer-related objects
search_objects_pattern {
  "pattern": "Cust*",
  "objectType": "AxTable",
  "limit": 20
}

# Analyze a specific table
inspect_xpp_object {
  "objectName": "CustTable",
  "objectType": "AxTable",
  "inspectionMode": "summary"
}

# Extract method source code
inspect_xpp_object {
  "objectName": "CustTable",
  "objectType": "AxTable",
  "inspectionMode": "xppcode",
  "codeTarget": "specific-method",
  "methodName": "validateWrite"
}
```

## Technical Details

### Performance Characteristics
- Object indexing: Processes 70K+ objects in ~30 seconds
- Query response time: <50ms for most operations
- Search operations: Sub-second response for large codebases
- Memory usage: Optimized SQLite-based caching

### File Type Support
- `.xpp` - X++ source files
- `.xml` - Metadata and configuration files
- `.json` - Configuration files
- Other D365 development files

### Security
- Path validation prevents directory traversal
- Operations restricted to configured D365 codebase
- File size limits for resource management
- Input validation on all parameters

## Troubleshooting

### Common Issues

**"VS2022 extension not found"**
- Ensure Dynamics 365 Development Tools are installed in VS2022
- Run the setup script: `.\tools\build-and-run.ps1 -Action setup`

**"Named pipe connection failed"**  
- Check that the C# service is running
- Verify Windows firewall settings
- Ensure .NET Framework 4.8 is installed

**"Object not found" errors**
- Build the object index: `build_object_index`
- Verify D365 codebase path configuration
- Check that the object exists in the specified model

**"Pattern validation failed" for forms**
- ✅ **RESOLVED**: This issue has been fixed in the latest version
- Forms with patterns like DetailsMaster now automatically include required field controls
- Use the `create_form` tool instead of `create_xpp_object` for better form creation

**"Form creation without datasources fails"**
- Most patterns work fine without datasources (e.g., DetailsMaster, Dialog patterns)
- Use `create_form` with `"mode": "list_patterns"` to see pattern requirements
- DataSources are optional for most patterns but enhance functionality when provided

### Getting Help
- Check the `logs/` folder for detailed error information
- Use `get_current_config` to verify system configuration
- Report issues on the GitHub repository

## Contributing

This project welcomes contributions. Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

Note that APIs may change as the project evolves.

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is provided "as is" without warranty. It is intended for research and development purposes only, not for production use. 

**Important Notes:**
- Requires Visual Studio 2022 and D365 development tools
- Integration with Microsoft APIs is not officially supported
- Features may change or break between versions
- Use at your own risk in development environments only

Report issues or contribute improvements through the GitHub repository.