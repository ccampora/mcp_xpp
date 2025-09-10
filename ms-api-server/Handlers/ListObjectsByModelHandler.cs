using D365MetadataService.Models;
using D365MetadataService.Services;
using Microsoft.Dynamics.AX.Metadata.Providers;
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
    /// COMPREHENSIVE Handler for listing ALL objects by model using D365 metadata DLLs
    /// Uses centralized D365ReflectionManager for dynamic object type discovery
    /// Eliminates hardcoded object type mappings with reflection-based enumeration
    /// </summary>
    public class ListObjectsByModelHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly D365ReflectionManager _reflectionManager;

        public override string SupportedAction => "list_objects_by_model";

        public ListObjectsByModelHandler(ServiceConfiguration config, ILogger logger) : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _reflectionManager = D365ReflectionManager.Instance;
        }



        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            Logger.Information("Starting COMPREHENSIVE list objects by model request");

            try
            {
                // Get target models from request parameters first
                var requestedModel = request.Parameters?.ContainsKey("model") == true ? request.Parameters["model"] as string : null;
                
                // Get metadata path from request or determine based on model
                var metadataPath = request.Parameters?.ContainsKey("metadataPath") == true ? request.Parameters["metadataPath"] as string : null;
                
                // If no explicit path provided, determine the correct path based on the requested model
                if (string.IsNullOrEmpty(metadataPath))
                {
                    // Check if this is a custom model by looking for it in custom metadata path first
                    if (!string.IsNullOrEmpty(requestedModel))
                    {
                        try
                        {
                            // Try custom metadata path first for models like 'cc', 'dd', etc.
                            var customFactory = new MetadataProviderFactory();
                            var customProvider = customFactory.CreateDiskProvider(_config.D365Config.CustomMetadataPath);
                            
                            if (customProvider?.ModelManifest != null)
                            {
                                var customModels = customProvider.ModelManifest.ListModels();
                                if (customModels != null && customModels.Contains(requestedModel))
                                {
                                    metadataPath = _config.D365Config.CustomMetadataPath;
                                    Logger.Information("Using custom metadata path for model {Model}: {Path}", requestedModel, metadataPath);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Logger.Debug("Could not check custom metadata path for model {Model}: {Error}", requestedModel, ex.Message);
                        }
                    }
                    
                    // If not found in custom path, use standard packages path
                    if (string.IsNullOrEmpty(metadataPath))
                    {
                        metadataPath = _config.D365Config.PackagesLocalDirectory;
                        Logger.Information("Using standard packages path for model {Model}: {Path}", requestedModel, metadataPath);
                    }
                }
                
                if (string.IsNullOrEmpty(requestedModel))
                {
                    return new ServiceResponse { Success = false, Error = "Model parameter is required. Please specify which model to enumerate (e.g., 'Foundation', 'ApplicationSuite', etc.)" };
                }

                var targetModels = new[] { requestedModel };

                // Execute the CPU-bound metadata work on a background thread
                var response = await Task.Run(() => PerformMetadataWork(targetModels, metadataPath));

                Logger.Information("Successfully enumerated ALL object types from models");

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
            // ENHANCED: Use the proper D365 metadata APIs to enumerate ALL object types
            var factory = new MetadataProviderFactory();
            var provider = factory.CreateDiskProvider(metadataPath);

            var models = new List<object>();
            var totalObjects = 0;
            var modelsProcessed = 0;

            foreach (var modelName in targetModels)
            {
                try
                {
                    Logger.Information("🔍 Comprehensively processing model: {ModelName}", modelName);
                    
                    // ✅ HARDCODING ELIMINATED: Use centralized D365ReflectionManager
                    var objects = _reflectionManager.GetAllObjectsForModel(provider, modelName);
                    var modelObjectCount = objects.Values.OfType<System.Collections.IEnumerable>()
                        .Sum(collection => collection.Cast<object>().Count());

                    // Only add model if we found objects
                    if (modelObjectCount > 0)
                    {
                        var modelData = new
                        {
                            name = modelName,
                            objectCount = modelObjectCount,
                            objects = objects
                        };

                        models.Add(modelData);
                        totalObjects += modelObjectCount;
                        modelsProcessed++;

                        Logger.Information("✅ Found {Count} total objects in model {Model}", modelObjectCount, modelName);
                    }
                    else
                    {
                        Logger.Information("   ⚠️ No objects found in model {Model}", modelName);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warning("Failed to process model {Model}: {Error}", modelName, ex.Message);
                    // Continue processing other models
                }
            }

            var distinctObjectTypes = models.Cast<dynamic>()
                .SelectMany(m => (IEnumerable<string>)m.objects.Keys)
                .Distinct()
                .Count();

            Logger.Information("🎉 COMPREHENSIVE enumeration complete: {TotalObjects} objects across {ObjectTypes} types", 
                totalObjects, 
                distinctObjectTypes);

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
