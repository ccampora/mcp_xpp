
# MCP X++ Codebase Server

**Status:** Functional D365 Object Management System  
**Date:** September 9, 2025  
**Purpose:** MCP-compatible D365 F&O development tools

**Current State**: Working D365 object creation and modification system with VS2022 service integration.

## Features

✅ **Object Creation**: Create D365 classes, tables, forms, enums, and 553+ other object types  
✅ **Object Modification**: Add methods, fields, and other modifications to existing objects  
✅ **Discovery Tools**: Browse and search through D365 codebase with pattern matching  
✅ **MCP Integration**: Works with Claude Desktop, VS Code, and any MCP-compatible client  
✅ **Performance**: Fast object operations (300-500ms) using direct VS2022 APIs

## 🏗️ Architecture: MCP-Compatible D365 Development

**Design**: This system provides D365 F&O object management through the Model Context Protocol (MCP), enabling D365 development from any MCP-compatible client.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP X++ Server                           │
│              (Node.js/TypeScript - STDIO)                  │
│  • Object creation (553+ D365 types)                       │
│  • Object modification (methods, fields, properties)       │
│  • File browsing, searching, indexing                      │
│  • MCP protocol implementation                             │
│  • Works with Claude Desktop, VS Code, any MCP client      │
└─────────────────────┬───────────────────────────────────────┘
                      │ Named Pipes Communication
                      │ High-performance Windows IPC
