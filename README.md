
# MCP X++ Codebase Server

**Status:** Experimental Open Source Project  
**Date:** August 29, 2025  
**Purpose:** Research and Development - Not for Production Use

**Current State**: Experimental Microsoft API integration for D365 object creation using Microsoft assemblies.

> **⚠️ Important Notice**: This is an experimental open source project for research and educational purposes only. It is not intended for production use and may have bugs, incomplete features, or unexpected behavior. Use at your own risk.

## 🏗️ Experimental Architecture: IDE-Agnostic Design with VS2022 Integration

**Research Goal**: This experimental project explores leveraging Microsoft's VS2022 extension assemblies for D365 API access while providing universal access through the Model Context Protocol (MCP).

### Experimental Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP X++ Codebase Server                  │
│              (Node.js/TypeScript - STDIO)                  │
│  • File browsing, searching, indexing                      │
│  • MCP protocol implementation                             │
│  • Client request routing                                  │
│  • IDE-AGNOSTIC: Works with ANY MCP-compatible client      │
└─────────────────────┬───────────────────────────────────────┘
                      │ Named Pipes Communication
                      │ <1ms latency, Windows IPC optimized
┌─────────────────────▼───────────────────────────────────────┐
│                D365 Metadata Service                       │
│              (C# .NET 4.8 - Named Pipes)                  │
│  ┌─────────────────────────────────────────────────────────┤
│  │ • NamedPipeServer.cs - High-performance IPC layer     │
│  │ • D365ObjectFactory.cs - Microsoft API integration     │
│  │ • ServiceModels.cs - Protocol definitions              │
│  │ • Program.cs - Service host with graceful shutdown     │
│  └─────────────────────────────────────────────────────────┤
│  Configuration:                                            │
│  • Pipe: mcp-xpp-d365-service, Max 50 connections         │
│  • JSON message protocol with newline delimiters          │
│  • Comprehensive error handling and logging               │
└─────────────────────┬───────────────────────────────────────┘
                      │ Direct Microsoft API Calls
                      │ Microsoft.Dynamics.AX.Metadata.Core.dll
┌─────────────────────▼───────────────────────────────────────┐
│            Microsoft Dynamics 365 F&O Platform            │
│                 (Full 467+ Object Types)                   │
│  • AxClass, AxTable, AxEnum, AxView, AxReport, AxQuery     │
│  • Native validation, compilation, deployment              │
│  • Complete feature set including inheritance, methods     │
└─────────────────────────────────────────────────────────────┘
```

### IDE-Agnostic Experiment

**Research Scope**: The MCP protocol enables this experimental D365 object creation capability to work with:
- **Claude Desktop** (Anthropic's official client)
- **VS Code with MCP extensions** 
- **Any IDE** that supports Model Context Protocol
- **Custom tooling** and automation scripts
- **Future MCP clients** and integrations

**VS2022 Assembly Integration (Experimental)**: 
- Uses Microsoft's D365 assemblies for API compatibility testing
- Provides similar object creation capabilities as VS2022 extension
- **No Visual Studio dependency** for runtime operation (experimental)
- Maintains compatibility with D365 development workflow (where tested)
- Enables D365 development exploration in various IDE environments

**⚡ Performance Characteristics (Experimental)**:
- **Measured performance** improvements over VS2022 extension baseline (9-20ms vs 500-2000ms)
- **Object type support** for 467+ object types (vs ~50 in template-based approaches)
- **Windows Named Pipes** for local IPC performance testing
- **Microsoft APIs** for D365 object creation experiments

### 🎯 Research Overview

**Problem Explored**: Traditional D365 development has been limited to Visual Studio 2022, restricting developer choice and integration possibilities.

**Experimental Approach**: Investigate extracting Microsoft's D365 API capabilities while making them accessible through MCP.

**Implementation Notes**: 
- **Setup requires VS2022**: Only to access Microsoft's D365 assemblies during initial configuration
- **Runtime is IDE-independent**: Once configured, the service runs independently of Visual Studio (experimental)
- **Development flexibility**: Explore creating D365 objects from Claude Desktop, VS Code, or any MCP client
- **Compatibility testing**: Generated objects tested for compatibility with existing D365 development workflows

This experimental architecture explores enterprise-grade Microsoft API access through modern, protocol-based integration patterns.

## 🎯 **Tool Optimization & Performance**

**Streamlined Architecture**: The MCP X++ Server has been optimized from **15 original tools** down to **5 core tools** (67% reduction) while maintaining full functionality and improving usability.

**Key Achievements**:
- **📉 67% Tool Reduction**: Eliminated redundancy without losing functionality
- **🚀 Enhanced Performance**: DLL-based indexing processes 70K+ objects in ~30 seconds
- **🔄 Unified Search**: Single `search_objects_pattern` tool handles multiple use cases
- **📊 Structured Output**: JSON format perfect for AOT tree building and VS Code plugins
- **🎨 Better UX**: Consolidated tools with comprehensive examples and documentation

**Before vs After Optimization**:
```
Before: 15 specialized tools with overlapping functionality
After:  5 unified tools with enhanced capabilities
        ├── create_xpp_object (Object creation)
        ├── find_xpp_object (Object discovery)  
        ├── search_objects_pattern (Pattern search + AOT tree building)
        ├── get_current_config (System configuration)
        └── build_object_index (Index management)
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

## 🏆 Current Experimental Status

### ✅ D365 Object Creation (Experimental)
- **Microsoft API Integration**: Using `Microsoft.Dynamics.AX.Metadata.dll` assemblies (experimental)
- **Physical File Creation**: Creates D365 metadata files on disk (tested in limited scenarios)
- **Performance**: Sub-second class creation (411ms in test environment)
- **Self-contained Operation**: No external API dependencies (in tested scenarios)

### ✅ Implemented Technologies (Experimental)
- **C# Service**: Named Pipes service with Microsoft API integration (prototype)
- **MetadataProviderFactory**: Using `CreateDiskProvider()` for dual-path configuration (experimental)
- **Template-First Architecture**: Experimental approach for automated object generation

### 🎯 Current Capabilities (Experimental)

#### **AxClass Creation** (Prototype Implementation)
```csharp
// Example: Experimental D365 class file creation
POST /create
{
  "Action": "create",
  "ObjectType": "AxClass", 
  "Parameters": {
    "name": "MyTestClass",
    "model": "cc"
  }
}
// Result: Physical XML files created in metadata structure (tested in limited scenarios)
```

#### **File System Integration (Experimental)**
- Reads from: `PackagesLocalDirectory` (D365 installation)
- Writes to: `CustomMetadataPath` (custom metadata folder)
- Both paths automatically managed by Microsoft API (experimental implementation)

#### **MCP Server Foundation (Experimental)**
- Basic file system browsing and navigation (prototype)
- File reading with size limits (experimental implementation)
- Text search across X++ codebase (basic functionality)
- Object existence validation (limited testing)

## 🚀 Experimental Architecture

### Design Principles (Research Goals)
- **Performance Priority**: Sub-500ms object creation target (achieved: 411ms in test environment)
- **Self-Sufficiency**: Works offline without external APIs (experimental)
- **Single Source of Truth**: Microsoft API as authoritative source (prototype)
- **Physical File Generation**: Metadata files compatible with D365 (limited testing)

### Microsoft API Integration (Experimental)
```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server (Node.js)                │
│                  ┌─────────────────────┐               │
│                  │   File Operations   │               │ 
│                  │   Search & Browse   │               │
│                  └─────────────────────┘               │
└─────────────────────────┬───────────────────────────────┘
                         │ Named Pipes (Windows IPC)
┌─────────────────────────▼───────────────────────────────┐
│              C# Metadata Service                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │        Real Microsoft APIs                      │   │
│  │  Microsoft.Dynamics.AX.Metadata.dll            │   │
│  │  MetadataProviderFactory.CreateDiskProvider()   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────┘
                         │
           ┌──────────────▼──────────────┐
           │     Physical D365 Files     │
           │                            │
           │  *.xml metadata files      │
           │  XPP compiler files        │
           │  Compatible with VS2022    │
           └────────────────────────────┘
```

#### Phase 5: Enterprise Integration (Q2 2026+)
* Production deployment (planned)
* Lifecycle management (planned)
* Compliance and governance (planned)
* Performance optimization (planned)
* Multi-tenant support (planned)


## Technical Overview

This MCP server provides:
- JSON-formatted responses for programmatic integration
- Real-time object indexing with 70K+ object support
- Advanced search capabilities with prioritization
- Security validation to restrict access within the configured codebase
- File size limits and result pagination for performance
- Recognition of common X++ file types (.xpp, .xml, etc.)
- Comprehensive test coverage with both mock and real integration tests

*Note: Advanced code analysis and automation features continue to be developed.*

## Current Capabilities

- **Real D365 Integration**: Connects to actual PackagesLocalDirectory with 70K+ objects
- **JSON API Responses**: Structured JSON responses for all tool operations
- **Advanced Object Indexing**: Fast indexing and retrieval of 31K+ classes, 6K+ tables
- **Smart Search**: Multi-strategy search with object and file content prioritization
- **Security-validated Operations**: All file operations validated against configured paths
- **Performance Optimized**: Response times under 600ms for large codebases
- **Comprehensive Testing**: Both mock unit tests and real D365 integration tests

*Note: Advanced analysis, relationship parsing, and intelligent code understanding continue to be enhanced.*

## Features

**Note:** All features are experimental and under active development. Feedback and bug reports are welcome.

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

*Note: Advanced code parsing, relationship analysis, and intelligent object understanding is planned for future development phases.*

## Documentation

Comprehensive documentation is available in the `docs/` folder:

- [Unified Developer Experience Guide](docs/UNIFIED_DEVELOPER_EXPERIENCE_GUIDE_Version2.md) - Complete guide for development workflows, best practices, and integration patterns

## Available Tools

The MCP X++ Server provides **5 optimized tools** for D365 F&O codebase analysis and object management. The tool set has been consolidated from the original 15 tools to eliminate redundancy while maintaining full functionality.

### 🏗️ Object Creation
#### `create_xpp_object`
Create D365 F&O objects using template-first architecture with VS2022 service integration. Supports 544+ object types including classes, tables, forms, enums, data entities, reports, workflows, services, and more.
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

### 📁 File Operations
#### `read_xpp_file_content`
Read X++ file contents with security validation and size limits.
- **Parameters**: `filePath` (string, required) - Relative path to file from codebase root
- **Returns**: File contents with encoding detection and metadata
- **Limits**: 500KB maximum file size with security path validation
- **Use Case**: View X++ source code, XML metadata, and configuration files

## 🔄 Tool Consolidation History

The tool set has been systematically optimized from **15 original tools** down to **5 core tools** (67% reduction) while maintaining full functionality:

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

## Project Architecture

### Modular Architecture (5 Core Modules)

**Server Management:**
- `src/index.ts` - Main entry point and server initialization
- `src/modules/server-manager.ts` - Server lifecycle and request handling
- `src/modules/tool-definitions.ts` - MCP tool schema definitions (12 tools)
- `src/modules/tool-handlers.ts` - Tool implementation and request routing

**Core Functionality:**
- `src/modules/config-loader.ts` - Centralized configuration with caching
- `src/modules/object-index.ts` - High-performance object indexing
- `src/modules/file-utils.ts` - Secure file system operations
- `src/modules/parsers.ts` - X++ code analysis and parsing
- `src/modules/search.ts` - Multi-strategy search implementation

**Supporting Systems:**
- `src/modules/logger.ts` - Request/response logging with JSON serialization
- `src/modules/object-creators.ts` - D365 object generation templates
- `src/modules/aot-structure.ts` - AOT structure management
- `src/modules/app-config.ts` - Application configuration
- `src/modules/cache.ts` - Performance optimization

### Configuration System

**JSON Configuration Files:**
- `config/d365-aot-structure.json` - AOT object type definitions and structure
- `config/d365-model-config.json` - D365 model templates and metadata
- `config/d365-object-templates.json` - Object creation templates

**Environment Variables:**
- `XPP_CODEBASE_PATH` - Primary D365 codebase path
- `XPP_METADATA_FOLDER` - Custom metadata directory
- `WRITABLE_METADATA_PATH` - Output path for generated objects

### Build and Test Structure
- `build/` - Compiled TypeScript output with source maps
- `tests/` - Vitest test suite (23 tests)
  - `integration-real.test.js` - Real D365 integration tests (6 tests)
  - `test-config.js` - Centralized test configuration
- `cache/` - Runtime index cache files

## Development Commands
- `npm run build`: Build the TypeScript project to JavaScript
- `npm start`: Run the compiled MCP server
- `npm test`: Run comprehensive test suite (23 tests including real D365 integration)
- `npm run test:watch`: Run tests in watch mode for development
- `npm run test:ui`: Open Vitest web interface for interactive testing

## Testing Architecture
The project includes comprehensive testing with both mock and real integration tests:

**Mock Unit Tests (17 tests):**
- JSON response format validation
- Tool logic testing with controlled data
- Parser functionality with simulated X++ content
- Error handling and security validation
- Performance testing with mock scenarios

**Real Integration Tests (6 tests):**
- **NO MOCKS** - Uses actual D365 environment from `.vscode/mcp.json`
- Tests real 70K+ object indexing
- Validates JSON responses with actual D365 data (31K+ classes, 6K+ tables)
- Verifies configuration loading and path validation
- Tests real directory structure (169 D365 packages)
- Validates JSON serialization with Windows paths and special characters

**Test Results:**
- ✅ All 23 tests passing
- ⚡ Fast execution: Mock tests <1s, Integration tests ~600ms
- 🔍 Real D365 data: Tests against actual PackagesLocalDirectory
- 📊 Comprehensive coverage: From unit logic to end-to-end integration

### Security Features

- **Path Traversal Prevention**: Comprehensive validation against `../../../etc/passwd` attacks
- **File Size Limits**: Maximum 500KB per file with graceful handling
- **Result Limits**: Configurable pagination with totalCount metadata
- **JSON Injection Protection**: Safe serialization of Windows paths and special characters
- **Environment Isolation**: All operations restricted to configured D365 codebase path

### Performance Metrics

Real-world performance with actual D365 environment:
- **Index Loading**: 72,708 objects loaded in ~500ms
- **Object Queries**: Response time <50ms for filtered results
- **JSON Serialization**: 2,300+ character responses with complex data structures
- **Directory Scanning**: 169 D365 packages discovered and validated
- **Memory Efficiency**: Handles 31K+ classes and 6K+ tables with stable memory usage

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
> build_object_index objectType="CLASSES" forceRebuild=true
```

**3. Object Discovery and Analysis**
```bash
# List classes with pagination
> list_objects_by_type objectType="CLASSES" limit=10 sortBy="size"

# Find specific objects
> find_xpp_object objectName="CustTable" objectType="TABLES"

# Analyze class structure
> get_class_methods className="CustTable"

# Analyze table structure  
> get_table_structure tableName="CustTable"
```

**4. Search and Content Discovery**
```bash
# Intelligent search with prioritization
> smart_search searchTerm="validateField" maxResults=20

# Text search in specific files
> search_files searchTerm="runbase" extensions=[".xpp"] path="Classes"

# Browse directory structure
> browse_directory path="ApplicationSuite/Tables"
```

**5. Object Creation**
```bash
# Create new class in custom layer
> create_xpp_object objectName="MyCustomClass" objectType="class" layer="cus"

# Create new model
> create_xpp_object objectName="MyModel" objectType="model" publisher="MyCompany"
```

### Example JSON Response from `list_objects_by_type`
```json
{
  "objectType": "CLASSES", 
  "totalCount": 31258,
  "objects": [
    {
      "name": "AADAuthenticationMonitoringAndDiagnostics",
      "package": "ApplicationFoundation", 
      "path": "/ApplicationFoundation/AAD/Classes/AADAuth.xml",
      "size": 2048
    },
    {
      "name": "CustTable",
      "package": "ApplicationSuite",
      "path": "/ApplicationSuite/Tables/CustTable.xml", 
      "size": 15360
    }
  ]
}
```

### Performance Metrics
- **Index Loading**: 72,708 objects in ~500ms
- **Object Queries**: <50ms response time
- **JSON Responses**: 2,300+ character structured data
- **Directory Scanning**: 169 D365 packages validated

## Troubleshooting

**Note:** If you encounter issues, please report them as GitHub issues. This software is experimental and may have unexpected behavior.

### Common Issues

**Performance & Data Issues:**
- "No objects found": Run `build_object_index()` to index your 70K+ objects
- "Configuration not found": With automatic detection, ensure VS2022 with D365 tools is installed. For manual configuration, use `--xpp-path` argument
- "Index not built": Use `build_object_index()` - processes 70K+ objects in ~30 seconds
- "Empty JSON response": Check `totalCount` field - may indicate filtering or missing index

**Security & Path Issues:**
- "Path outside codebase": Use relative paths from PackagesLocalDirectory root
- "File too large": Server limits files to 500KB for performance
- "Access denied": Verify D365 path permissions and directory accessibility

**Integration & Testing:**
- **Run Tests**: Use `npm test` to validate your environment (includes real D365 tests)
- **Check Configuration**: Tests validate `.vscode/mcp.json` configuration automatically
- **Performance Validation**: Integration tests verify <600ms response times with real data

The server provides structured error responses in JSON format. All errors include error codes and descriptive messages for debugging.

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

This project is experimental and under active development. If you have feedback, encounter issues, or wish to contribute improvements, please use the GitHub repository to:
- Star the repository to show support
- Report issues or bugs
- Suggest features or improvements  
- Contribute code or documentation

Thank you for your interest in this experimental project.

**Note**: This is an open source research project. Advanced code parsing, relationship analysis, and intelligent object understanding are planned for future experimental development phases.
<!--=========================README TEMPLATE INSTRUCTIONS=============================
======================================================================================

- THIS README TEMPLATE LARGELY CONSISTS OF COMMENTED OUT TEXT. THIS UNRENDERED TEXT IS MEANT TO BE LEFT IN AS A GUIDE 
  THROUGHOUT THE REPOSITORY'S LIFE WHILE END USERS ONLY SEE THE RENDERED PAGE CONTENT. 
- Any italicized text rendered in the initial template is intended to be replaced IMMEDIATELY upon repository creation.

- This template is default but not mandatory. It was designed to compensate for typical gaps in Microsoft READMEs 
  that slow the pace of work. You may delete it if you have a fully populated README to replace it with.

- Most README sections below are commented out as they are not known early in a repository's life. Others are commented 
  out as they do not apply to every repository. If a section will be appropriate later but not known now, consider 
  leaving it in commented out and adding an issue as a reminder.
- There are additional optional README sections in the external instruction link below. These include; "citation",  
  "built with", "acknowledgments", "folder structure", etc.
- You can easily find the places to add content that will be rendered to the end user by searching 
within the file for "TODO".



- ADDITIONAL EXTERNAL TEMPLATE INSTRUCTIONS:
  -  https://aka.ms/StartRight/README-Template/Instructions

======================================================================================
====================================================================================-->


<!---------------------[  Description  ]------------------<recommended> section below------------------>

# mcp_xpp

<!-- 
INSTRUCTIONS:
- Write description paragraph(s) that can stand alone. Remember 1st paragraph may be consumed by aggregators to improve 
  search experience.
- You description should allow any reader to figure out:
    1. What it does?
    2. Why was it was created?
    3. Who created?
    4. What is it's maturity?
    5. What is the larger context?
- Write for a reasonable person with zero context regarding your product, org, and team. The person may be evaluating if 
this is something they can use.

How to Evaluate & Examples: 
  - https://aka.ms/StartRight/README-Template/Instructions#description
-->

IDE Agnostic MCP Server for x++

-----------------------------------------------------------------
<!-----------------------[  License  ]----------------------<optional> section below--------------------->

<!-- 
## License 
--> 

<!-- 
INSTRUCTIONS:
- Licensing is mostly irrelevant within the company for purely internal code. Use this section to prevent potential 
  confusion around:
  - Open source in internal code repository.
  - Multiple licensed code in same repository. 
  - Internal fork of public open source code.

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#license
-->

<!---- [TODO]  CONTENT GOES BELOW ------->

<!------====-- CONTENT GOES ABOVE ------->



<!-----------------------[  Getting Started  ]--------------<recommended> section below------------------>
## Getting Started

<!-- 
INSTRUCTIONS:
  - Write instructions such that any new user can get the project up & running on their machine.
  - This section has subsections described further down of "Prerequisites", "Installing", and "Deployment". 

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#getting-started
-->

<!---- [TODO]  CONTENT GOES BELOW ------->
*Description of how to install and use the code or content goes here*
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[ Prerequisites  ]-----------------<optional> section below--------------------->
### Prerequisites

<!--------------------------------------------------------
INSTRUCTIONS:
- Describe what things a new user needs to install in order to install and use the repository. 

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#prerequisites
---------------------------------------------------------->

<!---- [TODO]  CONTENT GOES BELOW ------->
There are no prerequisites required to run this code or use this repository.
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Installing  ]-------------------<optional> section below------------------>
### Installing

<!--
INSTRUCTIONS:
- A step by step series of examples that tell you how to get a development environment and your code running. 
- Best practice is to include examples that can be copy and pasted directly from the README into a terminal.

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#installing

<!---- [TODO]  CONTENT GOES BELOW ------->
This repository does not hold installable content.
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Tests  ]------------------------<optional> section below--------------------->
<!-- 
## Tests
 -->

<!--
INSTRUCTIONS:
- Explain how to run the tests for this project. You may want to link here from Deployment (CI/CD) or Contributing sections.

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#tests
-->

<!---- [TODO]  CONTENT GOES BELOW ------->
<!--

*Explain what these tests test and why* 

```
Give an example
``` 

-->
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Deployment (CI/CD)  ]-----------<optional> section below--------------------->
### Deployment (CI/CD)

<!-- 
INSTRUCTIONS:
- Describe how to deploy if applicable. Deployment includes website deployment, packages, or artifacts.
- Avoid potential new contributor frustrations by making it easy to know about all compliance and continuous integration 
    that will be run before pull request approval.
- NOTE: Setting up an Azure DevOps pipeline gets you all 1ES compliance and build tooling such as component governance. 
  - More info: https://aka.ms/StartRight/README-Template/integrate-ado

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#deployment-and-continuous-integration
-->

<!---- [TODO]  CONTENT GOES BELOW ------->
_At this time, the repository does not use continuous integration or produce a website, artifact, or anything deployed._
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Versioning and Changelog  ]-----<optional> section below--------------------->

<!-- ### Versioning and Changelog -->

<!-- 
INSTRUCTIONS:
- If there is any information on a changelog, history, versioning style, roadmap or any related content tied to the 
  history and/or future of your project, this is a section for it.

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#versioning-and-changelog
-->

<!---- [TODO]  CONTENT GOES BELOW ------->
<!-- We use [SemVer](https://aka.ms/StartRight/README-Template/semver) for versioning. -->
<!------====-- CONTENT GOES ABOVE ------->


-----------------------------------------------

<!-----------------------[  Access  ]-----------------------<recommended> section below------------------>
## Access

<!-- 
INSTRUCTIONS:
- Please use this section to reduce the all-too-common friction & pain of getting read access and role-based permissions 
  to repos inside Microsoft. Please cover (a) Gaining a role with read, write, other permissions. (b) sharing a link to 
  this repository such that people who are not members of the organization can access it.
- If the repository is set to internalVisibility, you may also want to refer to the "Sharing a Link to this Repository" sub-section 
of the [README-Template instructions](https://aka.ms/StartRight/README-Template/Instructions#sharing-a-link-to-this-repository) so new GitHub EMU users know to get 1ES-Enterprise-Visibility MyAccess group access and therefore will have read rights to any repo set to internalVisibility.

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#how-to-share-an-accessible-link-to-this-repository
-->


<!---- [TODO]  CONTENT GOES BELOW ------->

<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Contributing  ]-----------------<recommended> section below------------------>
## Contributing

<!--
INSTRUCTIONS: 
- Establish expectations and processes for existing & new developers to contribute to the repository.
  - Describe whether first step should be email, teams message, issue, or direct to pull request.
  - Express whether fork or branch preferred.
- CONTRIBUTING content Location:
  - You can tell users how to contribute in the README directly or link to a separate CONTRIBUTING.md file.
  - The README sections "Contacts" and "Reuse Expectations" can be seen as subsections to CONTRIBUTING.
  
How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#contributing
-->

<!---- [TODO]  CONTENT GOES BELOW ------->
_This repository prefers outside contributors start forks rather than branches. For pull requests more complicated 
than typos, it is often best to submit an issue first._

If you are a new potential collaborator who finds reaching out or contributing to another project awkward, you may find 
it useful to read these [tips & tricks](https://aka.ms/StartRight/README-Template/innerSource/2021_02_TipsAndTricksForCollaboration) 
on InnerSource Communication.
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Contacts  ]---------------------<recommended> section below------------------>
<!-- 
#### Contacts  
-->
<!--
INSTRUCTIONS: 
- To lower friction for new users and contributors, provide a preferred contact(s) and method (email, TEAMS, issue, etc.)

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#contacts
-->

<!---- [TODO]  CONTENT GOES BELOW ------->

<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Support & Reuse Expectations  ]-----<recommended> section below-------------->
 
### Support & Reuse Expectations

 
<!-- 
INSTRUCTIONS:
- To avoid misalignments use this section to set expectations in regards to current and future state of:
  - The level of support the owning team provides new users/contributors and 
  - The owning team's expectations in terms of incoming InnerSource requests and contributions.

How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#support-and-reuse-expectations
-->

<!---- [TODO]  CONTENT GOES BELOW ------->

_The creators of this repository **DO NOT EXPECT REUSE**._

If you do use it, please let us know via an email or 
leave a note in an issue, so we can best understand the value of this repository.
<!------====-- CONTENT GOES ABOVE ------->


<!-----------------------[  Limitations  ]----------------------<optional> section below----------------->

<!-- 
### Limitations 
--> 

<!-- 
INSTRUCTIONS:
- Use this section to make readers aware of any complications or limitations that they need to be made aware of.
  - State:
    - Export restrictions
    - If telemetry is collected
    - Dependencies with non-typical license requirements or limitations that need to not be missed. 
    - trademark limitations
 
How to Evaluate & Examples:
  - https://aka.ms/StartRight/README-Template/Instructions#limitations
-->

<!---- [TODO]  CONTENT GOES BELOW ------->

<!------====-- CONTENT GOES ABOVE ------->

--------------------------------------------


<!-----------------------[  Links to Platform Policies  ]-------<recommended> section below-------------->
## How to Accomplish Common User Actions
<!-- 
INSTRUCTIONS: 
- This section links to information useful to any user of this repository new to internal GitHub policies & workflows.
-->

 If you have trouble doing something related to this repository, please keep in mind that the following actions require 
 using [GitHub inside Microsoft (GiM) tooling](https://aka.ms/gim/docs) and not the normal GitHub visible user interface!
- [Switching between EMU GitHub and normal GitHub without logging out and back in constantly](https://aka.ms/StartRight/README-Template/maintainingMultipleAccount)
- [Creating a repository](https://aka.ms/StartRight)
- [Changing repository visibility](https://aka.ms/StartRight/README-Template/policies/jit) 
- [Gaining repository permissions, access, and roles](https://aka.ms/StartRight/README-TEmplates/gim/policies/access)
- [Enabling easy access to your low sensitivity and widely applicable repository by setting it to Internal Visibility and having any FTE who wants to see it join the 1ES Enterprise Visibility MyAccess Group](https://aka.ms/StartRight/README-Template/gim/innersource-access)
- [Migrating repositories](https://aka.ms/StartRight/README-Template/troubleshoot/migration)
- [Setting branch protection](https://aka.ms/StartRight/README-Template/gim/policies/branch-protection)
- [Setting up GitHubActions](https://aka.ms/StartRight/README-Template/policies/actions)
- [and other actions](https://aka.ms/StartRight/README-Template/gim/policies)

This README started as a template provided as part of the 
[StartRight](https://aka.ms/gim/docs/startright) tool that is used to create new repositories safely. Feedback on the
[README template](https://aka.ms/StartRight/README-Template) used in this repository is requested as an issue. 

<!-- version: 2023-04-07 [Do not delete this line, it is used for analytics that drive template improvements] -->
