using System;
using System.Threading.Tasks;
using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for getting template guidance for D365 object types
    /// Provides information about available templates and their parameters
    /// </summary>
    public class GetTemplateGuidanceHandler : BaseRequestHandler
    {
        private readonly TemplateGuidanceService _templateService;

        public GetTemplateGuidanceHandler(ILogger logger, TemplateGuidanceService templateService) : base(logger)
        {
            _templateService = templateService;
        }

        public override string SupportedAction => "get_template_guidance";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            try
            {
                // Validate request
                var validationError = ValidateRequest(request);
                if (validationError != null)
                    return validationError;

                if (string.IsNullOrEmpty(request.ObjectType))
                {
                    return ServiceResponse.CreateError("ObjectType is required");
                }

                Logger.Information("Getting template guidance for {ObjectType}", request.ObjectType);

                var guidance = _templateService.GetTemplateGuidance(request.ObjectType);
                
                var response = new
                {
                    Success = true,
                    ObjectType = request.ObjectType,
                    Guidance = guidance
                };

                return await Task.FromResult(ServiceResponse.CreateSuccess(response));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to get template guidance for {ObjectType}", request.ObjectType);
                return ServiceResponse.CreateError($"Failed to get template guidance: {ex.Message}");
            }
        }
    }
}