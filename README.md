
# MCP X++ Codebase Server

**Status:** Experimental. This project is in early development. Use only in non-production environments.

This repository provides a Model Context Protocol (MCP) server for basic navigation and file operations on Dynamics 365 Finance and Operations (D365 F&O) X++ codebases. The server enables AI models and tools to browse directories, read files, and perform simple text searches within a configured D365 F&O codebase.


## Roadmap

### Current State (Phase 1)
* Basic file system browsing and navigation
* File reading with size limits
* Basic text search across files
* Simple object existence validation

Note: No advanced object discovery, code analysis, or project-specific features are available at this stage. Advanced features are planned for future phases, but not yet implemented.

### Planned Phases

#### Phase 1: Analysis & Discovery (Current - Q1 2025)
* Basic file system browsing and navigation
* File reading with size limits
* Basic text search across files
* Simple object existence validation
* Performance-optimized indexing (basic implementation)
* Class method parsing (limited)
* Table structure parsing (limited)

#### Phase 2: Code Generation (Q2-Q3 2025)
* X++ object creation (planned)
* Custom project management (planned)
* Code templates (planned)
* Relationship management (planned)
* Security integration (planned)
* Extension support (planned)

#### Phase 3: Project Management (Q4 2025)
* Package management (planned)
* Dependency resolution (planned)
* Version control integration (planned)
* Project templates (planned)
* ISV development support (planned)

#### Phase 4: Build & Deployment (Q1 2026)
* Automated builds (planned)
* Deployment automation (planned)
* Environment management (planned)
* CI/CD integration (planned)
* Quality assurance (planned)

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

The MCP X++ Server provides 12 comprehensive tools for D365 F&O codebase analysis and management:

### Configuration & Setup
- `get_current_config`: Get comprehensive server configuration including paths, index statistics, and system information

### Object Creation
- `create_xpp_object`: Create D365 F&O objects (models, classes, tables, enums) with unified interface supporting multiple layers and dependencies

### File System Operations
- `browse_directory`: Browse directories with optional hidden file display
- `read_file`: Read file contents with path validation and size limits
- `search_files`: Search for text within X++ codebase files with configurable extensions

### Object Discovery & Analysis
- `find_xpp_object`: Find and analyze X++ objects by name with optional type filtering (CLASSES, TABLES, FORMS, etc.)
- `get_class_methods`: Get detailed method signatures and information for specific X++ classes
- `get_table_structure`: Get detailed table structure including fields, indexes, and relations
- `discover_object_types_json`: Return the raw JSON structure from aot-structure.json file

### Index Management & Search
- `build_object_index`: Build or update the object index for faster searches with optional type-specific or force rebuild options
- `list_objects_by_type`: List all objects of a specific type from the index with sorting and pagination
- `smart_search`: Perform intelligent search across the X++ codebase using multiple strategies with configurable results

