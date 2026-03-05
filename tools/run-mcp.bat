@echo off
REM Run MCP Server (for testing/debugging)
cd /d "%~dp0.."
echo Starting MCP Server...
echo Note: This is typically used via MCP clients (VS2022, Claude Desktop, VS Code)
echo Press Ctrl+C to stop the server
node .\build\index.js
