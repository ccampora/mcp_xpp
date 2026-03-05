@echo off
REM Run C# D365 Metadata Service
cd /d "%~dp0.."
echo Starting C# D365 Metadata Service...
echo Press Ctrl+C to stop the service
powershell -ExecutionPolicy RemoteSigned -Command ".\tools\build-and-run.ps1 -Action run -Target csharp"
