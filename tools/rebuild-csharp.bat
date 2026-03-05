@echo off
REM Rebuild and run C# D365 Metadata Service (kill existing, build, and run)
cd /d "%~dp0.."
echo Stopping any existing D365 Metadata Service...
taskkill /f /im D365MetadataService.exe 2>nul
timeout /t 2 /nobreak >nul

echo Rebuilding C# D365 Metadata Service...
powershell -ExecutionPolicy RemoteSigned -Command ".\tools\build-and-run.ps1 -Action run -Target csharp"
