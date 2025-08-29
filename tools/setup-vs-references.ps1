#!/usr/bin/env pwsh

# Setup Visual Studio D365 Extension References
# This script dynamically finds the VS2022 D365 extension path and updates the .csproj file

Write-Host "=== Setting up Visual Studio D365 Extension References ===" -ForegroundColor Green

# Find Visual Studio 2022 installation path
$vsPath = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions"
if (-not (Test-Path $vsPath)) {
    $vsPath = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\Common7\IDE\Extensions"
    if (-not (Test-Path $vsPath)) {
        $vsPath = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\Extensions"
        if (-not (Test-Path $vsPath)) {
            Write-Host "❌ Visual Studio 2022 not found!" -ForegroundColor Red
            Write-Host "Please install Visual Studio 2022 with D365 development tools" -ForegroundColor Yellow
            exit 1
        }
    }
}

Write-Host "✅ Found Visual Studio 2022 at: $vsPath" -ForegroundColor Green

# Find D365 extension folder (it has a random name like avm13osb.viu)
$d365Extensions = Get-ChildItem $vsPath | Where-Object { 
    $_.PSIsContainer -and 
    (Test-Path (Join-Path $_.FullName "Microsoft.Dynamics.AX.Metadata.dll"))
}

if ($d365Extensions.Count -eq 0) {
    Write-Host "❌ D365 extension not found!" -ForegroundColor Red
    Write-Host "Please install the Dynamics 365 development tools for Visual Studio 2022" -ForegroundColor Yellow
    exit 1
}

$d365ExtensionPath = $d365Extensions[0].FullName
Write-Host "✅ Found D365 extension at: $d365ExtensionPath" -ForegroundColor Green

# Verify required DLLs exist
$requiredDlls = @(
    "Microsoft.Dynamics.AX.Metadata.dll",
    "Microsoft.Dynamics.AX.Metadata.Core.dll",
    "Microsoft.Dynamics.AX.Metadata.Storage.dll",
    "Microsoft.Dynamics.AX.Core.dll",
    "Microsoft.Dynamics.Framework.Tools.MetaModel.17.0.dll",
    "Microsoft.Dynamics.Framework.Tools.MetaModel.Core.17.0.dll"
)

foreach ($dll in $requiredDlls) {
    $dllPath = Join-Path $d365ExtensionPath $dll
    if (-not (Test-Path $dllPath)) {
        Write-Host "❌ Required DLL not found: $dll" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ All required DLLs found" -ForegroundColor Green

# Update .csproj file
$csprojPath = "ms-api-server\D365MetadataService.csproj"
$csprojContent = Get-Content $csprojPath -Raw

# Replace the hardcoded paths with the dynamically found path
$updatedContent = $csprojContent -replace 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\Extensions\\[^\\]+\\', ($d365ExtensionPath.Replace('\', '\\') + '\\')

# Write back to file
$updatedContent | Out-File $csprojPath -Encoding utf8 -NoNewline

Write-Host "✅ Updated D365MetadataService.csproj with dynamic paths" -ForegroundColor Green
Write-Host "Extension path: $d365ExtensionPath" -ForegroundColor Cyan

# Also update app.config
$appConfigPath = "ms-api-server\app.config"
$appConfigContent = Get-Content $appConfigPath -Raw

# Replace the hardcoded paths in app.config
$updatedAppConfig = $appConfigContent -replace 'C:/Program Files/Microsoft Visual Studio/2022/Professional/Common7/IDE/Extensions/[^/]+/', ($d365ExtensionPath.Replace('\', '/') + '/')

# Write back to file
$updatedAppConfig | Out-File $appConfigPath -Encoding utf8 -NoNewline

Write-Host "✅ Updated app.config with dynamic paths" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host "🎉 Setup complete! You can now build the project with:" -ForegroundColor Green
Write-Host "   dotnet build ms-api-server" -ForegroundColor White
Write-Host "   or use: .\tools\build-and-run.ps1 --run" -ForegroundColor White
