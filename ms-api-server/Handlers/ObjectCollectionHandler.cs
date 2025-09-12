using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for getting a specific collection of an object
    /// Returns full details of a named collection without limits
    /// </summary>
    public class ObjectCollectionHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectCollectionHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectcollection";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Collection request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Extract parameters
                var objectName = request.Parameters?.ContainsKey("objectName") == true ? request.Parameters["objectName"]?.ToString() : null;
                var objectType = request.Parameters?.ContainsKey("objectType") == true ? request.Parameters["objectType"]?.ToString() : null;
                var collectionName = request.Parameters?.ContainsKey("collectionName") == true ? request.Parameters["collectionName"]?.ToString() : null;

                if (string.IsNullOrEmpty(objectName))
                {
                    return ServiceResponse.CreateError("ObjectName parameter is required");
                }

                if (string.IsNullOrEmpty(objectType))
                {
                    return ServiceResponse.CreateError("ObjectType parameter is required");
                }

                if (string.IsNullOrEmpty(collectionName))
                {
                    return ServiceResponse.CreateError("CollectionName parameter is required");
                }

                // Use the new collection method from InspectObjectHandler
                var collectionResult = await _inspectHandler.GetObjectCollectionAsync(objectName, objectType, collectionName);

                return ServiceResponse.CreateSuccess(collectionResult);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting object collection");
                return ServiceResponse.CreateError($"Failed to get object collection: {ex.Message}");
            }
        }
    }
}