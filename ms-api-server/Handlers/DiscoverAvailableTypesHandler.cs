using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using D365MetadataService.Models;
using Newtonsoft.Json;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for discovering available D365 types
    /// Reuses the proven logic from AvailableObjectTypesHandler
    /// </summary>
    public class DiscoverAvailableTypesHandler : BaseRequestHandler
    {
        public DiscoverAvailableTypesHandler(ILogger logger) : base(logger)
        {
        }

        /// <summary>
        /// Dynamically discovers the D365 metadata assembly without hardcoding specific types
        /// </summary>
        private Assembly GetD365MetadataAssembly()
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
                                       t.Name.StartsWith("Ax"))
                            .Take(5);
                        
                        if (metaModelTypes.Any())
                        {
                            Logger.Debug("Found D365 metadata assembly: {AssemblyName}", assembly.FullName);
                            return assembly;
                        }
                    }
                    catch (ReflectionTypeLoadException)
                    {
                        // Skip assemblies that can't be loaded
                        continue;
                    }
                }
                
                // Fallback: try Microsoft.Dynamics.AX.Metadata assembly by name
                try
                {
                    return Assembly.Load("Microsoft.Dynamics.AX.Metadata");
                }
                catch
                {
                    Logger.Warning("Could not find D365 metadata assembly dynamically or by name");
                    throw new InvalidOperationException("D365 metadata assembly not found.");
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error discovering D365 metadata assembly");
                throw;
            }
        }

        public override string SupportedAction => "discoverAvailableTypes";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            try
            {
                Logger.Information("Discovering available D365 types");

                // Reuse the proven approach from AvailableObjectTypesHandler
                var typeNames = GetAvailableObjectTypes();
                
                // Convert to TypeInfo format for consistency with dynamic reflection API
                var types = typeNames.Select(typeName => new Models.TypeInfo
                {
                    Name = typeName,
                    FullName = $"Microsoft.Dynamics.AX.Metadata.MetaModel.{typeName}",
                    Description = $"D365 {typeName} object type - supports creation and modification operations",
                    IsAbstract = false,
                    BaseType = "Microsoft.Dynamics.AX.Metadata.MetaModel.MetadataNode"
                }).ToList();

                Logger.Information("Found {TypeCount} available D365 types", types.Count);

                return Task.FromResult(ServiceResponse.CreateSuccess(types));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error discovering available D365 types");
                
                return Task.FromResult(ServiceResponse.CreateError($"Failed to discover available D365 types: {ex.Message}"));
            }
        }

        /// <summary>
        /// Get all available object types from D365 metadata model using reflection
        /// Reused from AvailableObjectTypesHandler - proven working approach
        /// </summary>
        private List<string> GetAvailableObjectTypes()
        {
            var objectTypes = new List<string>();

            try
            {
                // Use reflection to discover all Ax* types from the metadata assembly
                var metadataAssembly = GetD365MetadataAssembly();
                
                // Get all types that start with "Ax" and are public classes
                var axTypes = metadataAssembly.GetTypes()
                    .Where(type => 
                        type.IsClass && 
                        type.IsPublic && 
                        type.Name.StartsWith("Ax") &&
                        !type.IsAbstract &&
                        // Filter out internal/helper types
                        !type.Name.Contains("Collection") &&
                        !type.Name.Contains("Base") &&
                        !type.Name.Contains("Helper") &&
                        !type.Name.Contains("Util") &&
                        // Only include types that appear to be creatable objects
                        HasDefaultConstructor(type))
                    .Select(type => type.Name)
                    .OrderBy(name => name)
                    .ToList();

                objectTypes.AddRange(axTypes);

                Logger.Information($"Discovered {objectTypes.Count} object types from metadata assembly");
                
                // Log first few for debugging
                if (objectTypes.Count > 0)
                {
                    Logger.Information($"Sample object types: {string.Join(", ", objectTypes.Take(10))}");
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error discovering object types from metadata assembly");
                return new List<string>();
            }

            // If we didn't find any types, return empty - no fallbacks
            if (objectTypes.Count == 0)
            {
                Logger.Warning("No object types discovered, returning empty list");
                return new List<string>();
            }

            return objectTypes;
        }

        /// <summary>
        /// Check if a type has a default constructor (indicating it can be instantiated)
        /// </summary>
        private bool HasDefaultConstructor(Type type)
        {
            try
            {
                return type.GetConstructor(Type.EmptyTypes) != null;
            }
            catch
            {
                return false;
            }
        }


    }
}
