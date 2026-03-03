# MCP Client Configuration Guide

This guide explains how to configure MCP clients (Claude Desktop, VS Code with GitHub Copilot, etc.) to connect to the mcp_xpp server.

## Prerequisites

1. Build the MCP server first:
   ```powershell
   .\tools\build-and-run.ps1 -Action build -Target mcp
   ```

2. Build and start the C# D365 service:
   ```powershell
   .\tools\build-and-run.ps1 -Action run -Target csharp
   ```

## Configuration Options

### Option 1: Claude Desktop

Claude Desktop configuration file location:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Note:** Update the path to match your actual installation directory.

### Option 2: Visual Studio 2022

Visual Studio 2022 (version 17.13+) has built-in support for MCP servers through GitHub Copilot.

**Configuration file locations (choose one):**
- **Primary (Recommended)**: `%USERPROFILE%\.mcp.json` - Simpler, user-level configuration
- **Alternative**: `%APPDATA%\Microsoft\VisualStudio\17.0_<instance>\GithubCopilot\mcp_config.json` - Per-instance configuration
- **UI Method**: **Tools > Options > GitHub > Copilot > MCP Servers** - No manual file editing required

**Configuration (`%USERPROFILE%\.mcp.json`):**

```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Setup Steps (Option A - File-based):**
1. Create or edit `%USERPROFILE%\.mcp.json` (e.g., `C:\Users\YourName\.mcp.json`)
2. Add the configuration shown above
3. Save the file
4. Restart Visual Studio 2022 (ensure version 17.13 or later)
5. The MCP server should now be available in GitHub Copilot

**Setup Steps (Option B - UI-based):**
1. Open Visual Studio 2022 (ensure version 17.13 or later)
2. Go to **Tools > Options > GitHub > Copilot > MCP Servers**
3. Click **"Add MCP Server"**
4. Enter the server name: `mcp-xpp-d365`
5. Set the command: `node`
6. Add arguments: `D:\Repo\RenVol_GitHub\mcp_xpp\build\index.js`
7. Click **OK** and restart Visual Studio

**Benefits:**
- Direct integration with GitHub Copilot in Visual Studio
- Access MCP tools through Copilot chat window
- Ideal for D365 development workflows within Visual Studio

**Documentation:** [MCP Servers in Visual Studio](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers?view=vs-2022)

### Option 3: VS Code with GitHub Copilot

1. Copy the `.vscode/mcp.json` file to your workspace root
2. The server will be available in VS Code's MCP integration

**VS Code Configuration (`.vscode/mcp.json`):**

```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "${workspaceFolder}\\build\\index.js"
      ],
      "type": "stdio"
    }
  }
}
```

### Option 4: Custom Configuration with Explicit Paths

If the server doesn't auto-detect your D365 paths, you can specify them explicitly:

**Visual Studio 2022:**
```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js",
        "--xpp-path",
        "D:\\Repo\\Dometic_Basecamp_D365FO\\Trunk\\Main\\Metadata"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Claude Desktop:**
