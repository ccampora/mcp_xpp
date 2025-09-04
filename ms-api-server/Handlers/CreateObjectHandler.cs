using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for object creation requests using dynamic object factory
    /// Supports all 575+ D365 object types dynamically
    /// </summary>
    public class CreateObjectHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;

        public CreateObjectHandler(D365ObjectFactory objectFactory, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
        }

        public override string SupportedAction => "create";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            // Validate request
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            if (string.IsNullOrEmpty(request.ObjectType))
            {
                return ServiceResponse.CreateError("ObjectType is required for create operations");
            }

            Logger.Information("Creating {ObjectType} object using dynamic factory", request.ObjectType);

            // Use the dynamic factory to create any object type
            var result = await _objectFactory.CreateObjectDynamicallyAsync(
                request.ObjectType, 
                request.Parameters ?? new System.Collections.Generic.Dictionary<string, object>()
            );

            return ServiceResponse.CreateSuccess(result);
        }
    }
}