┌─────────────────────▼───────────────────────────────────────┐
│                D365 Metadata Service                       │
│              (C# .NET 4.8 - Named Pipes)                  │
│  ┌─────────────────────────────────────────────────────────┤
│  │ • D365ObjectFactory - Object creation APIs             │
│  │ • DynamicD365ReflectionService - Object modification   │
│  │ • ExecuteObjectModificationHandler - Method execution  │
│  │ • DiscoverModificationCapabilitiesHandler - Discovery  │
│  └─────────────────────────────────────────────────────────┤
│  • Named Pipe: mcp-xpp-d365-service                       │
│  • JSON protocol with comprehensive error handling         │
│  • Dynamic reflection for runtime modifications            │
└─────────────────────┬───────────────────────────────────────┘
                      │ Direct Microsoft API Integration
                      │ Microsoft.Dynamics.AX.Metadata.*.dll
┌─────────────────────▼───────────────────────────────────────┐
│            Microsoft Dynamics 365 F&O Platform            │
│                   (553+ Object Types)                      │
│  • AxClass, AxTable, AxEnum, AxView, AxReport, AxQuery     │
│  • Object creation, modification, validation               │
│  • Complete D365 development capabilities                  │
└─────────────────────────────────────────────────────────────┘
```

### MCP Integration

**Client Compatibility**: The MCP protocol enables D365 development from any compatible client:
- **Claude Desktop** - Anthropic's official MCP client
- **VS Code with MCP extensions** - Microsoft's editor with MCP support
- **Any MCP-compatible client** - Claude Desktop, VS Code, and other MCP clients
- **Custom automation scripts** - Programmatic D365 object management

**VS2022 API Integration**: 
- Uses Microsoft's D365 assemblies for full API compatibility
- Provides same object creation and modification capabilities as VS2022
- **Runtime independent** of Visual Studio (after initial setup)
- Maintains full compatibility with D365 development workflows
- Enables D365 development from any preferred development environment

**⚡ Performance Characteristics**:
- **Fast object operations**: 300-500ms for creation and modification
- **553+ object type support**: Complete D365 F&O object catalog
- **Windows Named Pipes**: High-performance local IPC
- **Direct Microsoft APIs**: Native D365 integration without compromises

### 🎯 System Overview

**Problem Solved**: Traditional D365 development was limited to Visual Studio 2022, restricting developer choice and automation possibilities.

**Solution**: MCP X++ Server provides D365 development capabilities through the Model Context Protocol, enabling object management from any compatible client.

**Key Benefits**: 
- **Setup requires VS2022**: Only for accessing Microsoft's D365 assemblies during configuration
- **Runtime independence**: Service operates without Visual Studio dependency
- **Multi-client support**: Create and modify D365 objects from Claude Desktop, VS Code, or custom tools
- **Full compatibility**: Generated objects work seamlessly in existing D365 development workflows
- **Complete functionality**: Object creation, modification, and discovery with 553+ object type support

This system demonstrates enterprise-grade Microsoft API integration through modern, protocol-based patterns.

## 🎯 **Tool Optimization & Performance**

**Streamlined Architecture**: The MCP X++ Server has been optimized from **15 original tools** down to **5 core tools** (67% reduction) while maintaining full functionality and improving usability.

**Key Achievements**:
- **📉 53% Tool Reduction**: Eliminated redundancy from 15 to 7 tools while maintaining full functionality
- **🚀 Enhanced Performance**: DLL-based indexing processes 70K+ objects in ~30 seconds
- **🔄 Unified Search**: Single `search_objects_pattern` tool handles multiple use cases
- **📊 Structured Output**: JSON format perfect for AOT tree building and VS Code plugins
- **🎨 Better UX**: Consolidated tools with comprehensive examples and documentation

**Complete Tool Set**:
```
MCP X++ Server Tools (7 total):
├── create_xpp_object (Create D365 objects - classes, tables, forms, etc.)
├── execute_object_modification (Modify existing objects - add methods, fields)
├── discover_modification_capabilities (Explore available modification methods)
├── find_xpp_object (Find specific objects by name/type)
├── search_objects_pattern (Pattern search + AOT tree building)
├── get_current_config (System configuration and status)
└── build_object_index (Index management and performance)
```

**Performance Highlights**:
- **SQLite-Based**: Pure database architecture with persistent caching
- **C# DLL Integration**: Direct Microsoft API access for maximum performance
- **Smart Caching**: Incremental updates and optimized query patterns
- **JSON Output**: Structured data ready for programmatic consumption

## 🚀 Quick Start for New Users

### Prerequisites
1. **Visual Studio 2022** (Community, Professional, or Enterprise)
2. **Dynamics 365 Development Tools** for Visual Studio 2022
3. **Node.js** (for the MCP server)
4. **.NET Framework 4.8** (usually included with Windows)

### One-Command Setup
```powershell
# Clone and setup everything automatically
git clone <your-repo-url>
cd mcp_xpp
.\tools\build-and-run.ps1 -Action all
```

### Available Commands
The unified `build-and-run.ps1` script supports multiple actions and targets:

```powershell
# First-time setup only
.\tools\build-and-run.ps1 -Action setup

# Build both projects
.\tools\build-and-run.ps1 -Action build

# Build and run C# service
.\tools\build-and-run.ps1 -Action run -Target csharp

# Build and run MCP server
.\tools\build-and-run.ps1 -Action run -Target mcp

# Run tests
.\tools\build-and-run.ps1 -Action test

# Clean all builds
.\tools\build-and-run.ps1 -Action clean

# Complete setup, build, test, and run
.\tools\build-and-run.ps1 -Action all

# Get help with all options
.\tools\build-and-run.ps1 -Help
```

### Parameters
- **Action**: `setup`, `build`, `run`, `test`, `clean`, `all`
- **Target**: `mcp`, `csharp`, `both` (default: both)  
- **Configuration**: `Debug`, `Release` (default: Release)
- **PipeName**: Named pipe for service communication (default: mcp-xpp-d365-service)
- **SkipSetup**: Skip VS reference setup
- **SkipRestore**: Skip package restore

### What the Setup Does
- **Automatically finds** your Visual Studio 2022 installation
- **Locates D365 development tools** extension (handles random folder names)
- **Updates project files** with correct paths for your machine
- **Verifies all required DLLs** are available
- **Builds both** TypeScript MCP server and C# metadata service
- **Configures automatic path detection** - No manual path configuration required

## Technical Overview

This MCP server provides:
- JSON-formatted responses for programmatic integration
- Real-time object indexing with 70K+ object support
- Advanced search capabilities with prioritization
- Security validation to restrict access within the configured codebase
- File size limits and result pagination for performance
- Recognition of common X++ file types (.xpp, .xml, etc.)
- Comprehensive test coverage with both mock and real integration tests

## Current Capabilities

- **Real D365 Integration**: Connects to actual PackagesLocalDirectory with 70K+ objects
- **JSON API Responses**: Structured JSON responses for all tool operations
- **Advanced Object Indexing**: Fast indexing and retrieval of 31K+ classes, 6K+ tables
- **Smart Search**: Multi-strategy search with object and file content prioritization
- **Security-validated Operations**: All file operations validated against configured paths
- **Performance Optimized**: Response times under 600ms for large codebases
- **Comprehensive Testing**: Both mock unit tests and real D365 integration tests

## Features

**Note:** This software is experimental. Feedback and bug reports are welcome.

### Core Operations
- **JSON API Responses**: All tools return structured JSON for programmatic integration
- **File system browsing**: Navigate X++ directories with comprehensive object listings
- **File reading**: Read X++ source files with size limits and encoding detection
- **Content search**: Advanced multi-strategy search across 70K+ indexed objects
- **Object discovery**: Fast retrieval from indexed database of D365 objects

### Advanced X++ Support
- **Real D365 Integration**: Direct integration with PackagesLocalDirectory structure
- **Object Type Discovery**: Automatic detection of CLASSES, TABLES, FORMS, etc.
- **Structured Responses**: JSON responses with object metadata (name, package, path, size)
- **Performance Indexing**: Optimized indexing for 31K+ classes and 6K+ tables
- **Smart Search**: Prioritized search with object matches before file content matches

### Enterprise Performance & Security
- **High-Scale Indexing**: Handles 70K+ objects with sub-second response times
- **Path Security**: Comprehensive validation preventing directory traversal attacks
- **Result Pagination**: Configurable limits with totalCount for large result sets
- **JSON Serialization**: Safe handling of special characters and Windows paths
- **Error Handling**: Graceful degradation with structured error responses
- File size limits: Configurable limits (500KB default)
- Result pagination: Limited result sets for responsiveness

## Documentation

Comprehensive documentation is available in the `docs/` folder:

- [Unified Developer Experience Guide](docs/UNIFIED_DEVELOPER_EXPERIENCE_GUIDE_Version2.md) - Complete guide for development workflows, best practices, and integration patterns

## Available Tools

The MCP X++ Server provides **7 optimized tools** for D365 F&O codebase analysis and object management. The tool set has been consolidated from the original 15 tools to eliminate redundancy while maintaining full functionality.

### 🏗️ Object Creation
#### `create_xpp_object`
Create D365 F&O objects using VS2022 service integration. Supports 553+ object types including classes, tables, forms, enums, data entities, reports, workflows, services, and more.
- **Parameters** (all optional - call without parameters to browse available types):
  - `objectName` (string) - Name of the D365 object (e.g., 'MyCustomClass', 'CustInvoiceTable')
  - `objectType` (string) - D365 object type from 544+ available types:
    - **Common**: `AxClass` (classes), `AxTable` (tables), `AxForm` (forms), `AxEnum` (enums)
    - **Data**: `AxEdt` (extended data types), `AxView` (views), `AxDataEntityView` (OData entities)
    - **UI**: `AxMenuItemDisplay`, `AxReport`, `AxQuery`, `AxWorkspace`
    - **Integration**: `AxService`, `AxWorkflowHierarchyProvider`, `AxMap`
  - `layer` (string) - Application layer: `usr` (user/custom), `cus` (customer), `var` (partner)
  - `outputPath` (string) - Output directory (default: "Models")
  - `publisher` (string) - Company name (default: "YourCompany")
  - `version` (string) - Version number (default: "1.0.0.0")
  - `dependencies` (array) - Model dependencies (default: ApplicationPlatform, ApplicationFoundation)
  - `properties` (object) - Advanced object-specific configuration
- **Returns**: Created object structure with metadata and file paths
- **Examples**: 
  - Browse types: `create_xpp_object` (no parameters)
  - Create class: `create_xpp_object objectName="MyClass" objectType="AxClass" layer="usr"`
  - Create table: `create_xpp_object objectName="MyTable" objectType="AxTable" layer="usr"`

### 🔍 Object Discovery & Search
#### `find_xpp_object`
Find and analyze X++ objects (classes, tables, forms, etc.) by name with optional type and model filtering.
- **Parameters**: 
  - `objectName` (string, required) - Name of the X++ object to find
  - `objectType` (string, optional) - Filter by object type (AxTable, AxClass, AxForm, AxEnum, etc.)
  - `model` (string, optional) - Filter by D365 model/package name
- **Returns**: Object locations with paths, models, and metadata
- **Use Case**: Validate object existence, locate object files, and analyze object relationships

#### `search_objects_pattern`
**🌟 Enhanced Tool**: Search D365 objects by name pattern using wildcards, or browse all objects in a specific model. Now supports both human-readable text and structured JSON output for AOT tree building.
- **Parameters**: 
  - `pattern` (string, required) - Search pattern with wildcards (e.g., 'Cust*', '*Table', '*Invoice*')
  - `objectType` (string, optional) - Filter by object type (AxClass, AxTable, AxForm, AxEnum, etc.)
  - `model` (string, optional) - Filter by D365 model/package name
  - `limit` (number, optional) - Maximum results to return (default: 50)
  - `format` (string, optional) - Output format: 'text' (default) or 'json'
- **Returns**: 
  - **Text format**: Human-readable search results with context and examples
  - **JSON format**: Structured data perfect for AOT tree building and programmatic use
- **Use Cases**: 
  - Pattern-based object discovery
  - Model browsing and exploration  
  - AOT tree building for VS Code plugins
  - Cross-model object analysis

**JSON Response Format for AOT Tree Building:**
```json
{
  "meta": {
    "queryType": "patternSearch|modelBrowse",
    "pattern": "search pattern",
    "objectType": "filter applied",
    "model": "target model",
    "timestamp": "2025-09-08T10:40:00.000Z",
    "duration": "4ms",
    "totalResults": 100,
    "returnedResults": 50,
    "limitApplied": true
  },
  "data": {
    "ModelName": {
      "AxTable": [
        {
          "name": "ObjectName",
          "path": "ModelName/AxTable/ObjectName",
          "model": "ModelName",
          "type": "AxTable"
        }
      ],
      "AxClass": [...]
    }
  }
}
```

**Enhanced Examples:**
```javascript
// Get all tables for AOT tree
search_objects_pattern("*", "AxTable", "", 1000, "json")

// Browse specific model structure  
search_objects_pattern("*", "", "ApplicationSuite", 500, "json")

// Pattern search with human-readable output
search_objects_pattern("Cust*", "", "", 50, "text")
```

### ⚙️ Configuration & Management
#### `get_current_config`
Get comprehensive server configuration including paths, index statistics, VS2022 service status, and models grouped by type.
- **Parameters**: None
- **Returns**: JSON with complete system information including:
  - Server configuration and paths
  - Models grouped by custom vs standard
  - VS2022 service status and connectivity
  - Index statistics and object counts
  - System summary and health status
- **Use Case**: Monitor server state, troubleshoot configuration, view model organization

#### `build_object_index`
Build or update the searchable object index for faster searches and better performance.
- **Parameters**: 
  - `objectType` (string, optional) - Specific object type to index (empty for all)
  - `forceRebuild` (boolean, optional) - Force complete rebuild (default: false)
- **Returns**: Index statistics with object counts by type
- **Performance**: Processes 70K+ objects in ~30 seconds via DLL-based C# service
- **Use Case**: Initialize search capabilities and improve query performance

### � Object Modification
#### `execute_object_modification`
Execute specific modification methods on existing D365 objects (add methods, fields, indexes, etc.).
- **Parameters**: 
  - `objectType` (string, required) - D365 object type (e.g., 'AxTable', 'AxClass', 'AxForm')
  - `objectName` (string, required) - Name of existing object to modify
  - `methodName` (string, required) - Modification method to execute (e.g., 'AddField', 'AddMethod')
  - `parameters` (object, optional) - Method-specific parameters structure
- **Returns**: Modification result with success status and details
- **Performance**: Direct VS2022 API integration for real-time object modification
- **Use Case**: Add fields to tables, methods to classes, controls to forms

#### `discover_modification_capabilities`
Discover available modification methods for any D365 object type using real-time reflection.
- **Parameters**: 
  - `objectType` (string, required) - D365 object type to analyze (e.g., 'AxTable', 'AxClass')
- **Returns**: Available modification methods with parameter descriptions and examples
- **Performance**: Real-time reflection analysis of VS2022 APIs
- **Use Case**: Explore what modifications are possible before executing them

## 🔄 Tool Consolidation History

The tool set has been systematically optimized from **15 original tools** down to **7 core tools** (53% reduction) while maintaining full functionality:

**Removed Redundant Tools:**
- `browse_directory` - Functionality merged into enhanced search capabilities
- `search_files` - Replaced by enhanced `search_objects_pattern`  
- `list_objects_by_type` - Functionality available through `search_objects_pattern` with JSON format
- `smart_search` - Consolidated into `search_objects_pattern`
- `get_class_methods` - Object analysis integrated into `find_xpp_object`
- `get_table_structure` - Object analysis integrated into `find_xpp_object`
- `discover_object_types_json` - AOT structure now available through `search_objects_pattern` JSON format
- `browse_package_objects` - Model browsing integrated into `search_objects_pattern`
- `find_object_location` - Redundant with `find_xpp_object`
- `enhanced_search` - Functionality merged into `search_objects_pattern`

**Key Enhancement - `search_objects_pattern`:**
This tool now serves as the unified interface for:
- Pattern-based object searching
- Model browsing and exploration
- AOT tree building with structured JSON output
- Object type filtering and analysis
- Both human-readable and programmatic output formats

**JSON Response Format for `get_current_config`:**
```json
{
  "_meta": {
    "type": "configuration",
    "timestamp": "2025-09-08T10:30:00.000Z",
    "version": "1.0.0"
  },
  "xppPath": "C:\\D365\\PackagesLocalDirectory",
  "xppMetadataFolder": "C:\\CustomMetadata",
  "vs2022ExtensionPath": "C:\\Program Files\\Microsoft Visual Studio\\2022\\...",
  "models": {
    "custom": [
      {
        "name": "MyCustomModel",
        "layer": "usr",
        "publisher": "MyCompany",
        "modelType": "custom",
        "reason": "Custom layer: usr"
      }
    ],
    "standard": [
      {
        "name": "ApplicationFoundation",
        "layer": "slp",
        "publisher": "Microsoft Corporation",
        "modelType": "standard",
        "reason": "Microsoft standard model in layer: slp"
      }
    ],
    "summary": {
      "totalModels": 120,
      "customCount": 5,
      "standardCount": 115,
      "customLayers": ["usr", "cus", "var"],
      "standardLayers": ["slp", "gls", "fp"],
      "publishers": ["Microsoft Corporation", "MyCompany"]
    }
  },
  "vs2022Service": {
    "status": "connected",
    "modelsCount": 120,
    "serviceModels": [...],
    "lastUpdated": "2025-09-08T10:30:00.000Z"
  },
  "indexStats": {
    "totalObjects": 72708,
    "objectTypes": {...},
    "lastUpdated": "2025-09-08T10:30:00.000Z"
  },
  "summary": {
    "totalModels": 120,
    "customModels": 5,
    "standardModels": 115,
    "indexedObjects": 72708,
    "serverStatus": "connected"
  }
}
```

**Supported Object Types:**
- AxClass, AxTable, AxForm, AxReport, AxEnum, AxEdt, AxView, AxMap, AxService, AxWorkflow, AxQuery, AxMenu, AxMenuitem, and 450+ more

**Available Application Layers:**
- usr, cus, var, isv, slp, gls, fp, sys

## Supported File Types

Recognized file extensions:
- `.xpp` - X++ source files
- `.xml` - Metadata and configuration files
- `.rnrproj` - Project files
- `.axproj` - AX project files
- `.txt`, `.md` - Documentation files
- `.json` - Configuration files

## Prerequisites

- Node.js (see [nodejs.org](https://nodejs.org/))
- Access to a Dynamics 365 F&O X++ codebase directory

## Installation and Setup

1. Install Node.js
2. Clone this repository
3. Install dependencies: `npm install`
4. Build the project: `npm run build`

## Usage

**Enhanced Configuration**: The server now integrates with a C# D365MetadataService that automatically detects VS2022 installation and D365 paths. No manual path configuration required in most cases.

### Running the Server

**Enhanced Dual Transport Support**: The server now supports both STDIO (for local IDE integration) and HTTP (for external services like Copilot Studio) transports simultaneously.

#### Transport Options

**Option 1: STDIO Only (Default - Local IDE Integration)**
```bash
node build/index.js
```
*Perfect for VS Code MCP extension and local development*

**Option 2: HTTP Only (External Services)**
```bash
node build/index.js --http-port 3001 --http-host 0.0.0.0 --no-stdio
```
*For external integrations like Copilot Studio via DevTunnel*

**Option 3: Dual Transport (Recommended for Development)**
```bash
node build/index.js --http-port 3001 --http-host 0.0.0.0
```
*Enables both local IDE integration AND external service access*

#### HTTP Transport Features

When HTTP transport is enabled:
- 🌐 **REST API**: Access tools via standard HTTP endpoints
- 🔧 **DevTunnel Ready**: Easy external access setup
- 📋 **Health Check**: `GET /health` for service monitoring
- 🛠️ **Tools API**: `GET /mcp/tools` to list available tools
- ⚡ **Tool Execution**: `POST /mcp/tools/{toolName}` for tool calls
- 🔄 **JSON-RPC**: `POST /mcp/rpc` for full MCP compatibility

#### DevTunnel Integration

For external services like Copilot Studio:
```powershell
# Start server with HTTP transport
node build/index.js --http-port 3001 --no-stdio

# Create DevTunnel for external access
devtunnel host -p 3001 --allow-anonymous
```

**HTTP Endpoint Examples:**
- Health: `https://your-tunnel-url.use.devtunnels.ms/health`
- Tools: `https://your-tunnel-url.use.devtunnels.ms/mcp/tools`
- Execute: `POST https://your-tunnel-url.use.devtunnels.ms/mcp/tools/create_xpp_object`

#### Transport Command Line Parameters

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `--http-port` | HTTP transport port | disabled | `3001` |
| `--http-host` | HTTP transport host | `0.0.0.0` | `localhost` |
| `--no-stdio` | Disable STDIO transport | false | `--no-stdio` |

**Automatic Configuration (Recommended)**
Start the MCP server with automatic path detection via VS2022 extension:
```bash
node build/index.js
```
*All D365 paths, metadata folders, and VS2022 extension paths are automatically detected from your VS2022 installation.*

**Manual Configuration (Legacy)**
For advanced scenarios or when VS2022 auto-detection fails:
```bash
node build/index.js --xpp-path "C:\path\to\PackagesLocalDirectory"
```

With optional metadata folder:
```bash
node build/index.js --xpp-path "C:\path\to\PackagesLocalDirectory" --xpp-metadata-folder "C:\custom\metadata"
```

With optional VS2022 extension path for template and icon access:
```bash
node build/index.js --xpp-path "C:\path\to\PackagesLocalDirectory" --xpp-metadata-folder "C:\custom\metadata" --vs2022-extension-path "C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions\{GUID}"
```

#### Command Line Parameters

| Parameter | Description | Required | Example |
|-----------|-------------|----------|---------|
| `--xpp-path` | Path to D365 PackagesLocalDirectory | **No*** | `C:\D365\PackagesLocalDirectory` |
| `--xpp-metadata-folder` | Custom metadata output directory | No | `C:\CustomMetadata` |
| `--vs2022-extension-path` | VS2022 D365 extension base directory | **No*** | `C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions\{GUID}` |

***Automatic Detection**: All paths are automatically detected from VS2022 extension when available. Manual parameters only needed for advanced scenarios or when auto-detection fails.

**Note**: The server automatically appends the templates subdirectory path when accessing VS2022 templates and icons.

### VS Code Integration

**Dual Transport Configuration (Recommended)**
Configure in `.vscode/mcp.json` for both local and external access:
```json
{
  "servers": {
    "mcp-xpp-server": {
      "command": "node",
      "args": [
        "./build/index.js",
        "--http-port", "3001", 
        "--http-host", "0.0.0.0"
      ],
      "cwd": "${workspaceFolder}",
      "type": "stdio"
    }
  },
  "inputs": []
}
```

**STDIO Only Configuration (Legacy)**
Configure in `.vscode/mcp.json` with automatic path detection:
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

**Manual Configuration (Legacy)**
For advanced scenarios:
```json
{
  "servers": {
    "mcp-xpp-server": {
      "command": "node",
      "args": [
        "./build/index.js",
        "--xpp-path", "C:\\path\\to\\PackagesLocalDirectory",
        "--xpp-metadata-folder", "C:\\custom\\metadata",
        "--vs2022-extension-path", "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\Extensions\\{GUID}"
      ],
      "cwd": "${workspaceFolder}",
      "type": "stdio"
    }
  }
}
```

**Note**: With automatic detection, all D365 paths are retrieved from VS2022 extension during startup. Manual configuration is only needed for custom scenarios.

### Integration with MCP Clients

To use this server with Claude Desktop, Visual Studio, or other MCP clients:
1. **Recommended**: Use automatic configuration - the server will detect all required paths from VS2022 extension
2. **Alternative**: For custom scenarios, provide the X++ codebase path via `--xpp-path` argument  
3. Use the available tools to browse and analyze your X++ code
4. Use `get_current_config` to verify server configuration and monitor index statistics

## Project Architecture

For detailed technical architecture information, module structure, testing framework, and performance metrics, see:

📋 **[Technical Architecture Guide](docs/TECHNICAL_ARCHITECTURE.md)** - Complete technical documentation

## Example Workflow

### Quick Start with Real D365 Data

**1. Server Configuration**
```bash
# Start the server with your D365 codebase path (path configured at startup)
# Server started with: node build/index.js --xpp-path "C:\\AOSService\\PackagesLocalDirectory"

# Verify configuration
> get_current_config
# Returns: paths, available layers, index statistics
```

**2. Index Building for Performance**
```bash
# Build complete object index (processes 70K+ objects)
> build_object_index

# Or build specific object type index
> build_object_index objectType="AxClass" forceRebuild=true
```

**3. Object Discovery and Analysis**
```bash
# Search for classes with pattern
> search_objects_pattern pattern="Cust*" objectType="AxClass" limit=10

# Find specific objects
> find_xpp_object objectName="CustTable" objectType="AxTable"

# Discover what modifications are possible on a table
> discover_modification_capabilities objectType="AxTable"

# Discover what modifications are possible on a class
> discover_modification_capabilities objectType="AxClass"
```

**4. Search and Content Discovery**
```bash
# Search with wildcards for invoice-related objects
> search_objects_pattern pattern="*Invoice*" maxResults=20

# Browse all objects in a specific model
> search_objects_pattern pattern="*" model="ApplicationSuite" limit=200

# Get structured JSON output for AOT tree building
> search_objects_pattern pattern="*" objectType="AxTable" format="json" limit=1000
```

**5. Object Creation and Modification**
```bash
# Create new class in custom layer
> create_xpp_object objectName="MyCustomClass" objectType="AxClass" layer="usr"

# Add a method to an existing class
> execute_object_modification objectType="AxClass" objectName="CustTable" methodName="AddMethod" parameters={"methodName": "myCustomMethod", "returnType": "void", "source": "public void myCustomMethod() { }"}

# Add a field to an existing table
> execute_object_modification objectType="AxTable" objectName="CustTable" methodName="AddField" parameters={"fieldName": "MyCustomField", "fieldType": "String", "label": "My Custom Field"}
```

### Example JSON Response from `search_objects_pattern`
```json
{
  "meta": {
    "queryType": "patternSearch",
    "pattern": "Cust*",
    "objectType": "AxClass",
    "totalResults": 156,
    "returnedResults": 50,
    "limitApplied": true,
    "duration": "4ms"
  },
  "data": {
    "ApplicationSuite": {
      "AxClass": [
        {
          "name": "CustTable",
          "path": "ApplicationSuite/AxClass/CustTable",
          "model": "ApplicationSuite",
          "type": "AxClass"
        },
        {
          "name": "CustInvoiceJour",
          "path": "ApplicationSuite/AxClass/CustInvoiceJour", 
          "model": "ApplicationSuite",
          "type": "AxClass"
        }
      ]
    }
  }
}
```

### Performance Metrics
- **Index Loading**: 72,708 objects in ~500ms
- **Object Queries**: <50ms response time
- **JSON Responses**: 2,300+ character structured data
- **Directory Scanning**: 169 D365 packages validated

## Troubleshooting

**Note:** If you encounter issues, please report them as GitHub issues. This software is experimental and may have unexpected behavior.

## Contributing

Contributions are welcome. Please fork the repository, create a feature branch, and submit a pull request. Note that APIs and functionality may change as the project evolves.

## License

MIT License - see LICENSE file for details

## Disclaimer

**⚠️ EXPERIMENTAL SOFTWARE NOTICE**

This is experimental open source software provided "as is" without warranty of any kind. This project is for research, educational, and experimental purposes only.

**Important Limitations:**
- **NOT FOR PRODUCTION USE**: This software is not intended for production environments
- **Experimental Status**: Features may be incomplete, unstable, or subject to breaking changes
- **No Support Guarantee**: Limited support is provided on a best-effort basis
- **Use at Your Own Risk**: The software may have bugs, security issues, or unexpected behavior
- **Microsoft Dependencies**: Requires Microsoft Visual Studio 2022 and D365 development tools
- **API Limitations**: Microsoft API integration is experimental and not officially supported

**Recommended Use:**
- Research and development environments only
- Educational purposes and learning
- Proof-of-concept development
- Community experimentation and feedback

By using this software, you acknowledge that it is experimental and accept full responsibility for any consequences of its use.

## Get Involved

This project is experimental. If you have feedback, encounter issues, or wish to contribute improvements, please use the GitHub repository to:
- Star the repository to show support
- Report issues or bugs
- Suggest features or improvements  
- Contribute code or documentation

Thank you for your interest in this experimental project.

**Note**: This is an open source research project for D365 F&O development tools.