```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js",
        "--xpp-path",
        "D:\\Repo\\Dometic_Basecamp_D365FO\\Trunk\\Main\\Metadata"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**VS Code:**
```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "${workspaceFolder}\\build\\index.js",
        "--xpp-path",
        "D:\\Repo\\Dometic_Basecamp_D365FO\\Trunk\\Main\\Metadata"
      ],
      "type": "stdio"
    }
  }
}
```

## Server Configuration

The MCP server automatically detects D365 paths from:
1. Command line arguments (`--xpp-path`)
2. VS2022 extension installation
3. Environment variables

Your current D365 setup (from `ms-api-server/appsettings.json`):
- **Default Model**: HSO
- **Packages Directory**: `D:\Repo\Dometic_Basecamp_D365FO\Trunk\Main\Metadata`
- **Custom Metadata Path**: `D:\Repo\Dometic_Basecamp_D365FO\Trunk\Main\Metadata\HSO`

## Verifying the Connection

After configuration:

1. **Visual Studio 2022**: 
   - Restart Visual Studio
   - Open GitHub Copilot chat window
   - Type `@mcp-xpp-d365` to see available tools
   - Or check **Tools > Options > GitHub > Copilot > MCP Servers** to verify it's listed

2. **Claude Desktop**: 
   - Restart Claude Desktop completely (quit from system tray)
   - Look for the "mcp-xpp-d365" server in the tools list (🔌 icon)
   - The server should appear in the tool picker when composing messages

3. **VS Code**: 
   - Reload the window (Ctrl+Shift+P → "Reload Window")
   - Check the MCP status indicator in the status bar
   - Open command palette and search for MCP-related commands

## Testing the Server

You can test the server connection by asking:
- "List available D365 object types"
- "Get setup info"
- "What models are available in my D365 environment?"

## Troubleshooting

### Visual Studio 2022 Specific Issues

**MCP Servers option not visible:**
- Verify Visual Studio 2022 version is 17.13 or later (Help > About Microsoft Visual Studio)
- Ensure GitHub Copilot extension is installed and activated
- Sign in to GitHub Copilot if not already signed in
- Check **Extensions > Manage Extensions** for GitHub Copilot updates

**Server appears but tools don't work:**
- Verify the C# D365 service is running: `Get-Process D365MetadataService`
- Check the command path is correct in MCP configuration
- Restart Visual Studio after any configuration changes
- Check Visual Studio Output window (View > Output) and select "GitHub Copilot" from the dropdown

**Cannot find configuration file:**
- **Primary location (Recommended)**: `%USERPROFILE%\.mcp.json` (e.g., `C:\Users\YourName\.mcp.json`)
- **Alternative location**: `%APPDATA%\Microsoft\VisualStudio\17.0_<instance>\GithubCopilot\mcp_config.json`
  - The `<instance>` part varies per installation (e.g., `17.0_a1b2c3d4`)
- **Easiest method**: Use the UI instead: **Tools > Options > GitHub > Copilot > MCP Servers**
- If `.mcp.json` doesn't exist in your user profile, create it manually with the configuration

### Server Not Appearing

1. Check that the C# service is running:
   ```powershell
   Get-Process D365MetadataService
   ```

2. Verify the build output exists:
   ```powershell
   Test-Path ".\build\index.js"
   ```

3. Check server logs:
   ```powershell
   Get-Content ".\logs\mcp-server.log" -Tail 50
   ```

### Connection Errors

1. Ensure Node.js is in your PATH:
   ```powershell
   node --version
   ```

2. Test the server manually:
   ```powershell
   node .\build\index.js
   ```

3. Check that the C# service is listening on the named pipe:
   ```powershell
   Get-ChildItem \\.\pipe\ | Where-Object { $_.Name -like "*mcp-xpp*" }
   ```

### Path Issues

- On Windows, always use double backslashes (`\\`) in JSON strings
- Use forward slashes (`/`) as an alternative
- Use `${workspaceFolder}` variable in VS Code for relative paths

## Advanced Configuration

### HTTP Transport (Optional)

For debugging or remote access, you can enable HTTP transport:

```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js",
        "--http-port",
        "8080",
        "--http-host",
        "localhost"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Multiple Environments

You can configure multiple servers for different D365 environments:

**Visual Studio 2022 / Claude Desktop / VS Code:**
```json
{
  "mcpServers": {
    "mcp-xpp-production": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js",
        "--xpp-path",
        "D:\\D365FO\\Prod\\Metadata"
      ]
    },
    "mcp-xpp-development": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js",
        "--xpp-path",
        "D:\\Repo\\Dometic_Basecamp_D365FO\\Trunk\\Main\\Metadata"
      ]
    }
  }
}
```

**Note:** In Visual Studio 2022, you can switch between different MCP servers using `@server-name` in the Copilot chat window to target a specific D365 environment.

## Available Tools

Once connected, you'll have access to these MCP tools:

### Object Management
- `create_xpp_object` - Create D365 objects (classes, tables, enums, etc.)
- `create_form` - Specialized form creation with patterns
- `delete_xpp_object` - Safe object deletion with dependency validation
- `execute_object_modification` - Modify existing objects (add methods, fields, etc.)

### Object Inspection
- `inspect_xpp_object` - View object structure and properties
- `get_object_code` - Extract X++ source code
- `get_object_summary` - Get object metadata and description

### Code Navigation
- `list_objects` - Browse D365 objects with filtering
- `search_xpp_codebase` - Search through X++ code with patterns

### Label Management
- `get_label` - Retrieve label text by ID
- `get_labels_batch` - Get multiple labels efficiently

### System Information
- `get_d365_setup_info` - View configuration and system info
- `get_available_object_types` - List all supported D365 object types
- `get_aot_structure` - Explore D365 AOT hierarchy

## See Also

- [README.md](../README.md) - Full documentation
- [ARCHITECTURE_GUIDE.md](../docs/ARCHITECTURE_GUIDE.md) - Technical architecture
- [MCP Servers in Visual Studio 2022](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers?view=vs-2022) - Official Microsoft documentation
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification and documentation
- Example configurations in `config/` directory
