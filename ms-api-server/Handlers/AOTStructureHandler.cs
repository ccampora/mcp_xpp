using D365MetadataService.Models;
using Serilog;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for AOT structure requests (Application Object Tree metadata)
    /// </summary>
    public class AOTStructureHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;

        public AOTStructureHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        public override string SupportedAction => "aotstructure";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling AOT Structure request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Load the D365 Metadata assembly
                string assemblyPath = null;
                if (!string.IsNullOrEmpty(_config.D365Config.MetadataAssemblyPath))
                {
                    assemblyPath = _config.D365Config.MetadataAssemblyPath;
                }
                else
                {
                    // Try to find it in VS2022 extension directory
                    var extensionPath = GetVS2022ExtensionPath();
                    if (extensionPath != null)
                    {
                        assemblyPath = Path.Combine(extensionPath, "Microsoft.Dynamics.AX.Metadata.dll");
                    }
                }

                if (string.IsNullOrEmpty(assemblyPath) || !File.Exists(assemblyPath))
                {
                    return ServiceResponse.CreateError("Microsoft.Dynamics.AX.Metadata.dll not found");
                }

                // Load assembly and get types using reflection
                var result = await Task.Run(() =>
                {
                    var assembly = System.Reflection.Assembly.LoadFrom(assemblyPath);
                    var types = assembly.GetTypes()
                        .Where(t => t.IsPublic && t.IsClass && !t.IsAbstract && t.Name.StartsWith("Ax"))
                        .Select(t => new
                        {
                            Name = t.Name,
                            FullName = t.FullName,
                            Namespace = t.Namespace,
                            BaseType = t.BaseType?.Name,
                            Properties = t.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance)
                                .Select(p => new
                                {
                                    Name = p.Name,
                                    Type = p.PropertyType.Name,
                                    CanRead = p.CanRead,
                                    CanWrite = p.CanWrite
                                }).ToArray()
                        })
                        .OrderBy(t => t.Name)
                        .ToList();

                    Logger.Information("Found {TypeCount} types from metadata assembly", types.Count);

                    return new
                    {
                        totalTypes = types.Count,
                        assemblyPath = assemblyPath,
                        types = types,
                        generatedAt = DateTime.UtcNow
                    };
                });

                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to process AOT structure request");
                return ServiceResponse.CreateError($"AOT structure operation failed: {ex.Message}");
            }
        }

        private string GetVS2022ExtensionPath()
        {
            try
            {
                // Try to find VS2022 extension path from common locations
                var commonPaths = new[]
                {
                    @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\Extensions"
                };

                foreach (var basePath in commonPaths)
                {
                    if (Directory.Exists(basePath))
                    {
                        // Look for directories containing AX-related files
                        var extensionDirs = Directory.GetDirectories(basePath, "*", SearchOption.TopDirectoryOnly);
                        foreach (var dir in extensionDirs)
                        {
                            if (File.Exists(Path.Combine(dir, "Microsoft.Dynamics.AX.Metadata.dll")))
                            {
                                return dir;
                            }
                        }
                    }
                }

                return _config.D365Config.MetadataAssemblyPath != null 
                    ? Path.GetDirectoryName(_config.D365Config.MetadataAssemblyPath)
                    : null;
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Failed to determine VS2022 extension path");
                return null;
            }
        }
    }
}
