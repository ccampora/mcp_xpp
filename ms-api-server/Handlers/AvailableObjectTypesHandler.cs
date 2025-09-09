using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.Framework.Tools.MetaModel.Core;
using D365MetadataService.Models;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for retrieving available object types from VS2022 service
    /// </summary>
    public class AvailableObjectTypesHandler : BaseRequestHandler
    {
        public AvailableObjectTypesHandler(ILogger logger) : base(logger)
        {
        }

        public override string SupportedAction => "getAvailableObjectTypes";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            try
            {
                // Get all available object types that can be created in D365
                var availableTypes = GetAvailableObjectTypes();

                return Task.FromResult(ServiceResponse.CreateSuccess(new
                {
                    ObjectTypes = availableTypes,
                    Count = availableTypes.Count
                }));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to get available object types");
                return Task.FromResult(ServiceResponse.CreateError(
                    $"Failed to get available object types: {ex.Message}"));
            }
        }

        /// <summary>
        /// Get all available object types from D365 metadata model using reflection
        /// </summary>
        private List<string> GetAvailableObjectTypes()
        {
            var objectTypes = new List<string>();

            try
            {
                // Use reflection to discover all Ax* types from the metadata assembly
                var metadataAssembly = typeof(AxClass).Assembly;
                
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
                return GetFallbackObjectTypes();
            }

            // If we didn't find any types, use fallback
            if (objectTypes.Count == 0)
            {
                Logger.Warning("No object types discovered, using fallback list");
                return GetFallbackObjectTypes();
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

        /// <summary>
        /// Get fallback object types if the full list fails
        /// </summary>
        private List<string> GetFallbackObjectTypes()
        {
            return new List<string>
            {
                "AxModel",
                "AxClass", 
                "AxTable",
                "AxEnum",
                "AxForm"
            };
        }
    }
}
