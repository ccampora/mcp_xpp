using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.AX.Metadata.Service;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Microsoft.Dynamics.AX.Metadata.Providers;
using Microsoft.Dynamics.AX.Metadata.Core.MetaModel;
using D365MetadataService.Models;
using D365MetadataService.Services;
using Newtonsoft.Json;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for discovering available D365 types
    /// Uses centralized D365ReflectionManager for all reflection operations
    /// </summary>
    public class DiscoverAvailableTypesHandler : BaseRequestHandler
    {
        private readonly D365ReflectionManager _reflectionManager;

        public DiscoverAvailableTypesHandler(ILogger logger) : base(logger)
        {
            _reflectionManager = D365ReflectionManager.Instance;
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
        /// Get all available object types from D365 metadata model using centralized reflection manager
        /// </summary>
        private List<string> GetAvailableObjectTypes()
        {
            var objectTypes = new List<string>();

            try
            {
                // Use centralized reflection manager instead of duplicate logic
                var supportedTypes = _reflectionManager.GetSupportedObjectTypes();
                
                objectTypes.AddRange(supportedTypes);

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


    }
}
