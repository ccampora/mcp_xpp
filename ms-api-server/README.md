# D365 Metadata Service

High-performance C# service for Microsoft Dynamics 365 Finance and Operations object creation using **Windows Named Pipes**.

## 🚀 Quick Setup

1. **Configure settings:**
   ```powershell
   Copy-Item appsettings.json.example appsettings.json
   # Edit appsettings.json with your D365 paths
   ```

2. **Find your D365 paths:**
   ```powershell
   # Find PackagesLocalDirectory
   Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Dynamics365" -Recurse -Directory -Name "PackagesLocalDirectory"
   
   # Find custom metadata folder (*.ocz)
   Get-ChildItem C:\ -Directory -Name "*.ocz" -ErrorAction SilentlyContinue
   ```

3. **Build and run:**
   ```powershell
   ..\tools\build-and-run.ps1 -Action build -Target csharp
   ..\tools\build-and-run.ps1 -Action run -Target csharp
   ```

## ⚙️ Configuration

- 📝 **Edit manually**: `appsettings.json` (your D365 paths)
- 🤖 **Auto-generated**: `app.config`, `D365MetadataService.csproj`

## 🚀 Named Pipes Benefits

- **15-30% faster** than TCP sockets
- **Windows optimized** IPC communication
- **More secure** - no network exposure
- **Simpler setup** - no port management

## 📖 Documentation

- **Full Guide**: [../docs/CSHARP_CONFIGURATION_GUIDE.md](../docs/CSHARP_CONFIGURATION_GUIDE.md)
