@echo off
REM Check status of MCP X++ components
cd /d "%~dp0.."
echo ================================================
echo MCP X++ Status Check
echo ================================================

echo.
echo [C# D365 Service Status]
tasklist /FI "IMAGENAME eq D365MetadataService.exe" 2>nul | find /I /N "D365MetadataService.exe" >nul
if "%ERRORLEVEL%"=="0" (
    echo   Status: RUNNING
    echo   Details:
    for /f "tokens=2" %%a in ('tasklist /fi "imagename eq D365MetadataService.exe" /fo list ^| find "PID:"') do echo     PID: %%a
) else (
    echo   Status: NOT RUNNING
    echo   Start with: run-csharp.bat
)

echo.
echo [Node.js]
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do echo   Installed: %%i
) else (
    echo   Status: NOT FOUND
)

echo.
echo [.NET SDK]
where dotnet >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('dotnet --version') do echo   Installed: %%i
) else (
    echo   Status: NOT FOUND
)

echo.
echo [Build Outputs]
if exist "build\index.js" (
    echo   MCP Server: BUILT
) else (
    echo   MCP Server: NOT BUILT (run build-mcp.bat)
)

if exist "ms-api-server\bin" (
    echo   C# Service: BUILT
) else (
    echo   C# Service: NOT BUILT (run build-csharp.bat)
)

echo.
echo [Configuration Files]
if exist "%USERPROFILE%\.mcp.json" (
    echo   VS2022 MCP Config: EXISTS
) else (
    echo   VS2022 MCP Config: MISSING (run setup.bat)
)

if exist ".vscode\mcp.json" (
    echo   VS Code MCP Config: EXISTS
) else (
    echo   VS Code MCP Config: MISSING
)

if exist "ms-api-server\appsettings.json" (
    echo   C# Service Config: EXISTS
) else (
    echo   C# Service Config: MISSING (run setup.bat)
)

echo.
echo ================================================
pause
