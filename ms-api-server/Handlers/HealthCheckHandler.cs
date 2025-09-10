using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for health check requests - simple, fast operations
    /// </summary>
    public class HealthCheckHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly D365ReflectionManager _reflectionManager;

        public HealthCheckHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _reflectionManager = D365ReflectionManager.Instance;
        }

        /// <summary>
        /// Get supported object types using centralized reflection manager
        /// </summary>
        private string[] GetSupportedObjectTypes()
        {
            try
            {
                var supportedTypes = _reflectionManager.GetSupportedObjectTypes();
                var limitedTypes = supportedTypes.Take(50).ToArray(); // Limit to top 50 for health check
                
                Logger.Debug("Found {Count} supported object types via centralized manager", limitedTypes.Length);
                return limitedTypes;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting supported object types from reflection manager");
                return new string[0];
            }
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
                    ["SupportedObjectTypes"] = GetSupportedObjectTypes()
                }
            };

            return Task.FromResult(ServiceResponse.CreateSuccess(healthResult));
        }
    }
}
