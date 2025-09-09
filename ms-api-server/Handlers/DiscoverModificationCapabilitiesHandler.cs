using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using D365MetadataService.Services;
using D365MetadataService.Models;
using Newtonsoft.Json;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for discovering modification capabilities of D365 objects
    /// Implements the dynamic reflection approach
    /// </summary>
    public class DiscoverModificationCapabilitiesHandler : BaseRequestHandler
    {
        private readonly DynamicD365ReflectionService _reflectionService;

        public DiscoverModificationCapabilitiesHandler(
            DynamicD365ReflectionService reflectionService,
            ILogger logger) : base(logger)
        {
            _reflectionService = reflectionService;
        }

        public override string SupportedAction => "discoverModificationCapabilities";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            try
            {
                // Extract object type parameter
                if (!request.Parameters.TryGetValue("objectType", out var objectTypeObj) || objectTypeObj == null)
                {
                    return ServiceResponse.CreateError("objectType parameter is required");
                }

                var objectType = objectTypeObj.ToString();
                
                if (string.IsNullOrWhiteSpace(objectType))
                {
                    return ServiceResponse.CreateError("objectType cannot be empty");
                }

                Logger.Information("Discovering modification capabilities for {ObjectType}", objectType);

                // Use the dynamic reflection service to discover capabilities
                var capabilities = await _reflectionService.DiscoverModificationCapabilitiesAsync(objectType);

                Logger.Information("Found {MethodCount} modification methods for {ObjectType}", 
                    capabilities.ModificationMethods?.Count ?? 0, objectType);

                return ServiceResponse.CreateSuccess(capabilities);
            }
            catch (Exception ex)
            {
                var objectTypeForLogging = request.Parameters.TryGetValue("objectType", out var objType) ? objType?.ToString() : "unknown";
                Logger.Error(ex, "Error discovering modification capabilities for object type: {ObjectType}", objectTypeForLogging);
                
                return ServiceResponse.CreateError($"Failed to discover modification capabilities: {ex.Message}");
            }
        }
    }
}
