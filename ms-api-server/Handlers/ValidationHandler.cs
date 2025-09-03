using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for parameter validation requests
    /// </summary>
    public class ValidationHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;

        public ValidationHandler(D365ObjectFactory objectFactory, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
        }

        public override string SupportedAction => "validate";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            try
            {
                if (string.IsNullOrEmpty(request.ObjectType))
                {
                    return Task.FromResult(ServiceResponse.CreateError("ObjectType is required for validation"));
                }

                var result = _objectFactory.ValidateParameters(request.ObjectType, request.Parameters ?? new Dictionary<string, object>());
                return Task.FromResult(ServiceResponse.CreateSuccess(result));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error validating parameters for {ObjectType}", request.ObjectType);
                return Task.FromResult(ServiceResponse.CreateError($"Parameter validation failed: {ex.Message}"));
            }
        }
    }
}
