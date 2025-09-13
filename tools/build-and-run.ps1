#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Build and run script for MCP X++ Codebase Server

.DESCRIPTION
    Comprehensive build script that handles setup, building, and running of both TypeScript MCP server and C# D365 service.
    Consolidates all project operations into a single parameterized script.

.PARAMETER Action
    What action to perform: setup, build, run, test, clean, or all (default: build)

.PARAMETER Target
    What to target: mcp, csharp, or both (default: both)

.PARAMETER Configuration
    Build configuration: Debug or Release (default: Release)

.PARAMETER SkipSetup
    Skip the VS reference setup step (default: false)

.PARAMETER SkipRestore
    Skip package restore step (default: false)

.PARAMETER Port
    Port for C# service (default: 7890)

.PARAMETER Help
    Show help information

.EXAMPLE
    .\build-and-run.ps1
    # Builds both MCP and C# service

.EXAMPLE
    .\build-and-run.ps1 -Action run -Target csharp
    # Runs the C# service only

.EXAMPLE
    .\build-and-run.ps1 -Action all
    # Complete setup, build, and run both services

.EXAMPLE
    .\build-and-run.ps1 -Action setup
    # First-time setup only

.EXAMPLE
    .\build-and-run.ps1 -Action clean
    # Clean all build outputs
#>

param(
    [ValidateSet("setup", "build", "run", "test", "clean", "all")]
    [string]$Action = "build",
    
    [ValidateSet("mcp", "csharp", "both")]
    [string]$Target = "both",
    
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    
    [switch]$SkipSetup,
    
    [switch]$SkipRestore,
    
    [int]$Port = 7890,
    
    [switch]$Help
)

# Show help and exit
if ($Help) {
    Get-Help $PSCommandPath -Detailed
    exit 0
}

# Function to show colored status messages
function Write-Status {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "`n=== $Message ===" -ForegroundColor $Color
}

