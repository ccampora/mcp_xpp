@echo off
REM Build both C# service and MCP server
cd /d "%~dp0.."
echo ================================================
echo Building MCP X++ Full Stack
echo ================================================

echo.
echo [1/2] Building C# D365 Metadata Service...
powershell -ExecutionPolicy RemoteSigned -Command ".\tools\build-and-run.ps1 -Action build -Target csharp"
if %errorlevel% neq 0 (
    echo C# build failed!
    pause
    exit /b %errorlevel%
)
echo C# service built successfully!

echo.
echo [2/2] Building TypeScript MCP Server...
powershell -ExecutionPolicy RemoteSigned -Command ".\tools\build-and-run.ps1 -Action build -Target mcp"
if %errorlevel% neq 0 (
    echo MCP build failed!
    pause
    exit /b %errorlevel%
)
echo MCP server built successfully!

echo.
echo ================================================
echo Build Complete!
echo ================================================
echo.
echo Next steps:
echo   - Run C# service: run-csharp.bat
echo   - Configure MCP clients (see config\QUICK_SETUP.md)
echo.
pause
