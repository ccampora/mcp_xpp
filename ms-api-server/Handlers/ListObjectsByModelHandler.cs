using D365MetadataService.Models;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Newtonsoft.Json;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for listing all objects by model using D365 metadata DLLs
    /// Uses proper project references and configuration instead of hardcoded paths
    /// </summary>
    public class ListObjectsByModelHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;

        public override string SupportedAction => "list_objects_by_model";

        public ListObjectsByModelHandler(ServiceConfiguration config, ILogger logger) : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            Logger.Information("Starting list objects by model request");

            try
            {
                // Get metadata path from request or use configuration
                var metadataPath = (request.Parameters?.ContainsKey("metadataPath") == true ? request.Parameters["metadataPath"] as string : null)
                    ?? _config.D365Config.PackagesLocalDirectory;

                // Get target models from request parameters
                var requestedModel = request.Parameters?.ContainsKey("model") == true ? request.Parameters["model"] as string : null;
                
                if (string.IsNullOrEmpty(requestedModel))
                {
                    return new ServiceResponse { Success = false, Error = "Model parameter is required. Please specify which model to enumerate (e.g., 'Foundation', 'ApplicationSuite', etc.)" };
                }

                var targetModels = new[] { requestedModel };

                // Execute the CPU-bound metadata work on a background thread
                var response = await Task.Run(() => PerformMetadataWork(targetModels, metadataPath));

                Logger.Information("Successfully enumerated objects from models");

                return new ServiceResponse { Success = true, Data = response };
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to list objects by model");
                return new ServiceResponse { Success = false, Error = $"Failed to list objects by model: {ex.Message}" };
            }
        }

        private object PerformMetadataWork(string[] targetModels, string metadataPath)
        {
            // Use the proper D365 metadata APIs directly (no reflection needed!)
            var factory = new MetadataProviderFactory();
            var provider = factory.CreateDiskProvider(metadataPath);

            var models = new List<object>();
            var totalObjects = 0;
            var modelsProcessed = 0;

            foreach (var modelName in targetModels)
            {
                try
                {
                    // Get tables for this model using the proper API
                    var tables = provider.Tables.ListObjectsForModel(modelName);

                    if (tables != null && tables.Any())
                    {
                        var tableList = tables.ToList();
                        var modelData = new
                        {
                            name = modelName,
                            objectCount = tableList.Count,
                            objects = new
                            {
                                AxTable = tableList
                            }
                        };

                        models.Add(modelData);
                        totalObjects += tableList.Count;
                        modelsProcessed++;

                        Logger.Information("Found {Count} tables in model {Model}", tableList.Count, modelName);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warning("Failed to process model {Model}: {Error}", modelName, ex.Message);
                    // Continue processing other models
                }
            }

            return new
            {
                totalObjects,
                modelsProcessed,
                models,
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            };
        }
    }
}
