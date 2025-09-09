# MCP X++ Server - Technical Architecture

**Document Version:** 1.0  
**Last Updated:** September 9, 2025  
**Status:** Current Implementation Documentation

This document provides detailed technical architecture information for the MCP X++ Server project.

## Modular Architecture (5 Core Modules)

### Server Management
- `src/index.ts` - Main entry point and server initialization
- `src/modules/server-manager.ts` - Server lifecycle and request handling
- `src/modules/tool-definitions.ts` - MCP tool schema definitions (7 tools)
- `src/modules/tool-handlers.ts` - Tool implementation and request routing

### Core Functionality
- `src/modules/config-loader.ts` - Centralized configuration with caching
- `src/modules/object-index.ts` - High-performance object indexing
- `src/modules/file-utils.ts` - Secure file system operations
- `src/modules/parsers.ts` - X++ code analysis and parsing
- `src/modules/search.ts` - Multi-strategy search implementation

### Supporting Systems
- `src/modules/logger.ts` - Request/response logging with JSON serialization
- `src/modules/object-creators.ts` - D365 object generation templates
- `src/modules/aot-structure.ts` - AOT structure management
- `src/modules/app-config.ts` - Application configuration
- `src/modules/cache.ts` - Performance optimization

## Configuration System

### JSON Configuration Files
- `config/d365-aot-structure.json` - AOT object type definitions and structure
- `config/d365-model-config.json` - D365 model templates and metadata
- `config/d365-object-templates.json` - Object creation templates

### Environment Variables
- `XPP_CODEBASE_PATH` - Primary D365 codebase path
- `XPP_METADATA_FOLDER` - Custom metadata directory
- `WRITABLE_METADATA_PATH` - Output path for generated objects

## Build and Test Structure

### Directory Structure
- `build/` - Compiled TypeScript output with source maps
- `tests/` - Vitest test suite (23 tests)
  - `integration-real.test.js` - Real D365 integration tests (6 tests)
  - `test-config.js` - Centralized test configuration
- `cache/` - Runtime index cache files

### Development Commands
- `npm run build`: Build the TypeScript project to JavaScript
- `npm start`: Run the compiled MCP server
- `npm test`: Run comprehensive test suite (23 tests including real D365 integration)
- `npm run test:watch`: Run tests in watch mode for development
- `npm run test:ui`: Open Vitest web interface for interactive testing

## Testing Architecture

The project includes comprehensive testing with both mock and real integration tests:

### Mock Unit Tests (17 tests)
- JSON response format validation
- Tool logic testing with controlled data
- Parser functionality with simulated X++ content
- Error handling and security validation
- Performance testing with mock scenarios

### Real Integration Tests (6 tests)
- **NO MOCKS** - Uses actual D365 environment from `.vscode/mcp.json`
- Tests real 70K+ object indexing
- Validates JSON responses with actual D365 data (31K+ classes, 6K+ tables)
- Verifies configuration loading and path validation
- Tests real directory structure (169 D365 packages)
- Validates JSON serialization with Windows paths and special characters

### Test Results
- ✅ All 23 tests passing
- ⚡ Fast execution: Mock tests <1s, Integration tests ~600ms
- 🔍 Real D365 data: Tests against actual PackagesLocalDirectory
- 📊 Comprehensive coverage: From unit logic to end-to-end integration

## Security Features

- **Path Traversal Prevention**: Comprehensive validation against `../../../etc/passwd` attacks
- **File Size Limits**: Maximum 500KB per file with graceful handling
- **Result Limits**: Configurable pagination with totalCount metadata
- **JSON Injection Protection**: Safe serialization of Windows paths and special characters
- **Environment Isolation**: All operations restricted to configured D365 codebase path

## Performance Metrics

Real-world performance with actual D365 environment:
- **Index Loading**: 72,708 objects loaded in ~500ms
- **Object Queries**: Response time <50ms for filtered results
- **JSON Serialization**: 2,300+ character responses with complex data structures
- **Directory Scanning**: 169 D365 packages discovered and validated
- **Memory Efficiency**: Handles 31K+ classes and 6K+ tables with stable memory usage

## File System Architecture

### Project Structure
```
mcp_xpp/
├── src/
│   ├── index.ts                    # Main entry point
│   └── modules/                    # Core modules
│       ├── server-manager.ts       # MCP server lifecycle
│       ├── tool-definitions.ts     # Tool schemas
│       ├── tool-handlers.ts        # Tool implementations
│       ├── config-loader.ts        # Configuration management
│       ├── object-index.ts         # Object indexing
│       ├── file-utils.ts           # File operations
│       ├── parsers.ts              # X++ parsing
│       ├── search.ts               # Search functionality
│       ├── logger.ts               # Logging system
│       ├── object-creators.ts      # Object templates
│       ├── aot-structure.ts        # AOT management
│       ├── app-config.ts           # App configuration
│       └── cache.ts                # Caching system
├── config/
│   ├── d365-aot-structure.json     # Object type definitions
│   ├── d365-model-config.json      # Model templates
│   └── d365-object-templates.json  # Creation templates
├── build/                          # Compiled output
├── tests/                          # Test suite
├── cache/                          # Runtime cache
└── docs/                           # Documentation
```

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **MCP Protocol**: @modelcontextprotocol/sdk
- **Database**: SQLite for object indexing
- **IPC**: Named Pipes for C# service communication
- **Testing**: Vitest with both mock and real integration tests
- **Build**: TypeScript compiler with source maps

## Dependencies

### Core Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `zod` - Schema validation
- `sqlite3` - Database operations
- `typescript` - Type system and compilation

### D365 Integration
- Custom C# service using Microsoft.Dynamics.AX.Metadata assemblies
- Named Pipes communication for VS2022 API access
- Direct integration with D365 F&O development tools

---

**Note**: This document reflects the current implementation as of September 2025. For high-level architecture and user guides, see the main README.md file.
