using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for object creation requests
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

            Logger.Information("Creating {ObjectType} object", request.ObjectType);

            ObjectCreationResult result;

            switch (request.ObjectType.ToLower())
            {
                case "axclass":
                    result = await _objectFactory.CreateAxClassAsync(request.Parameters ?? new System.Collections.Generic.Dictionary<string, object>());
                    break;

                case "axenum":
                    result = await _objectFactory.CreateAxEnumAsync(request.Parameters ?? new System.Collections.Generic.Dictionary<string, object>());
                    break;

                case "axproject":
                    result = await _objectFactory.CreateAxProjectAsync(request.Parameters ?? new System.Collections.Generic.Dictionary<string, object>());
                    break;

                case "vs2022project":
                    result = await _objectFactory.CreateVS2022ProjectAsync(request.Parameters ?? new System.Collections.Generic.Dictionary<string, object>());
                    break;

                default:
                    return ServiceResponse.CreateError($"Unsupported object type: {request.ObjectType}");
            }

            return ServiceResponse.CreateSuccess(result);
        }
    }
}
