using D365MetadataService.Models;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for simple ping requests - minimal overhead operations
    /// </summary>
    public class PingHandler : BaseRequestHandler
    {
        public PingHandler(ILogger logger) : base(logger)
        {
        }

        public override string SupportedAction => "ping";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            var response = ServiceResponse.CreateSuccess(new 
            { 
                Status = "Pong", 
                Timestamp = DateTime.UtcNow,
                ServerUptime = DateTime.UtcNow // This could be injected from server
            });

            return Task.FromResult(response);
        }
    }
}
