using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for getting only the Properties section of an object
    /// Returns all non-collection properties without limits
    /// </summary>
    public class ObjectPropertiesHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectPropertiesHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectproperties";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Properties request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Extract parameters
                var objectName = request.Parameters?.ContainsKey("objectName") == true ? request.Parameters["objectName"]?.ToString() : null;
                var objectType = request.Parameters?.ContainsKey("objectType") == true ? request.Parameters["objectType"]?.ToString() : null;

                if (string.IsNullOrEmpty(objectName))
                {
                    return ServiceResponse.CreateError("ObjectName parameter is required");
                }

                if (string.IsNullOrEmpty(objectType))
                {
                    return ServiceResponse.CreateError("ObjectType parameter is required");
                }

                // Use the new properties method from InspectObjectHandler
                var propertiesResult = await _inspectHandler.GetObjectPropertiesAsync(objectName, objectType);

                return ServiceResponse.CreateSuccess(propertiesResult);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting object properties");
                return ServiceResponse.CreateError($"Failed to get object properties: {ex.Message}");
            }
        }
    }
}