@echo off
REM Build C# D365 Metadata Service
cd /d "%~dp0.."
echo Building C# D365 Metadata Service...
powershell -ExecutionPolicy RemoteSigned -Command ".\tools\build-and-run.ps1 -Action build -Target csharp"
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b %errorlevel%
)
echo Build successful!
pause
