using D365MetadataService.Models;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for shutdown requests
    /// </summary>
    public class ShutdownHandler : BaseRequestHandler
    {
        private readonly Action _shutdownCallback;

        public ShutdownHandler(ILogger logger, Action shutdownCallback = null) 
            : base(logger)
        {
            _shutdownCallback = shutdownCallback;
        }

        public override string SupportedAction => "shutdown";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            try
            {
                Logger.Information("Handling Shutdown request: {@Request}", new { request.Action, request.Id });

                var result = new
                {
                    Message = "Service shutdown initiated",
                    Timestamp = DateTime.UtcNow,
                    RequestId = request.Id
                };

                // Initiate shutdown after sending response
                Task.Run(async () =>
                {
                    await Task.Delay(100); // Small delay to ensure response is sent
                    Logger.Information("Executing shutdown callback");
                    _shutdownCallback?.Invoke();
                });

                Logger.Information("Shutdown request processed successfully");
                return Task.FromResult(ServiceResponse.CreateSuccess(result));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to process shutdown request");
                return Task.FromResult(ServiceResponse.CreateError($"Shutdown operation failed: {ex.Message}"));
            }
        }
    }
}
