# mcp_xpp – Claude Code Project Guide

## Golden Rules (from .github/copilot-instructions.md)

1. **No emojis in code** — not in source files, comments, or test assertions
2. **Test suites and adhoc test files** — use clients provided in `tests/tools/` folder
3. **Build via `tools/build-and-run.ps1` only** — do not run `dotnet build`, `npm run build`, or `tsc` directly
4. **No hardcoding** — if hardcoding is needed, ask the user first
5. **Misc/adhoc files** (one-off tests, outputs, scratch files not to be versioned) go in `misc/` folder
6. **Internal documentation** goes in `docs/internal/` folder

## Architecture Overview

- **Node.js MCP server** (`src/`) — TypeScript, built to `build/`
- **C# named-pipe service** (`ms-api-server/`) — provides D365 metadata reflection over `\\.\pipe\mcp-xpp-d365-service`; built with .NET 8
- **SQLite index** (`cache/object-lookup.db`) — indexes `Tables, Classes, Forms, Enums, DataEntityViews, CompositeDataEntityViews, LabelFiles, Maps, Menus, Queries, Reports, Views` (no `Edts`)
- **Test framework**: Vitest (`tests/`)
- **Build script**: `tools/build-and-run.ps1` (single entry point for all build/run/test actions)

## Key Paths

- D365 metadata root: `{drive}\{repo}\{project}\Trunk\Main\Metadata` (configured in `ms-api-server/appsettings.json`)
- Label files: `{PackagesLocalDirectory}/{Package}/{Model}/AxLabelFile/LabelResources/{lang}/{FileId}.{lang}.label.txt`
- EDT XML: `{PackagesLocalDirectory}/{Package}/{Model}/AxEdt/{EdtName}.xml`
- C# service binary: `ms-api-server/bin/Release/net8.0/win-x64/D365MetadataService.exe`

## Build & Run Commands

All operations go through the unified build script from the repo root:

```powershell
# Build everything (TypeScript + C#)
.\tools\build-and-run.ps1 -Action build

# Build only TypeScript MCP server
.\tools\build-and-run.ps1 -Action build -Target mcp

# Build only C# service
.\tools\build-and-run.ps1 -Action build -Target csharp

# Run the C# service
.\tools\build-and-run.ps1 -Action run -Target csharp

# Run the MCP server
.\tools\build-and-run.ps1 -Action run -Target mcp

# Run tests
.\tools\build-and-run.ps1 -Action test

# First-time setup (VS2022 reference configuration)
.\tools\build-and-run.ps1 -Action setup

# Clean all build outputs
.\tools\build-and-run.ps1 -Action clean
```

If the C# build is locked by a running process:
```powershell
powershell -Command "Stop-Process -Name D365MetadataService -Force"
```

## Automated Testing

### Prerequisites
1. **Start the C# service** (must be running before integration tests):
   ```powershell
   .\tools\build-and-run.ps1 -Action run -Target csharp
   ```
   Verify connectivity: `node tests/ping-service.mjs`

2. **Rebuild after code changes** before running tests:
   ```powershell
   .\tools\build-and-run.ps1 -Action build
   ```

### Running Regression Tests
```
npx vitest run tests/issue-regression.test.js
```

Or all tests via the build script:
```powershell
.\tools\build-and-run.ps1 -Action test
```

### Test Details
- `beforeAll` has a **60-second timeout** for `AppConfig.initialize()`
- Tests skip gracefully when the D365 service is unavailable (`isServiceAvailable()` guard)
- `tests/issue-regression.test.js` — 9 tests covering issues #6 (label parsing), #7 (field XML enrichment), #8 (controls mode)

### Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Tests skip silently | Service not running | Run ping test, start service |
| Label tests fail | C# not rebuilt after `LabelParser.cs` change | Rebuild + restart service |
| `AppConfig` init fails | Wrong path in `appsettings.json` | Check `PackagesLocalDirectory` |
| Build locked | Service process still running | Stop process, then rebuild |

## Important Implementation Notes

### Windows Junction Points
`ApplicationSuite`, `ApplicationPlatform`, etc. are NTFS junction points. **Always use `statSync(p).isDirectory()`** instead of `dirent.isDirectory()` — `dirent.isDirectory()` returns `false` for junctions.

### Label File Format
`SYS.en-us.label.txt` entries use `@`-prefixed keys: `@SYS19627=Sales order`. The `LabelLineRegex` in `LabelParser.cs` uses `^@?` to handle this.

### EDT Labels
Fields that have no own `<Label>` inherit from their `<ExtendedDataType>`. EDTs are **not** in the SQLite index — look them up via `findXmlFile(edtName, 'AxEdt')` on the filesystem.

### XML Field Parsing
Use `indexOf`/`lastIndexOf` for field block extraction in large XML files — regex with `[\s\S]*?` causes catastrophic backtracking on 1MB+ files with CDATA sections.
