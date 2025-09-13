
# MCP X++ Server

A Model Context Protocol (MCP) server for Microsoft Dynamics 365 Finance & Operations development. This tool enables D365 object creation, modification, and analysis through the MCP standard, allowing integration with various development environments.

**Date:** September 13, 2025  
**Status:** Functional with VS2022 service integration

## Overview

This MCP server provides D365 F&O development capabilities including:

- **Object Creation**: Support for D365 classes, tables, forms, enums, and 544+ other object types
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

The server provides 8 tools for D365 development:

1. **create_xpp_object** - Create D365 objects (classes, tables, forms, etc.)
2. **execute_object_modification** - Modify existing objects (add methods, fields)
3. **discover_modification_capabilities** - Explore available modification methods
4. **find_xpp_object** - Find specific objects by name/type
5. **search_objects_pattern** - Pattern search with wildcard support
6. **inspect_xpp_object** - Object analysis with X++ source code extraction
7. **get_current_config** - System configuration and status
8. **build_object_index** - Index management for search performance

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

**Parameters:**
- `objectName` (string) - Name of the D365 object
- `objectType` (string) - Object type (AxClass, AxTable, AxForm, AxEnum, etc.)
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

#### `execute_object_modification`
Executes modification methods on existing D365 objects.

**Parameters:**
- `objectType` (string, required) - D365 object type
- `objectName` (string, required) - Name of existing object to modify
- `methodName` (string, required) - Modification method to execute
- `parameters` (object, optional) - Method-specific parameters

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