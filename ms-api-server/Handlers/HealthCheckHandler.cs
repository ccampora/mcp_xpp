using D365MetadataService.Models;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for health check requests - simple, fast operations
    /// </summary>
    public class HealthCheckHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;

        public HealthCheckHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        /// <summary>
        /// Dynamically discovers supported object types instead of hardcoding them
        /// </summary>
        private string[] GetSupportedObjectTypes()
        {
            try
            {
                // Get all loaded assemblies and find the one containing D365 metadata types
                var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                
                foreach (var assembly in assemblies)
                {
                    try
                    {
                        // Look for assemblies that contain types in Microsoft.Dynamics.AX.Metadata.MetaModel namespace
                        var metaModelTypes = assembly.GetTypes()
                            .Where(t => t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel" && 
                                       t.Name.StartsWith("Ax") && 
                                       t.IsClass && 
                                       !t.IsAbstract && 
                                       t.IsPublic)
                            .Select(t => t.Name)
                            .OrderBy(name => name)
                            .Take(50) // Limit to top 50 most common types for health check
                            .ToArray();
                        
                        if (metaModelTypes.Any())
                        {
                            Logger.Debug("Found {Count} supported object types dynamically", metaModelTypes.Length);
                            return metaModelTypes;
                        }
                    }
                    catch (ReflectionTypeLoadException)
                    {
                        // Skip assemblies that can't be loaded
                        continue;
                    }
                }
                
                // Fallback to minimal set if dynamic discovery fails
                Logger.Warning("Could not discover object types dynamically, returning empty array");
                return new string[0];
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error discovering supported object types");
                return new string[0];
            }
        }

        /// <summary>
        /// NO HARDCODING: Dynamically find the D365 metadata assembly
        /// </summary>
        private System.Reflection.Assembly GetD365MetadataAssembly()
        {
            try
            {
                // Get all loaded assemblies and find the one containing D365 metadata types
                var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                
                foreach (var assembly in assemblies)
                {
                    try
                    {
                        // Look for assemblies that contain types in Microsoft.Dynamics.AX.Metadata.MetaModel namespace
                        var metaModelTypes = assembly.GetTypes()
                            .Where(t => t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel" && 
                                       t.Name.StartsWith("Ax") && 
                                       !t.IsAbstract)
                            .Take(5)
                            .ToArray();
                            
                        if (metaModelTypes.Any())
                        {
                            Logger.Debug("Found D365 metadata assembly: {AssemblyName} with {TypeCount} Ax types", 
                                assembly.FullName, metaModelTypes.Length);
                            return assembly;
                        }
                    }
                    catch (ReflectionTypeLoadException)
                    {
                        // Skip assemblies that can't be loaded
                        continue;
                    }
                }
                
                throw new InvalidOperationException("Could not find D365 metadata assembly");
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error finding D365 metadata assembly");
                throw;
            }
        }

        public override string SupportedAction => "health";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            var healthResult = new HealthCheckResult
            {
                Status = "Healthy",
                Timestamp = DateTime.UtcNow,
                ActiveConnections = 0, // This would need to be injected from server
                MaxConnections = _config.MaxConnections,
                ServiceInfo = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["Transport"] = "NamedPipes",
                    ["PipeName"] = "mcp-xpp-d365-service",
                    ["DefaultModel"] = _config.D365Config.DefaultModel,
                    ["AssemblyPath"] = _config.D365Config.MetadataAssemblyPath,
                    ["ServerVersion"] = "1.0.0",
                    ["SupportedObjectTypes"] = GetSupportedObjectTypes()
                }
            };

            return Task.FromResult(ServiceResponse.CreateSuccess(healthResult));
        }
    }
}
