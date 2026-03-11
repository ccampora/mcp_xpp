using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for retrieving the control tree of a D365 form.
    /// Returns control name, type, caption/label, data field binding, and parent group
    /// for each control in the form design. Supports optional wildcard filterPattern.
    /// </summary>
    public class ObjectControlsHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectControlsHandler(ServiceConfiguration config, ILogger logger)
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectcontrols";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Controls request: {@Request}", new { request.Action, request.Id });

            try
            {
                var objectName    = request.Parameters?.ContainsKey("objectName")    == true ? request.Parameters["objectName"]?.ToString()    : null;
                var objectType    = request.Parameters?.ContainsKey("objectType")    == true ? request.Parameters["objectType"]?.ToString()    : null;
                var filterPattern = request.Parameters?.ContainsKey("filterPattern") == true ? request.Parameters["filterPattern"]?.ToString() : null;
                var maxDepthStr   = request.Parameters?.ContainsKey("maxDepth")      == true ? request.Parameters["maxDepth"]?.ToString()      : null;
                int maxDepth = 0; // 0 = unlimited
                if (!string.IsNullOrEmpty(maxDepthStr))
                    int.TryParse(maxDepthStr, out maxDepth);

                if (string.IsNullOrEmpty(objectName))
                    return ServiceResponse.CreateError("objectName parameter is required");
                if (string.IsNullOrEmpty(objectType))
                    return ServiceResponse.CreateError("objectType parameter is required");

                var result = await _inspectHandler.GetObjectControlsAsync(objectName, objectType, filterPattern, maxDepth);
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting form controls");
                return ServiceResponse.CreateError($"Failed to get form controls: {ex.Message}");
            }
        }
    }
}
