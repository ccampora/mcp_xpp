
# MCP X++ Codebase Server

**Status:** Experimental. This project is in early development. Use only in non-production environments.

This repository provides a Model Context Protocol (MCP) server for basic navigation and file operations on Dynamics 365 Finance and Operations (D365 F&O) X++ codebases. The server enables AI models and tools to browse directories, read files, and perform simple text searches within a configured D365 F&O codebase.

## 🚀 Vision & Roadmap

## Roadmap

### Current State (Phase 1)
- Basic file system browsing and navigation
- File reading with size limits
- Basic text search across files
- Simple object existence validation

*Note: No advanced object discovery, code analysis, or project-specific features are available at this stage. Advanced features are planned for future phases.*

### Planned Phases

#### 📖 **Phase 1: Analysis & Discovery** *(Current - Q1 2025)*
- Basic file system browsing and navigation
- File reading with size limits
- Basic text search across files
- Simple object existence validation
- Performance-optimized indexing (basic implementation)
- Class method parsing (limited)
- Table structure parsing (limited)

#### 🔨 **Phase 2: Code Generation** *(Q2-Q3 2025)*
- X++ object creation (planned)
- Custom project management (planned)
- Code templates (planned)
- Relationship management (planned)
- Security integration (planned)
- Extension support (planned)

#### 🏗️ **Phase 3: Project Management** *(Q4 2025)*
- Package management (planned)
- Dependency resolution (planned)
- Version control integration (planned)
- Project templates (planned)
- ISV development support (planned)

#### 🚀 **Phase 4: Build & Deployment** *(Q1 2026)*
- Automated builds (planned)
- Deployment automation (planned)
- Environment management (planned)
- CI/CD integration (planned)
- Quality assurance (planned)

#### 🎯 **Phase 5: Enterprise Integration** *(Q2 2026+)*
- Production deployment (planned)
- Lifecycle management (planned)
- Compliance and governance (planned)
- Performance optimization (planned)
- Multi-tenant support (planned)

### Revolutionary Impact


## 🔬 Technical Innovation

## Technical Overview

This MCP server provides:
- Basic file reading, directory browsing, and text search
- Security validation to restrict access within the configured codebase
- File size limits and result pagination for performance
- Recognition of common X++ file types (.xpp, .xml, etc.)

*Note: Advanced code analysis and automation features are not yet implemented.*

## 🎯 Current Purpose

## Current Capabilities

- Basic file system navigation (PackagesLocalDirectory)
- File reading for .xpp, .xml, and related files
- Simple text search
- Basic object existence validation (file-based)
- Directory browsing with X++ file type recognition
- Security-validated file operations

*Note: Advanced analysis, relationship parsing, and intelligent code understanding are planned for future phases.*

## ✨ Features

**Note:** All features are experimental and under active development. Feedback and bug reports are welcome.

### Core File Operations
- File system browsing: Navigate X++ directories and list contents
- File reading: Read X++ source files (500KB max)
- Content search: Basic text search across .xpp, .xml, and other X++ file types
- File information: Basic metadata (size, modification dates, file type)

### Basic X++ Support
- File type recognition: Identify X++ related file extensions
- Simple object discovery: Basic file-based object finding by name pattern
- Basic validation: Check if object files exist in the file system
- Directory structure: Navigate the AOT-like directory structure

### Performance & Security
- Basic indexing: Simple file-based indexing for faster file discovery
- Security validation: Prevent access outside configured codebase directory
- File size limits: Configurable limits (500KB default)
- Result pagination: Limited result sets for responsiveness

*Note: Advanced code parsing, relationship analysis, and intelligent object understanding is planned for future development phases.*

## 📖 Documentation

This section will be updated as documentation becomes available.

## 🛠️ Available Tools

### Setup & Configuration
- `set_xpp_codebase_path`: Configure the root path to your X++ codebase (required first step)

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
- `list_objects_by_type`: List all objects of a specific type (requires index)
- `smart_search`: Perform search across the codebase using multiple strategies

## Supported File Types

