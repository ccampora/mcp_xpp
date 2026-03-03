# MCP X++ Batch Files

Convenient batch files for common development tasks.

## Setup & Installation

### `setup.bat` - First-Time Setup
Complete setup for new installations:
- Sets up VS2022 D365 extension references
- Configures NuGet sources
- Restores packages
- Builds all components
- Creates MCP configuration files

**Usage:**
```cmd
tools\setup.bat
```

## Building

### `build-all.bat` - Build Everything
Builds both C# service and MCP server.

**Usage:**
```cmd
tools\build-all.bat
```

### `build-csharp.bat` - Build C# Service Only
Builds only the D365 Metadata Service.

**Usage:**
```cmd
tools\build-csharp.bat
```

### `build-mcp.bat` - Build MCP Server Only
Builds only the TypeScript MCP server.

**Usage:**
```cmd
tools\build-mcp.bat
```

## Running

### `run-csharp.bat` - Run C# Service
Starts the D365 Metadata Service (required for MCP server to work).

**Usage:**
```cmd
tools\run-csharp.bat
```

**Note:** Press Ctrl+C to stop the service.

### `rebuild-csharp.bat` - Rebuild & Run C# Service
Kills any existing D365 service, rebuilds, and runs it.

**Usage:**
```cmd
tools\rebuild-csharp.bat
```

This is the recommended way to restart the C# service during development.

### `run-mcp.bat` - Run MCP Server
Runs the MCP server directly (for testing/debugging).

**Usage:**
```cmd
tools\run-mcp.bat
```

**Note:** Normally, you don't run this directly. Instead, the MCP server is launched by MCP clients (Visual Studio 2022, Claude Desktop, VS Code) using the configuration files.

## Status & Monitoring

### `status.bat` - Check Component Status
Shows the status of all components:
- C# service running status
- Node.js and .NET installation
- Build outputs existence
- Configuration files presence

**Usage:**
```cmd
tools\status.bat
```

## Quick Start Workflow

### First-Time Setup:
```cmd
tools\setup.bat
tools\run-csharp.bat
```

### Daily Development:
```cmd
REM Check if everything is ready
tools\status.bat

REM Start the C# service (if not running)
tools\run-csharp.bat

REM Your MCP client (VS2022, Claude, etc.) will automatically connect
```

### After Code Changes:

**C# changes:**
```cmd
tools\rebuild-csharp.bat
```

**TypeScript changes:**
```cmd
tools\build-mcp.bat
REM Then restart your MCP client
```

## Troubleshooting

**Service won't start:**
- Run `tools\status.bat` to check prerequisites
- Check if port/named pipe is already in use
- Review logs in `ms-api-server\logs`

**Build fails:**
- Ensure prerequisites are installed (Node.js, .NET SDK)
- Run `tools\setup.bat` to reconfigure
- Check error messages in the console

**MCP client can't connect:**
- Verify C# service is running: `tools\status.bat`
- Check configuration files exist
- Restart your MCP client after configuration changes

## Files Summary

| File | Purpose | When to Use |
|------|---------|-------------|
| `tools\setup.bat` | First-time setup | Once on new installations |
| `tools\build-all.bat` | Build everything | After pulling updates |
| `tools\build-csharp.bat` | Build C# only | After C# code changes |
| `tools\build-mcp.bat` | Build MCP only | After TypeScript changes |
| `tools\run-csharp.bat` | Start C# service | Always (required for MCP) |
| `tools\rebuild-csharp.bat` | Rebuild & restart C# | During C# development |
| `tools\run-mcp.bat` | Test MCP directly | Debugging only |
| `tools\status.bat` | Check system status | Troubleshooting |

## See Also

- [config/QUICK_SETUP.md](config/QUICK_SETUP.md) - MCP client setup guide
- [config/mcp-setup-guide.md](config/mcp-setup-guide.md) - Detailed setup documentation
- [README.md](README.md) - Project overview and features
