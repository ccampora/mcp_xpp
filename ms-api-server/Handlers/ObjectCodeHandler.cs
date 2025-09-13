using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for extracting source code from D365 objects
    /// Supports X++ method source code extraction with flexible targeting
    /// </summary>
    public class ObjectCodeHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectCodeHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectcode";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Code request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Extract parameters
                var objectName = request.Parameters?.ContainsKey("objectName") == true ? request.Parameters["objectName"]?.ToString() : null;
                var objectType = request.Parameters?.ContainsKey("objectType") == true ? request.Parameters["objectType"]?.ToString() : null;
                var codeTarget = request.Parameters?.ContainsKey("codeTarget") == true ? request.Parameters["codeTarget"]?.ToString() : null;
                var methodName = request.Parameters?.ContainsKey("methodName") == true ? request.Parameters["methodName"]?.ToString() : null;
                var maxCodeLines = request.Parameters?.ContainsKey("maxCodeLines") == true ? 
                    int.Parse(request.Parameters["maxCodeLines"]?.ToString() ?? "0") : (int?)null;

                if (string.IsNullOrEmpty(objectName))
                {
                    return ServiceResponse.CreateError("ObjectName parameter is required");
                }

                if (string.IsNullOrEmpty(objectType))
                {
                    return ServiceResponse.CreateError("ObjectType parameter is required");
                }

                if (string.IsNullOrEmpty(codeTarget))
                {
                    return ServiceResponse.CreateError("CodeTarget parameter is required (methods, specific-method, event-handlers)");
                }

                // Delegate to InspectObjectHandler's code extraction method
                var result = await _inspectHandler.GetObjectCodeAsync(objectName, objectType, codeTarget, methodName, maxCodeLines);

                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error extracting code from D365 object");
                return ServiceResponse.CreateError($"Failed to extract code: {ex.Message}");
            }
        }
    }
}