Recognized file extensions:
- `.xpp` - X++ source files
- `.xml` - Metadata and configuration files
- `.rnrproj` - Project files
- `.axproj` - AX project files
- `.txt`, `.md` - Documentation files
- `.json` - Configuration files

## Prerequisites

This section will be updated as documentation becomes available.
- Access to a Dynamics 365 F&O X++ codebase directory

## Vision and Roadmap

1. Install Node.js (see [nodejs.org](https://nodejs.org/))
#### Phase 1: Analysis & Discovery (Current - Q1 2025)
3. Build the project: `npm run build`

#### Phase 4: Build & Deployment (Q1 2026)

## Usage
#### Phase 5: Enterprise Integration (Q2 2026+)
### Running the Server

## Technical Innovation
- `npm start`
or
## Current Purpose

### Integration with Visual Studio
## Features
To use this server with Visual Studio or other MCP clients:
1. Configure the MCP client with the server details (see your client documentation)
## Documentation
3. Use the available tools to browse and analyze your X++ code

## Available Tools
mcp_xpp/
├── src/
## Troubleshooting
│   └── modules/                    # Modular architecture
│       ├── aot-structure.ts        # AOT structure management
## Get Involved
│       ├── config.ts               # Configuration management
│       ├── file-utils.ts           # File system utilities
│       ├── logger.ts               # Logging system
│       ├── object-index.ts         # Object indexing
│       ├── parsers.ts              # X++ file parsers
│       ├── search.ts               # Search functionality
│       ├── types.ts                # Type definitions
│       └── utils.ts                # General utilities
├── tests/                          # Jest test suite
│   ├── helpers/                    # Test utilities
│   ├── mcp-server.test.js          # Integration tests
│   ├── performance.test.js         # Performance tests
│   └── setup.js                    # Jest configuration
├── build/                          # Compiled JavaScript output
├── .github/
│   └── copilot-instructions.md
├── jest.config.js                  # Jest configuration
├── package.json
├── tsconfig.json
└── README.md

### Project Structure

See the `src/` directory for main server implementation and modules. Tests are in the `tests/` directory. Build output is in `build/`.

### Development Commands
- `npm run dev`: Watch mode for development
- `npm run build`: Build the TypeScript project
- `npm start`: Run the compiled server
- `npm test`: Run the Jest test suite
- `npm run test:watch`: Run tests in watch mode
- `npm run test:coverage`: Run tests with coverage report

### Security Features

- Path validation: Prevents access outside the configured codebase directory
- File size limits: Maximum 500KB per file
- Result limits: Maximum 100 files per directory listing, 50 files per search

## Example Workflow

Example usage:
1. Initialize the server with your F&O codebase using `set_xpp_codebase_path`
2. Browse the codebase structure with `browse_directory`
3. Find objects by name and type with `find_xpp_object`
4. Analyze object structure with `get_table_structure` or `get_class_methods`
5. Search for code patterns with `smart_search`

## 🔧 Troubleshooting

**Note:** If you encounter issues, please report them as GitHub issues. This software is experimental and may have unexpected behavior.

### Common Issues

Common issues:
- "No objects of type X found": Build the object index with `build_object_index()`
- "X++ codebase path not set": Set the codebase path with `set_xpp_codebase_path()`
- "Path is outside the configured codebase directory": Use relative paths from the codebase root
- "File too large": The server limits files to 500KB

The server logs errors to stderr, which can be captured by MCP clients for debugging.

## Contributing

Contributions are welcome. Please fork the repository, create a feature branch, and submit a pull request. Note that APIs and functionality may change as the project evolves.

## License

MIT License - see LICENSE file for details

## ⚠️ Disclaimer

This is experimental software provided "as is" without warranty of any kind. Use at your own risk, especially in production environments. The software may have bugs, incomplete features, or unexpected behavior.

## 🌟 Get Involved

This project is experimental and under active development. If you have feedback, encounter issues, or wish to contribute improvements, please use the GitHub repository to:
- Star the repository to show support
- Report issues or bugs
- Suggest features or improvements
- Contribute code or documentation

Thank you for your interest in this project.
*Note: Advanced code parsing, relationship analysis, and intelligent object understanding are planned for future development phases.*