**JSON Response Format for `list_objects_by_type`:**
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
    }
  ]
}
```

**Supported Object Types:**
- CLASSES, TABLES, FORMS, REPORTS, ENUMS, EDTS, VIEWS, MAPS, SERVICES, WORKFLOWS, QUERIES, MENUS, MENUITEM

**Available Application Layers:**
- usr, cus, var, isv, slp, gls, fp, sys

## Tool Reference

### Configuration Tools

#### `get_current_config`
Get comprehensive server configuration and statistics.
- **Parameters**: None
- **Returns**: JSON with paths, index statistics, available layers, and system information
- **Use Case**: Monitor server state and troubleshoot configuration issues

### Object Creation

#### `create_xpp_object`
Create new D365 F&O objects with full metadata support.
- **Parameters**: 
  - `objectName` (string, required) - Name of the object
  - `objectType` (string, required) - Type: "model", "class", "table", "enum"
  - `layer` (string, optional) - Application layer (usr, cus, var, etc.)
  - `publisher` (string, optional) - Publisher name (default: "YourCompany")
  - `version` (string, optional) - Version string (default: "1.0.0.0")
  - `dependencies` (array, optional) - Dependencies (default: ["ApplicationPlatform", "ApplicationFoundation"])
  - `outputPath` (string, optional) - Output path (default: "Models")
- **Returns**: Created object structure with file paths
- **Use Case**: Generate new X++ objects with proper D365 structure

### File System Tools

#### `browse_directory`
Navigate and list directory contents with X++ file recognition.
- **Parameters**: 
  - `path` (string, optional) - Relative path from codebase root (empty for root)
  - `showHidden` (boolean, optional) - Show hidden files (default: false)
- **Returns**: Directory listing with file types and icons
- **Use Case**: Explore D365 package structure and navigate codebases

#### `read_file`
Read file contents with security validation and size limits.
- **Parameters**: `path` (string, required) - Relative path to file
- **Returns**: File contents with encoding detection
- **Limits**: 500KB maximum file size
- **Use Case**: View X++ source code, XML metadata, and configuration files

#### `search_files`
Search text within files using case-insensitive matching.
- **Parameters**: 
  - `searchTerm` (string, required) - Text to search for
  - `path` (string, optional) - Relative search path (empty for entire codebase)
  - `extensions` (array, optional) - File extensions filter (e.g., ['.xpp', '.xml'])
- **Returns**: Search results with file paths and match context
- **Use Case**: Find code patterns, method names, or configuration values

### Object Discovery Tools

#### `find_xpp_object`
Locate X++ objects by name with optional type filtering.
- **Parameters**: 
  - `objectName` (string, required) - Name of object to find
  - `objectType` (string, optional) - Object type filter (CLASSES, TABLES, etc.)
- **Returns**: Object locations with paths and metadata
- **Use Case**: Validate object existence and locate object files

#### `get_class_methods`
Analyze class structure with detailed method information.
- **Parameters**: `className` (string, required) - Name of class to analyze
- **Returns**: Class methods with signatures, inheritance, and metadata
- **Use Case**: Understand class APIs and inheritance relationships

#### `get_table_structure`
Parse table metadata including fields, indexes, and relations.
- **Parameters**: `tableName` (string, required) - Name of table to analyze
- **Returns**: Complete table structure with fields, types, and indexes
- **Use Case**: Understand database schema and table relationships

#### `discover_object_types_json`
Get raw AOT structure configuration.
- **Parameters**: None
- **Returns**: Complete AOT structure JSON from configuration
- **Use Case**: Access full object type hierarchy and structure definitions

### Index and Search Tools

#### `build_object_index`
Build or update searchable object index for performance optimization.
- **Parameters**: 
  - `objectType` (string, optional) - Specific type to index (empty for all)
  - `forceRebuild` (boolean, optional) - Force complete rebuild (default: false)
- **Returns**: Index statistics with object counts by type
- **Performance**: Processes 70K+ objects in ~30 seconds
- **Use Case**: Initialize search capabilities and improve query performance

#### `list_objects_by_type`
Query indexed objects with JSON response format.
- **Parameters**: 
  - `objectType` (string, required) - Object type to list
  - `sortBy` (string, optional) - Sort criteria: "name", "package", "size" (default: "name")
  - `limit` (number, optional) - Maximum results to return
- **Returns**: JSON with totalCount and object array
- **Use Case**: Browse objects by type with pagination and metadata

#### `smart_search`
Intelligent multi-strategy search with result prioritization.
- **Parameters**: 
  - `searchTerm` (string, required) - Term to search for
  - `searchPath` (string, optional) - Relative path to search within
  - `extensions` (array, optional) - File extensions to include
  - `maxResults` (number, optional) - Maximum results (default: 50)
- **Returns**: Prioritized results with object matches before file content matches
- **Use Case**: Comprehensive codebase search with intelligent ranking

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

### Running the Server

Start the MCP server with required configuration:
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
| `--xpp-path` | Path to D365 PackagesLocalDirectory | Yes | `C:\D365\PackagesLocalDirectory` |
| `--xpp-metadata-folder` | Custom metadata output directory | No | `C:\CustomMetadata` |
| `--vs2022-extension-path` | VS2022 D365 extension base directory | No | `C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions\{GUID}` |

**Note**: The server automatically appends the templates subdirectory path when accessing VS2022 templates and icons.

### VS Code Integration

Configure in `.vscode/mcp.json`:
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

**Note**: Replace `{GUID}` with your actual VS2022 extension GUID. You can find this by exploring the Extensions directory.

### Integration with MCP Clients

To use this server with Claude Desktop, Visual Studio, or other MCP clients:
1. Configure the MCP client with the server details and provide the X++ codebase path via `--xpp-path` argument
2. Use the available tools to browse and analyze your X++ code
3. Use `get_current_config` to verify server configuration and monitor index statistics

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
- `config/aot-structure.json` - AOT object type definitions and structure
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
- "X++ codebase path not set": Configure path with `--xpp-path` argument when starting the server
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

This is experimental software provided "as is" without warranty of any kind. Use at your own risk, especially in production environments. The software may have bugs, incomplete features, or unexpected behavior.

## Get Involved

This project is experimental and under active development. If you have feedback, encounter issues, or wish to contribute improvements, please use the GitHub repository to:
- Star the repository to show support
- Report issues or bugs
- Suggest features or improvements
- Contribute code or documentation

Thank you for your interest in this project.
*Note: Advanced code parsing, relationship analysis, and intelligent object understanding are planned for future development phases.*
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
