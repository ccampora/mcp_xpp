<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# MCP X++ Codebase Server - Copilot Instructions

This is an MCP (Model Context Protocol) server project designed to browse Dynamics 365 Finance and Operations X++ codebase.

## 🏛️ FOUNDATIONAL ARCHITECTURAL DESIGN - TEMPLATE-FIRST ARCHITECTURE

**CRITICAL**: This project follows the **Template-First Architecture** design established on August 29, 2025.

### **CORE DESIGN PHILOSOPHY**: Template-First, API-Minimal
- **Objects are essentially static** throughout VS2022 extension lifecycle  
- **Template-based creation** (50-100ms) vs API dependency (200-2000ms+)
- **Self-sufficiency** over external dependencies
- **Single Source of Truth** per object type in description files

### **IMMUTABLE DESIGN PRINCIPLES**
1. **Single Source of Truth**: Each object type has exactly ONE description file (`config/object_descriptions/{ObjectType}_description.json`)
2. **Template-First**: Object creation MUST use templates, NOT runtime API calls  
3. **Sync-On-Demand**: Synchronization is triggered explicitly (PowerShell for sync only, ~twice yearly)
4. **Performance Priority**: Sub-100ms object creation is non-negotiable
5. **Self-Sufficiency**: System MUST work offline without external APIs

### **FORBIDDEN PATTERNS**
❌ **Runtime API Calls for Object Creation** (use templates instead)  
❌ **Multiple Files Per Object Type** (breaks single source of truth)  
❌ **Automatic Synchronization** (creates external dependencies)  
❌ **Template Compilation at Runtime** (performance impact)

### **REQUIRED PATTERNS**
✅ **Template-based object creation** (<100ms performance)  
✅ **Object description files** (`*_description.json` format)  
✅ **PowerShell for sync only** (rare, on-demand)  
✅ **Self-contained templates** with all object knowledge

**Reference Document**: `misc/template-first-architecture-design.md`

## Project Purpose
- Create a local MCP server that can browse and analyze X++ code files
- Provide tools for directory browsing, file reading, and code searching
- **Generate D365 objects using template-first architecture** (NOT API calls)
- Enable integration with Visual Studio and other MCP-compatible tools

## Key Technologies
- TypeScript/Node.js for the server implementation
- MCP SDK (@modelcontextprotocol/sdk) for protocol implementation
- Zod for input validation and schema definitions
- **Handlebars** for template processing (template-first architecture)
- **PowerShell** for synchronization only (not object creation)

## File Structure - Template-First Architecture
```
config/
├── object_descriptions/           # SINGLE SOURCE OF TRUTH per object type
│   ├── AxClass_description.json   # Complete AxClass knowledge + templates
│   ├── AxTable_description.json   # Complete AxTable knowledge + templates  
│   └── ... (553 object types)
├── d365-model-config.json
├── strategy-config.json
└── aot-structure.json
```

## X++ File Types
When working with this codebase, be aware of these common X++ file extensions:
- `.xpp` - X++ source files (primary code files)
- `.xml` - Metadata files
- `.rnrproj` - Project files  
- `.axproj` - AX project files
- `.txt`, `.md` - Documentation files
- `.json` - Configuration files (including object description files)

## Architecture
- Uses STDIO transport for communication
- Implements file system security checks to prevent path traversal
- Supports file size limits for safe operation
- Provides search capabilities across the codebase
- **Template-First Object Creation**: Uses description files with embedded templates

## Development Guidelines - Template-First Architecture
- **TEMPLATE-FIRST PRINCIPLE**: Always use templates for object creation, NEVER runtime API calls
- **SINGLE SOURCE OF TRUTH**: Each object type has ONE description file with ALL knowledge needed
- **NO HARDCODING**: HARDCODING IS FORBIDDEN. Always use configuration files for templates, constants, and structured data
- **Object Description Files**: Store ALL object knowledge in `config/object_descriptions/{ObjectType}_description.json`
- Always validate file paths to prevent security issues
- Use appropriate error handling for file system operations
- Maintain performance by limiting search results and file sizes
- Follow MCP protocol specifications for tool definitions
- **Performance Target**: <100ms for object creation using templates
- **PowerShell Usage**: ONLY for synchronization (sync-on-demand), NOT for object creation

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
