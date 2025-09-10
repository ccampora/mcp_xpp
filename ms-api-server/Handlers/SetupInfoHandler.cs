using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for setup information requests
    /// </summary>
    public class SetupInfoHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly FileSystemManager _fileSystemManager;
        private readonly string _pipeName;
        private readonly int _maxConnections;

        public SetupInfoHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _fileSystemManager = FileSystemManager.Instance;
            _pipeName = "mcp-xpp-d365-service";
            _maxConnections = _config.MaxConnections;
        }

        public override string SupportedAction => "setup";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            try
            {
                Logger.Information("Handling Setup request: {@Request}", new { request.Action, request.Id });

                var setupInfo = new
                {
                    PackagesLocalDirectory = _config.D365Config.PackagesLocalDirectory,
                    CustomMetadataPath = _config.D365Config.CustomMetadataPath,
                    DefaultModel = _config.D365Config.DefaultModel,
                    MetadataAssemblyPath = _config.D365Config.MetadataAssemblyPath,
                    ExtensionPath = _fileSystemManager.GetVS2022ExtensionPath(),
                    ServiceInfo = new
                    {
                        Transport = "NamedPipes",
                        PipeName = _pipeName,
                        MaxConnections = _maxConnections,
                        ServerVersion = "1.0.0"
                    },
                    Timestamp = DateTime.UtcNow
                };

                Logger.Information("Setup information retrieved successfully");
                return Task.FromResult(ServiceResponse.CreateSuccess(setupInfo));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to process setup request");
                return Task.FromResult(ServiceResponse.CreateError($"Setup operation failed: {ex.Message}"));
            }
        }


    }
}
