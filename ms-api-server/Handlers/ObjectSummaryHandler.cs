using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for getting object summaries - counts only, no detailed content
    /// This is the new default inspection mode for better performance
    /// </summary>
    public class ObjectSummaryHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectSummaryHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectsummary";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Summary request: {@Request}", new { request.Action, request.Id });

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

                // Use the new summary method from InspectObjectHandler
                var summaryResult = await _inspectHandler.GetObjectSummaryAsync(objectName, objectType);

                return ServiceResponse.CreateSuccess(summaryResult);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting object summary");
                return ServiceResponse.CreateError($"Failed to get object summary: {ex.Message}");
            }
        }
    }
}