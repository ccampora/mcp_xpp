
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

This section will be updated as documentation becomes available.

## Available Tools

### File System Operations
- `browse_directory`: List directory contents with X++ file identification
- `read_file`: Read and display file contents
- `get_file_info`: Get detailed file/directory information
- `search_files`: Text search across X++ files

### Object Discovery & Analysis
- `find_xpp_object`: Find X++ objects by name and type (classes, tables, etc.)
- `get_class_methods`: Analyze class methods, inheritance, and signatures
- `get_table_structure`: Parse table fields, indexes, and metadata
- `validate_object_exists`: Quickly validate if objects exist in codebase
- `discover_object_types`: Discover available X++ object types in the codebase
- `discover_object_types_json`: Get raw JSON structure from AOT analysis

### Index Management & Search
- `build_object_index`: Build searchable index for optimal performance
- `get_index_stats`: Monitor index performance and statistics
- `list_objects_by_type`: List all objects of a specific type with JSON response format
- `smart_search`: Perform intelligent search across the codebase using multiple strategies

**New JSON Response Format for `list_objects_by_type`:**
```json
{
  "objectType": "CLASSES",
  "totalCount": 31258,
  "objects": [
    {
      "name": "AADAuthenticationMonitoringAndDiagnostics",
      "package": "ApplicationFoundation",
      "path": "/path/to/class.xml",
      "size": 2048
    }
  ]
}
```

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
        "--xpp-metadata-folder", "C:\\custom\\metadata"  
      ],
      "cwd": "${workspaceFolder}",
      "type": "stdio"
    }
  }
}
```

### Integration with MCP Clients

To use this server with Claude Desktop, Visual Studio, or other MCP clients:
1. Configure the MCP client with the server details and provide the X++ codebase path via `--xpp-path` argument
2. Use the available tools to browse and analyze your X++ code
3. Use `get_current_config` to verify server configuration and monitor index statistics

## Available Tools

### Project Structure

- `src/` - Main server implementation and modules
  - `modules/` - Modular architecture
    - `aot-structure.ts` - AOT structure management
    - `config.ts` - Configuration management
    - `file-utils.ts` - File system utilities
    - `logger.ts` - Logging system
    - `object-index.ts` - Object indexing
    - `parsers.ts` - X++ file parsers
    - `search.ts` - Search functionality
    - `types.ts` - Type definitions
    - `utils.ts` - General utilities
- `config/` - Contains JSON or JS files for runtime configuration.
  - `aot-structure.json`: Predefined AOT structure tree
  - Any other custom configuration files used by your deployment or scripts
- `tests/` - Jest test suite
  - `helpers/` - Test utilities
  - `mcp-server.test.js` - Integration tests
  - `performance.test.js` - Performance tests
  - `setup.js` - Jest configuration
- `build/` - Compiled JavaScript output
- `.github/` - GitHub configuration and Copilot instructions
  - `copilot-instructions.md`
- `jest.config.js` - Jest configuration
- `package.json` - Project manifest
- `tsconfig.json` - TypeScript configuration
- `README.md` - Project documentation

### Development Commands
- `npm run dev`: Watch mode for development
- `npm run build`: Build the TypeScript project
- `npm start`: Run the compiled server
- `npm test`: Run comprehensive test suite (23 tests including real D365 integration)
- `npm run test:watch`: Run tests in watch mode
- `npm run test:ui`: Open Vitest web interface for interactive testing

### Testing Architecture
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

**Quick Start with Real D365 Data:**
1. **Initialize**: Set your F&O codebase path using `set_xpp_codebase_path`
2. **Index**: Build object index with `build_object_index` (indexes 70K+ objects)
3. **Query**: List objects with `list_objects_by_type` - returns JSON with totalCount
4. **Search**: Find objects with `smart_search` - prioritized results with metadata
5. **Analyze**: Get detailed structure with `get_table_structure` or `get_class_methods`

**Example JSON Response:**
```bash
# Query for classes
> list_objects_by_type CLASSES limit=5 sortBy=size

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
    // ... 4 more objects
  ]
}
```

## Troubleshooting

**Note:** If you encounter issues, please report them as GitHub issues. This software is experimental and may have unexpected behavior.

### Common Issues

**Performance & Data Issues:**
- "No objects found": Run `build_object_index()` to index your 70K+ objects
- "X++ codebase path not set": Configure with `set_xpp_codebase_path()`
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
