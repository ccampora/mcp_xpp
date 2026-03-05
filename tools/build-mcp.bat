@echo off
REM Build TypeScript MCP Server
cd /d "%~dp0.."
echo Building TypeScript MCP Server...
powershell -ExecutionPolicy RemoteSigned -Command ".\tools\build-and-run.ps1 -Action build -Target mcp"
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b %errorlevel%
)
echo Build successful!
pause
