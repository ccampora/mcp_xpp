using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for parameter schema requests
    /// </summary>
    public class ParameterSchemasHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;

        public ParameterSchemasHandler(D365ObjectFactory objectFactory, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
        }

        public override string SupportedAction => "schemas";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            try
            {
                var result = _objectFactory.GetParameterSchemas();
                return Task.FromResult(ServiceResponse.CreateSuccess(result));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting parameter schemas");
                return Task.FromResult(ServiceResponse.CreateError($"Failed to get parameter schemas: {ex.Message}"));
            }
        }
    }
}
