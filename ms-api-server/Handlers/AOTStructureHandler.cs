using D365MetadataService.Models;
using D365MetadataService.Services;
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
        private readonly FileSystemManager _fileSystemManager;

        public AOTStructureHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _fileSystemManager = FileSystemManager.Instance;
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
                // Load the D365 Metadata assembly using centralized filesystem manager
                string assemblyPath = null;
                if (!string.IsNullOrEmpty(_config.D365Config.MetadataAssemblyPath))
                {
                    assemblyPath = _config.D365Config.MetadataAssemblyPath;
                }
                else
                {
                    // Try to find it in VS2022 extension directory
                    var extensionPath = _fileSystemManager.GetVS2022ExtensionPath();
                    if (!string.IsNullOrEmpty(extensionPath))
                    {
                        assemblyPath = _fileSystemManager.CombinePath(extensionPath, "Microsoft.Dynamics.AX.Metadata.dll");
                    }
                }

                if (string.IsNullOrEmpty(assemblyPath) || !_fileSystemManager.FileExists(assemblyPath))
                {
                    return ServiceResponse.CreateError("Microsoft.Dynamics.AX.Metadata.dll not found");
                }

                // Load assembly and get types using centralized filesystem manager
                var result = await Task.Run(() =>
                {
                    var assembly = _fileSystemManager.LoadAssemblyFromPath(assemblyPath);
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


    }
}