function Write-Step {
    param([string]$Message)
    Write-Host ">> $Message..." -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Main script logic
try {
    $originalLocation = Get-Location
    
    Write-Status "MCP X++ Build and Run Script"
    Write-Host "Action: $Action | Target: $Target | Configuration: $Configuration" -ForegroundColor Cyan
    
    # Setup Phase
    if ($Action -in @("setup", "all") -and !$SkipSetup) {
        Write-Status "Setup Phase"
        
        Write-Step "Checking prerequisites"
        
        # Check Node.js
        try {
            $nodeVersion = node --version 2>$null
            Write-Success "Node.js: $nodeVersion"
        } catch {
            Write-ErrorMsg "Node.js not found! Please install Node.js"
            exit 1
        }
        
        # Check .NET
        try {
            $dotnetVersion = dotnet --version 2>$null
            Write-Success ".NET SDK: $dotnetVersion"
        } catch {
            Write-ErrorMsg ".NET SDK not found! Please install .NET SDK"
            exit 1
        }
        
        Write-Step "Setting up Visual Studio D365 extension references"
        & "$PSScriptRoot\setup-vs-references.ps1"
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "VS reference setup failed!"
            exit 1
        }
        
        Write-Success "Setup completed"
    }
    
    # Clean Phase
    if ($Action -in @("clean", "all")) {
        Write-Status "Clean Phase"
        
        if ($Target -in @("mcp", "both")) {
            Write-Step "Cleaning TypeScript build"
            if (Test-Path "build") {
                Remove-Item "build" -Recurse -Force
                Write-Success "Cleaned TypeScript build directory"
            }
            
            if (Test-Path "node_modules") {
                Write-Step "Removing Node.js dependencies"
                try {
                    # Try normal removal first
                    Remove-Item "node_modules" -Recurse -Force -ErrorAction Stop
                    Write-Success "Cleaned Node.js dependencies"
                } catch {
                    # If that fails, try more aggressive cleanup
                    Write-Host ">> Some files are locked, trying alternative cleanup..." -ForegroundColor Yellow
                    try {
                        # Use robocopy to remove the directory (Windows utility that can handle locked files better)
                        if (Get-Command robocopy -ErrorAction SilentlyContinue) {
                            $tempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
                            robocopy $tempDir.FullName "node_modules" /MIR | Out-Null
                            Remove-Item $tempDir.FullName -Force
                            if (!(Test-Path "node_modules")) {
                                Write-Success "Cleaned Node.js dependencies (alternative method)"
                            } else {
                                Write-Host ">> Some Node.js files may still be locked. Try closing editors/terminals and run again." -ForegroundColor Yellow
                            }
                        } else {
                            Write-Host ">> Unable to fully clean node_modules due to locked files. Try closing all editors/terminals." -ForegroundColor Yellow
                        }
                    } catch {
                        Write-Host ">> Unable to fully clean node_modules due to locked files. Try closing all editors/terminals." -ForegroundColor Yellow
                    }
                }
            }
            
            if (Test-Path "cache") {
                Write-Step "Cleaning cache directory"
                Remove-Item "cache" -Recurse -Force -ErrorAction SilentlyContinue
                Write-Success "Cleaned cache directory"
            }
        }
        
        if ($Target -in @("csharp", "both")) {
            Write-Step "Cleaning C# build"
            Set-Location "ms-api-server"
            
            # Remove generated files
            if ((Test-Path "app.config") -and (Test-Path "app.config.template")) {
                Remove-Item "app.config" -Force -ErrorAction SilentlyContinue
                Write-Success "Removed generated app.config"
            }
            if ((Test-Path "D365MetadataService.csproj") -and (Test-Path "D365MetadataService.csproj.template")) {
                Remove-Item "D365MetadataService.csproj" -Force -ErrorAction SilentlyContinue
                Write-Success "Removed generated .csproj"
            }
            
            dotnet clean --configuration $Configuration
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Cleaned C# build outputs"
            }
            Set-Location $originalLocation
        }
        
        if ($Action -eq "clean") {
            Write-Success "Clean completed"
            exit 0
        }
    }
    
    # Build Phase
    if ($Action -in @("build", "run", "test", "all")) {
        Write-Status "Build Phase"
        
        if ($Target -in @("mcp", "both")) {
            Write-Step "Installing Node.js dependencies"
            if (!$SkipRestore) {
                npm install
                if ($LASTEXITCODE -ne 0) {
                    Write-ErrorMsg "Node.js dependency installation failed!"
                    exit 1
                }
                Write-Success "Node.js dependencies installed"
            }
            
            Write-Step "Building TypeScript MCP Server"
            npm run build
            if ($LASTEXITCODE -ne 0) {
                Write-ErrorMsg "TypeScript build failed!"
                exit 1
            }
            Write-Success "TypeScript MCP Server built successfully"
        }
        
        if ($Target -in @("csharp", "both")) {
            Write-Status "Killing any existing D365 services"
            taskkill /f /im D365MetadataService.exe; 
        
            Write-Step "Building C# Metadata Service"
            Set-Location "ms-api-server"
            
            # Get the actual VS extension path (used for both app.config and .csproj)
            $vsInstallPath = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" | 
                Where-Object { $_.DisplayName -like "*Visual Studio*2022*" } | 
                Select-Object -First 1 -ExpandProperty InstallLocation
            
            if (!$vsInstallPath) {
                $vsInstallPath = "C:\Program Files\Microsoft Visual Studio\2022\Professional\"
            }
            
            $extensionsPath = Join-Path $vsInstallPath "Common7\IDE\Extensions"
            $d365Extensions = Get-ChildItem $extensionsPath -Directory | Where-Object { 
                Test-Path (Join-Path $_.FullName "Microsoft.Dynamics.AX.Metadata.dll") 
            }
            
            if ($d365Extensions.Count -gt 0) {
                $actualExtensionPath = $d365Extensions[0].FullName.Replace('\', '/')
                $placeholderPathForwardSlash = "C:/Program Files/Microsoft Visual Studio/2022/Professional/Common7/IDE/Extensions/avm13osb.viu/"
                $placeholderPathBackslash = "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\Extensions\\avm13osb.viu"
                $actualExtensionPathBackslash = $d365Extensions[0].FullName
                $placeholderCsprojPath = "{{VS_EXTENSION_PATH}}"
                
                Set-Location $originalLocation
                Set-Location "ms-api-server"
                
                # Generate app.config from template
                $appConfigPath = "app.config"
                $appConfigTemplatePath = "app.config.template"
                if (!(Test-Path $appConfigPath) -or (Test-Path $appConfigTemplatePath)) {
                    Write-Step "Generating app.config from template"
                    $templateContent = Get-Content $appConfigTemplatePath -Raw
                    $updatedContent = $templateContent -replace [regex]::Escape($placeholderPathForwardSlash), "$actualExtensionPath/"
                    $updatedContent | Out-File -FilePath $appConfigPath -Encoding UTF8
                    Write-Success "Generated app.config with extension path: $actualExtensionPath"
                }
                
                # Generate .csproj from template  
                $csprojPath = "D365MetadataService.csproj"
                $csprojTemplatePath = "D365MetadataService.csproj.template"
                if (!(Test-Path $csprojPath) -or (Test-Path $csprojTemplatePath)) {
                    Write-Step "Generating .csproj from template"
                    $templateContent = Get-Content $csprojTemplatePath -Raw
                    $updatedContent = $templateContent -replace [regex]::Escape($placeholderCsprojPath), $actualExtensionPathBackslash
                    $updatedContent | Out-File -FilePath $csprojPath -Encoding UTF8
                    Write-Success "Generated .csproj with extension path: $actualExtensionPathBackslash"
                }
                
            } else {
                Write-Host ">> Warning: Could not find D365 VS extension, using default templates" -ForegroundColor Yellow
                Set-Location $originalLocation
                Set-Location "ms-api-server"
                
                # Use default templates
                if (Test-Path "app.config.template") {
                    Copy-Item "app.config.template" "app.config" -Force
                }
                if (Test-Path "D365MetadataService.csproj.template") {
                    Copy-Item "D365MetadataService.csproj.template" "D365MetadataService.csproj" -Force
                }
            }
            
            if (!$SkipRestore) {
                Write-Step "Restoring NuGet packages"
                dotnet restore
                if ($LASTEXITCODE -ne 0) {
                    Write-ErrorMsg "Package restore failed!"
                    Set-Location $originalLocation
                    exit 1
                }
                Write-Success "NuGet packages restored"
            }
            
            dotnet build --configuration $Configuration
            $buildSuccess = $LASTEXITCODE -eq 0
            Set-Location $originalLocation
            
            if ($buildSuccess) {
                Write-Success "C# Metadata Service built successfully"
            } else {
                Write-ErrorMsg "C# build failed!"
                if ($Action -ne "all") { exit 1 }
            }
        }
    }
    
    # Test Phase
    if ($Action -in @("test", "all")) {
        Write-Status "Test Phase"
        
        if ($Target -in @("mcp", "both")) {
            if (Test-Path "package.json") {
                $packageJson = Get-Content "package.json" | ConvertFrom-Json
                if ($packageJson.scripts.test) {
                    Write-Step "Running TypeScript tests"
                    npm test
                    if ($LASTEXITCODE -eq 0) {
                        Write-Success "TypeScript tests passed"
                    } else {
                        Write-ErrorMsg "TypeScript tests failed"
                        if ($Action -ne "all") { exit 1 }
                    }
                }
            }
        }
        
        if ($Target -in @("csharp", "both")) {
            Write-Step "Running C# tests"
            Set-Location "ms-api-server"
            dotnet test --configuration $Configuration --no-build
            $testSuccess = $LASTEXITCODE -eq 0
            Set-Location $originalLocation
            
            if ($testSuccess) {
                Write-Success "C# tests passed"
            } else {
                Write-ErrorMsg "C# tests failed"
                if ($Action -ne "all") { exit 1 }
            }
        }
    }
    
    # Run Phase
    if ($Action -in @("run", "all")) {
        Write-Status "Run Phase"
        
        if ($Target -eq "mcp") {
            Write-Step "Starting TypeScript MCP Server"
            Write-Host "Use Ctrl+C to stop the server" -ForegroundColor Cyan
            Write-Host ""
            node ./build/index.js --help
            Write-Host ""
            Write-Host "To run with specific paths, use:" -ForegroundColor Cyan
            Write-Host "node ./build/index.js --xpp-path 'your-path' --xpp-metadata-folder 'your-metadata-path'" -ForegroundColor White
            
        } elseif ($Target -eq "csharp") {
            Write-Step "Starting C# Metadata Service"
            Write-Host "Service will use Named Pipes (not HTTP port)" -ForegroundColor Cyan
            Write-Host "Use Ctrl+C to stop the service" -ForegroundColor Cyan
            Write-Host ""
            
            Set-Location "ms-api-server"
            $env:ASPNETCORE_URLS = "http://localhost:$Port"
            dotnet run --configuration $Configuration --no-build
            Set-Location $originalLocation
            
        } elseif ($Target -eq "both") {
            Write-Host ""
            Write-Host "Both services built successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "To start services individually:" -ForegroundColor Cyan
            Write-Host "  MCP Server:  .\tools\build-and-run.ps1 -Action run -Target mcp" -ForegroundColor White
            Write-Host "  C# Service:  .\tools\build-and-run.ps1 -Action run -Target csharp" -ForegroundColor White
            Write-Host ""
            Write-Host "Or use VS Code tasks to run background services" -ForegroundColor Gray
        }
    }
    
    # Success message for build-only actions
    if ($Action -eq "build") {
        Write-Status "Build Complete!" "Green"
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  Run C# service:  .\tools\build-and-run.ps1 -Action run -Target csharp" -ForegroundColor White
        Write-Host "  Run MCP server:  .\tools\build-and-run.ps1 -Action run -Target mcp" -ForegroundColor White
        Write-Host "  Run tests:       .\tools\build-and-run.ps1 -Action test" -ForegroundColor White
    }
    
} catch {
    $errorMessage = $_.Exception.Message
    Write-Host "[ERROR] Script execution failed: $errorMessage" -ForegroundColor Red
    exit 1
} finally {
    Set-Location $originalLocation
}
