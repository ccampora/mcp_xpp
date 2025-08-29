#!/usr/bin/env pwsh

# First-time setup script for MCP X++ Codebase Server
# This script prepares the project for building on any machine

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  MCP X++ First-Time Setup" -ForegroundColor Cyan  
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will be deprecated in favor of the unified build script." -ForegroundColor Yellow
Write-Host "Please use: .\tools\build-and-run.ps1 -Action setup" -ForegroundColor Cyan
Write-Host ""
Write-Host "Redirecting to unified script..." -ForegroundColor Yellow

# Redirect to the unified script
& "$PSScriptRoot\build-and-run.ps1" -Action all
