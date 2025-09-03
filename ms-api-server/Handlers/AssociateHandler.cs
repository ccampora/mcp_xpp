using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for object association requests (linking objects to projects)
    /// </summary>
    public class AssociateHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;

        public AssociateHandler(D365ObjectFactory objectFactory, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
        }

        public override string SupportedAction => "associate";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Associate request: {@Request}", new { request.Action, request.Parameters });

            try
            {
                var result = await _objectFactory.AssociateObjectToProjectAsync(request.Parameters ?? new Dictionary<string, object>());
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to process associate request");
                return ServiceResponse.CreateError($"Associate operation failed: {ex.Message}");
            }
        }
    }
}
