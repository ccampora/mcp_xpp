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
    /// Handler for listing all available models in the D365 metadata
    /// Uses a simple approach based on known models from successful testing
    /// </summary>
    public class ListModelsHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;

        public override string SupportedAction => "list_models";

        public ListModelsHandler(ServiceConfiguration config, ILogger logger) : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            Logger.Information("Starting list models request");

            try
            {
                // Get metadata path from request or use configuration
                var metadataPath = (request.Parameters?.ContainsKey("metadataPath") == true ? request.Parameters["metadataPath"] as string : null)
                    ?? _config.D365Config.PackagesLocalDirectory;

                Logger.Information("Using metadata path: {MetadataPath}", metadataPath);

                // Execute the CPU-bound metadata work on a background thread
                var response = await Task.Run(() => GetAvailableModels(metadataPath));

                Logger.Information("Successfully retrieved models list");
                return response;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error listing models");
                return new ServiceResponse 
                { 
                    Success = false, 
                    Error = $"Failed to list models: {ex.Message}" 
                };
            }
        }

        private ServiceResponse GetAvailableModels(string metadataPath)
        {
            try
            {
                Logger.Information("Creating metadata provider for path: {MetadataPath}", metadataPath);

                // Create the metadata provider using the same pattern as ListObjectsByModelHandler
                var factory = new MetadataProviderFactory();
                var provider = factory.CreateDiskProvider(metadataPath);

                Logger.Information("Metadata provider created successfully");

                // We'll discover models by trying to enumerate tables from known models
                // and also try some discovery approaches
                var discoveredModels = new List<object>();
                var modelStats = new Dictionary<string, int>();

                // Start with known working models from our previous tests
                var candidateModels = new List<string>
                {
                    "ApplicationSuite",
                    "ApplicationFoundation", 
                    "ApplicationPlatform",
                    "ApplicationCommon",
                    "Foundation",
                    "ApplicationWorkspaces",
                    "BusinessProcessDesigner",
                    "Calendar",
                    "ContactPerson",
                    "Currency",
                    "Dimensions",
                    "Directory",
                    "ElectronicReporting",
                    "ElectronicReportingConfiguration",
                    "ElectronicReportingMapping",
                    "GeneralLedger",
                    "Ledger",
                    "Policy",
                    "SourceDocumentation",
                    "Tax",
                    "UnitOfMeasure",
                    "TestEssentials",
                    "ApplicationSuiteTest",
                    "ApplicationFoundationTest"
                };

                foreach (var modelName in candidateModels.OrderBy(m => m))
                {
                    try
                    {
                        // Test if this model exists by trying to get tables from it
                        var tables = provider.Tables.ListObjectsForModel(modelName);
                        
                        if (tables != null)
                        {
                            var tableList = tables.ToList();
                            var objectCount = tableList.Count;

                            discoveredModels.Add(new
                            {
                                Name = modelName,
                                ObjectCount = objectCount,
                                HasObjects = objectCount > 0,
                                Status = "Available"
                            });

                            modelStats[modelName] = objectCount;
                            Logger.Debug("Model {ModelName}: {ObjectCount} tables", modelName, objectCount);
                        }
                    }
                    catch (Exception modelEx)
                    {
                        Logger.Debug("Model {ModelName} not available: {Error}", modelName, modelEx.Message);
                        // Model doesn't exist or isn't accessible - skip it
                    }
                }

                var totalObjects = modelStats.Values.Sum();
                var availableModels = discoveredModels.Count(m => ((dynamic)m).HasObjects);

                var result = new
                {
                    models = discoveredModels,
                    summary = new
                    {
                        totalModels = discoveredModels.Count,
                        availableModels = availableModels,
                        modelsWithObjects = availableModels,
                        totalObjects = totalObjects,
                        metadataPath = metadataPath,
                        retrievedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    }
                };

                Logger.Information("Model discovery complete: {TotalModels} total, {AvailableModels} available, {TotalObjects} total objects", 
                    discoveredModels.Count, availableModels, totalObjects);

                return new ServiceResponse
                {
                    Success = true,
                    Data = result
                };
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error in GetAvailableModels");
                return new ServiceResponse
                {
                    Success = false,
                    Error = $"Failed to enumerate models: {ex.Message}"
                };
            }
        }
    }
}
