# Quick MCP Setup - Your Environment

## Your D365 Environment

- **Default Model**: HSO
- **Metadata Path**: `D:\Repo\Dometic_Basecamp_D365FO\Trunk\Main\Metadata`
- **Custom Metadata**: `D:\Repo\Dometic_Basecamp_D365FO\Trunk\Main\Metadata\HSO`
- **MCP Server Path**: `D:\Repo\RenVol_GitHub\mcp_xpp`

## Claude Desktop Setup (Recommended)

1. Open or create: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add this configuration:

```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js"
      ]
    }
  }
}
```

3. Restart Claude Desktop
4. Look for the MCP tools in the tool picker (🔌 icon)

## Visual Studio 2022 Setup

**Quick Method: Edit `%USERPROFILE%\.mcp.json`**

1. Create or edit: `%USERPROFILE%\.mcp.json` (e.g., `C:\Users\YourName\.mcp.json`)
2. Add this configuration:

```json
{
  "mcpServers": {
    "mcp-xpp-d365": {
      "command": "node",
      "args": [
        "D:\\Repo\\RenVol_GitHub\\mcp_xpp\\build\\index.js"
      ]
    }
  }
}
```

3. Save the file and restart Visual Studio 2022
4. Access via GitHub Copilot chat with `@mcp-xpp-d365`

**Alternative - UI Method:**

1. Open Visual Studio 2022 (version 17.13 or later)
2. Go to: **Tools > Options > GitHub > Copilot > MCP Servers**
3. Add new MCP server with these settings:
   - **Name**: `mcp-xpp-d365`
   - **Command**: `node`
   - **Arguments**: `D:\Repo\RenVol_GitHub\mcp_xpp\build\index.js`
4. Restart Visual Studio
5. Access tools through GitHub Copilot chat

**Pre-configured file:** Copy `config/vs2022_mcp_config.json` to `%USERPROFILE%\.mcp.json`

## VS Code Setup

The configuration is already in `.vscode/mcp.json` - just reload VS Code!

## Before Using

1. **Start the C# Service** (must be running):
   ```powershell
   .\tools\build-and-run.ps1 -Action run -Target csharp
   ```

2. **Verify it's running**:
   ```powershell
   Get-Process D365MetadataService
   ```

## Quick Test

Once connected, try asking:
- "What D365 models are in my environment?"
- "List all classes in the HSO model"
- "Create a new class called TestClass in the HSO model"

## Files Created

- **[%USERPROFILE%\.mcp.json](C:\Users\localadmin\.mcp.json)** - Visual Studio 2022 configuration (already created!)
- [config/claude_desktop_config.json](./claude_desktop_config.json) - Copy to Claude Desktop config location
- [config/vs2022_mcp_config.json](./vs2022_mcp_config.json) - Alternative VS2022 config (if needed)
- [.vscode/mcp.json](../.vscode/mcp.json) - VS Code MCP configuration (already in place)
- [config/mcp-setup-guide.md](./mcp-setup-guide.md) - Detailed setup guide

## Troubleshooting

**Visual Studio 2022 doesn't show MCP servers option?**
- Ensure you have Visual Studio 2022 version 17.13 or later
- Check if `%USERPROFILE%\.mcp.json` exists (should be at `C:\Users\localadmin\.mcp.json`)
- Make sure GitHub Copilot extension is installed and active
- Check **Tools > Options > GitHub > Copilot** for MCP Servers section
- Restart Visual Studio after configuration changes

**Claude Desktop doesn't show the server?**
- Make sure Claude Desktop is fully restarted (quit from system tray)
- Check the path in the config file matches your installation
- Check Claude Desktop logs in `%APPDATA%\Claude\logs`

**VS Code doesn't connect?**
- Reload the window (Ctrl+Shift+P → "Reload Window")
- Check that the build folder exists: `.\build\index.js`
- Look for errors in the MCP output panel

**MCP server errors?**
- Verify C# service is running: `Get-Process D365MetadataService`
- Check server logs: `.\logs\mcp-server.log`
- Rebuild if needed: `.\tools\build-and-run.ps1 -Action build -Target mcp`
