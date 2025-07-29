<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# MCP X++ Codebase Server - Copilot Instructions

This is an MCP (Model Context Protocol) server project designed to browse Dynamics 365 Finance and Operations X++ codebase.

## Project Purpose
- Create a local MCP server that can browse and analyze X++ code files
- Provide tools for directory browsing, file reading, and code searching
- Enable integration with Visual Studio and other MCP-compatible tools

## Key Technologies
- TypeScript/Node.js for the server implementation
- MCP SDK (@modelcontextprotocol/sdk) for protocol implementation
- Zod for input validation and schema definitions

## X++ File Types
When working with this codebase, be aware of these common X++ file extensions:
- `.xpp` - X++ source files (primary code files)
- `.xml` - Metadata files
- `.rnrproj` - Project files  
- `.axproj` - AX project files
- `.txt`, `.md` - Documentation files
- `.json` - Configuration files

## Architecture
- Uses STDIO transport for communication
- Implements file system security checks to prevent path traversal
- Supports file size limits for safe operation
- Provides search capabilities across the codebase

## Development Guidelines
- **NO HARDCODING**: HARDCODING IS FORBIDDEN. Always use configuration files for templates, constants, and structured data
- Always validate file paths to prevent security issues
- Use appropriate error handling for file system operations
- Maintain performance by limiting search results and file sizes
- Follow MCP protocol specifications for tool definitions
- Store XML templates, file structures, and configuration data in the config/ directory
- Use template engines or string replacement for dynamic content generation

## MCP Tool Management Guidelines
- **Tool Limit Awareness**: VS Code supports max 128 tools simultaneously
- **Information Display Strategy**: Any tool that primarily shows information should be consolidated into the `get_current_config` tool rather than creating separate tools
- **Tool Consolidation Rule**: Before creating a new tool, evaluate if the functionality can be added to existing tools
- **Examples**:
  - ✅ `get_current_config` - Central hub for all configuration and informational data
  - ❌ `list_models` - Should be part of `get_current_config`
  - ❌ `show_server_info` - Should be part of `get_current_config`
  - ❌ `display_statistics` - Should be part of `get_current_config`

You can find more info and examples at https://modelcontextprotocol.io/llms-full.txt

## Security Considerations
- All file operations are restricted to the configured X++ codebase directory
- Path traversal attacks are prevented through path validation
- File size limits prevent memory issues with large files

## When doing adhoc testing
- Any adhoc testing file or script that you would need to create MUST be created inside a misc folder
- You won't create any other adhoc test outside the misc folder
