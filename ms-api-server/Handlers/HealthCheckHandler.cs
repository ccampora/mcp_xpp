using D365MetadataService.Models;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for health check requests - simple, fast operations
    /// </summary>
    public class HealthCheckHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;

        public HealthCheckHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        public override string SupportedAction => "health";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            var healthResult = new HealthCheckResult
            {
                Status = "Healthy",
                Timestamp = DateTime.UtcNow,
                ActiveConnections = 0, // This would need to be injected from server
                MaxConnections = _config.MaxConnections,
                ServiceInfo = new System.Collections.Generic.Dictionary<string, object>
                {
                    ["Transport"] = "NamedPipes",
                    ["PipeName"] = "mcp-xpp-d365-service",
                    ["DefaultModel"] = _config.D365Config.DefaultModel,
                    ["AssemblyPath"] = _config.D365Config.MetadataAssemblyPath,
                    ["ServerVersion"] = "1.0.0",
                    ["SupportedObjectTypes"] = new[] { "AxClass", "AxEnum", "AxProject", "VS2022Project", "ObjectProjectAssociation" }
                }
            };

            return Task.FromResult(ServiceResponse.CreateSuccess(healthResult));
        }
    }
}
