# Dual Transport Configuration Examples

## Option 1: STDIO Only (Default - Current VS Code Integration)

### .vscode/mcp.json
```json
{
	"servers": {
		"mcp-xpp-server": {
			"command": "node",
			"args": [
				"./build/index.js"
			],
			"cwd": "${workspaceFolder}",
			"type": "stdio"
		}
	},
	"inputs": []
}
```

## Option 2: HTTP Only (For External Services)

### Command Line
```powershell
node ./build/index.js --http-port 3001 --http-host 0.0.0.0 --no-stdio
```

### DevTunnel for External Access
```powershell
# Install DevTunnel (if not already installed)
# https://docs.microsoft.com/en-us/azure/developer/dev-tunnels/get-started

# Create tunnel for external access
devtunnel host -p 3001 --allow-anonymous

# Output will show public URL like:
# Connect via browser: https://abc123-3001.use.devtunnels.ms
```

## Option 3: Dual Transport (STDIO + HTTP)

### Command Line (Recommended for Development)
```powershell
node ./build/index.js --http-port 3001 --http-host 0.0.0.0
```

This configuration:
- ✅ Keeps STDIO for VS Code MCP integration
- ✅ Adds HTTP for external services (Copilot Studio, etc.)
- ✅ Allows DevTunnel for cloud access

### .vscode/mcp.json (Same as Option 1)
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

## HTTP API Endpoints

When HTTP transport is enabled, the following endpoints are available:

### Health Check
```
GET http://localhost:3001/health
```

### List Available Tools
```
GET http://localhost:3001/mcp/tools
```

### Execute Tool
```
POST http://localhost:3001/mcp/tools/{toolName}
Content-Type: application/json

{
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

### JSON-RPC Endpoint
```
POST http://localhost:3001/mcp/rpc
Content-Type: application/json

{
  "method": "tools/call",
  "params": {
    "name": "create_xpp_object",
    "arguments": {
      "objectType": "AxClass",
      "objectName": "MyNewClass",
      "model": "MyModel"
    }
  },
  "id": "1"
}
```

## Copilot Studio Integration

With HTTP transport enabled and DevTunnel:

1. Start server with HTTP: `node ./build/index.js --http-port 3001 --no-stdio`
2. Create DevTunnel: `devtunnel host -p 3001 --allow-anonymous`
3. Use the DevTunnel URL in Copilot Studio as your service endpoint
4. Configure endpoints:
   - Tools List: `GET {tunnel_url}/mcp/tools`
   - Tool Execution: `POST {tunnel_url}/mcp/tools/{toolName}`

## Benefits of Dual Transport

- 🏠 **Local Development**: STDIO integration with VS Code
- ☁️  **Cloud Services**: HTTP endpoints for external integration
- 🔧 **DevTunnel Ready**: Easy external access setup
- 🚀 **Single Server**: One process handles both transports
- 🔄 **Consistent API**: Same tools available on both transports
