using D365MetadataService.Models;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Base class for request handlers providing common functionality
    /// </summary>
    public abstract class BaseRequestHandler : IRequestHandler
    {
        protected readonly ILogger Logger;

        protected BaseRequestHandler(ILogger logger)
        {
            Logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// The action type this handler supports
        /// </summary>
        public abstract string SupportedAction { get; }

        /// <summary>
        /// Handle the service request with automatic error handling and logging
        /// </summary>
        public async Task<ServiceResponse> HandleAsync(ServiceRequest request)
        {
            var startTime = DateTime.UtcNow;
            Logger.Information("Handling {Action} request for {ObjectType}", SupportedAction, request.ObjectType);

            try
            {
                var response = await HandleRequestAsync(request);
                var duration = DateTime.UtcNow - startTime;
                
                Logger.Information("Successfully handled {Action} request in {Duration}ms", 
                    SupportedAction, duration.TotalMilliseconds);
                
                return response;
            }
            catch (Exception ex)
            {
                var duration = DateTime.UtcNow - startTime;
                Logger.Error(ex, "Error handling {Action} request after {Duration}ms", 
                    SupportedAction, duration.TotalMilliseconds);
                
                return ServiceResponse.CreateError($"{SupportedAction} operation failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Implement this method to handle the specific request type
        /// </summary>
        protected abstract Task<ServiceResponse> HandleRequestAsync(ServiceRequest request);

        /// <summary>
        /// Validate common request parameters
        /// </summary>
        protected virtual ServiceResponse ValidateRequest(ServiceRequest request)
        {
            if (request == null)
            {
                return ServiceResponse.CreateError("Request cannot be null");
            }

            if (string.IsNullOrEmpty(request.Action))
            {
                return ServiceResponse.CreateError("Request action is required");
            }

            if (!string.Equals(request.Action, SupportedAction, StringComparison.OrdinalIgnoreCase))
            {
                return ServiceResponse.CreateError($"Handler {GetType().Name} does not support action: {request.Action}");
            }

            return null; // No validation error
        }
    }
}
