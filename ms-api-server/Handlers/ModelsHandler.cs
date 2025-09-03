using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for models information requests
    /// </summary>
    public class ModelsHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;

        public ModelsHandler(D365ObjectFactory objectFactory, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
        }

        public override string SupportedAction => "models";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            Logger.Information("Handling Models request: {@Request}", new { request.Action, request.Id });

            try
            {
                var result = _objectFactory.GetAllModelsInformation();
                return Task.FromResult(ServiceResponse.CreateSuccess(result));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to process models request");
                return Task.FromResult(ServiceResponse.CreateError($"Models operation failed: {ex.Message}"));
            }
        }
    }
}
