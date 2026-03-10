using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for retrieving field-level metadata from D365 objects (tables, views, entities).
    /// Returns label, EDT, help text, mandatory flag, config key, and edit permission flags
    /// for a named field on the specified object.
    /// </summary>
    public class ObjectFieldHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectFieldHandler(ServiceConfiguration config, ILogger logger)
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectfield";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Field request: {@Request}", new { request.Action, request.Id });

            try
            {
                var objectName  = request.Parameters?.ContainsKey("objectName")  == true ? request.Parameters["objectName"]?.ToString()  : null;
                var objectType  = request.Parameters?.ContainsKey("objectType")  == true ? request.Parameters["objectType"]?.ToString()  : null;
                var fieldName   = request.Parameters?.ContainsKey("fieldName")   == true ? request.Parameters["fieldName"]?.ToString()   : null;

                if (string.IsNullOrEmpty(objectName))
                    return ServiceResponse.CreateError("objectName parameter is required");
                if (string.IsNullOrEmpty(objectType))
                    return ServiceResponse.CreateError("objectType parameter is required");
                if (string.IsNullOrEmpty(fieldName))
                    return ServiceResponse.CreateError("fieldName parameter is required");

                var result = await _inspectHandler.GetObjectFieldAsync(objectName, objectType, fieldName);
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting field metadata");
                return ServiceResponse.CreateError($"Failed to get field metadata: {ex.Message}");
            }
        }
    }
}
