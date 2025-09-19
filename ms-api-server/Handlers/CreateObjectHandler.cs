using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for object creation requests using dynamic object factory
    /// Supports all 575+ D365 object types dynamically with parameter discovery
    /// Enhanced with template guidance for better object configuration
    /// </summary>
    public class CreateObjectHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;
        private readonly ParameterDiscoveryService _parameterDiscoveryService;
        private readonly ITemplateGuidanceService _templateGuidanceService;

        public CreateObjectHandler(D365ObjectFactory objectFactory, ParameterDiscoveryService parameterDiscoveryService, ITemplateGuidanceService templateGuidanceService, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
            _parameterDiscoveryService = parameterDiscoveryService ?? throw new ArgumentNullException(nameof(parameterDiscoveryService));
            _templateGuidanceService = templateGuidanceService ?? throw new ArgumentNullException(nameof(templateGuidanceService));
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

            // Check if this is a parameter discovery request
            var parameters = request.Parameters ?? new System.Collections.Generic.Dictionary<string, object>();
            
            if (parameters.ContainsKey("discoverParameters") && 
                Convert.ToBoolean(parameters["discoverParameters"]))
            {
                Logger.Information("Discovering parameters for {ObjectType}", request.ObjectType);
                
                var discoveryResult = _parameterDiscoveryService.DiscoverParameters(request.ObjectType);
                
                if (!discoveryResult.Success)
                {
                    return ServiceResponse.CreateError(discoveryResult.ErrorMessage);
                }

                var response = new
                {
                    DiscoveryMode = true,
                    ObjectType = request.ObjectType,
                    ParameterSchema = discoveryResult.Schema,
                    DiscoveryTime = discoveryResult.DiscoveryTime.TotalMilliseconds,
                    ParametersAnalyzed = discoveryResult.ParametersAnalyzed
                };

                return ServiceResponse.CreateSuccess(response);
            }

            // Standard object creation
            Logger.Information("Creating {ObjectType} object using dynamic factory", request.ObjectType);

            var result = await _objectFactory.CreateObjectDynamicallyAsync(
                request.ObjectType, 
                parameters
            );

            // Check if this object type has template guidance available
            var templateGuidance = await _templateGuidanceService.GetTemplateGuidanceAsync(request.ObjectType);
            
            if (templateGuidance?.HasTemplate == true)
            {
                Logger.Information("Template guidance available for {ObjectType} with {TemplateCount} template options", 
                    request.ObjectType, templateGuidance.AvailableTemplates.Count);
            }

            // Create enhanced response with template guidance
            var enhancedResult = new
            {
                ObjectCreated = result,
                TemplateGuidance = new
                {
                    HasTemplate = templateGuidance?.HasTemplate == true,
                    Guidance = templateGuidance,
                    Message = templateGuidance?.HasTemplate == true
                        ? $"✅ {request.ObjectType} created successfully! This object type has template options available for enhanced configuration."
                        : $"✅ {request.ObjectType} created successfully!"
                }
            };

            return ServiceResponse.CreateSuccess(enhancedResult);
        }
    }
}
