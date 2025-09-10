using D365MetadataService.Models;
using D365MetadataService.Services;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for comprehensive models information requests
    /// Uses dynamic model discovery via MetadataProvider.ModelManifest.ListModels()
    /// Discovers both Microsoft and custom models automatically
    /// </summary>
    public class ModelsHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;
        private readonly ServiceConfiguration _config;

        public ModelsHandler(D365ObjectFactory objectFactory, ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        public override string SupportedAction => "models";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling comprehensive Models request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Execute the CPU-bound work on a background thread
                var result = await Task.Run(() => GetComprehensiveModelsInformation());
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to process models request");
                return ServiceResponse.CreateError($"Models operation failed: {ex.Message}");
            }
        }

        private object GetComprehensiveModelsInformation()
        {
            try
            {
                // Use dynamic model discovery for both standard and custom models
                Logger.Information("Getting all models via dynamic discovery...");
                var allModels = GetStandardD365Models(); // Now discovers ALL models dynamically

                var totalObjects = allModels.Sum(m => {
                    var props = m.GetType().GetProperty("ObjectCount");
                    var count = props != null ? (int)(props.GetValue(m) ?? 0) : 0;
                    return count > 0 ? count : 0; // Exclude failed enumerations (-1)
                });
                
                var modelsWithObjects = allModels.Count(m => {
                    var props = m.GetType().GetProperty("HasObjects");
                    return props != null ? (bool)(props.GetValue(m) ?? false) : false;
                });

                var customModels = allModels.Count(m => {
                    var props = m.GetType().GetProperty("Type");
                    return props != null && props.GetValue(m)?.ToString() == "Custom";
                });

                var standardModels = allModels.Count - customModels;

                var result = new
                {
                    models = allModels.OrderBy(m => {
                        var props = m.GetType().GetProperty("Name");
                        return props != null ? props.GetValue(m)?.ToString() : "Unknown";
                    }).ToList(),
                    summary = new
                    {
                        totalModels = allModels.Count,
                        customModels = customModels,
                        standardModels = standardModels,
                        modelsWithObjects = modelsWithObjects,
                        totalObjects = totalObjects,
                        retrievedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    }
                };

                Logger.Information("Dynamic model discovery complete: {TotalModels} total ({CustomModels} custom, {StandardModels} standard), {TotalObjects} total objects", 
                    allModels.Count, customModels, standardModels, totalObjects);

                return result;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error in GetComprehensiveModelsInformation");
                throw;
            }
        }

        private List<object> GetStandardD365Models()
        {
            var discoveredModels = new List<object>();
            
            try
            {
                // Get metadata path from configuration
                var metadataPath = _config.D365Config.PackagesLocalDirectory;
                Logger.Information("Creating metadata provider for dynamic model discovery: {MetadataPath}", metadataPath);

                // Create the metadata provider using the same pattern as D365ObjectFactory
                var factory = new MetadataProviderFactory();
                var provider = factory.CreateDiskProvider(metadataPath);

                // Use the metadata provider's ModelManifest to dynamically discover ALL models
                // This is the same approach used in D365ObjectFactory.cs
                if (provider?.ModelManifest != null)
                {
                    Logger.Information("Getting models from MetadataProvider.ModelManifest");
                    
                    try
                    {
                        var modelList = provider.ModelManifest.ListModels();
                        Logger.Information("Found {Count} models using ListModels()", modelList?.Count ?? 0);

                        if (modelList != null)
                        {
                            foreach (var modelName in modelList.OrderBy(m => m))
                            {
                                try
                                {
                                    Logger.Debug("Processing model: {ModelName}", modelName);
                                    
                                    var modelInfo = provider.ModelManifest.Read(modelName);
                                    if (modelInfo != null)
                                    {
                                        // Get object count by trying to enumerate tables (quick check)
                                        var objectCount = 0;
                                        try
                                        {
                                            var tables = provider.Tables.ListObjectsForModel(modelName);
                                            objectCount = tables?.Count() ?? 0;
                                        }
                                        catch
                                        {
                                            // If table enumeration fails, still include the model
                                            objectCount = -1; // Indicates enumeration failed
                                        }

                                        var modelData = new
                                        {
                                            Name = modelInfo.Name,
                                            Type = modelInfo.Publisher == "ccampora" ? "Custom" : "Standard",
                                            Publisher = modelInfo.Publisher ?? "Microsoft",
                                            Version = $"{modelInfo.VersionMajor}.{modelInfo.VersionMinor}.{modelInfo.VersionBuild}.{modelInfo.VersionRevision}",
                                            Layer = modelInfo.Layer.ToString(),
                                            Id = modelInfo.Id,
                                            DisplayName = modelInfo.DisplayName ?? modelInfo.Name,
                                            Description = modelInfo.Description ?? "N/A",
                                            ObjectCount = objectCount,
                                            HasObjects = objectCount > 0,
                                            Status = "Available"
                                        };

                                        discoveredModels.Add(modelData);
                                        Logger.Debug("Added model: {Name} (ID: {Id}, Layer: {Layer}, Publisher: {Publisher}, Objects: {ObjectCount})", 
                                            modelInfo.Name, modelInfo.Id, modelInfo.Layer, modelInfo.Publisher, objectCount);
                                    }
                                    else
                                    {
                                        Logger.Warning("Could not read model info for: {ModelName}", modelName);
                                        discoveredModels.Add(new
                                        {
                                            Name = modelName,
                                            Type = "Unknown",
                                            Publisher = "Unknown",
                                            Version = "Unknown",
                                            Layer = "Unknown",
                                            ObjectCount = 0,
                                            HasObjects = false,
                                            Status = "Error",
                                            Error = "Could not read model info"
                                        });
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Logger.Error(ex, "Error processing model {ModelName}: {Message}", modelName, ex.Message);
                                    discoveredModels.Add(new
                                    {
                                        Name = modelName,
                                        Type = "Unknown", 
                                        Publisher = "Unknown",
                                        Version = "Unknown",
                                        Layer = "Unknown",
                                        ObjectCount = 0,
                                        HasObjects = false,
                                        Status = "Error",
                                        Error = ex.Message
                                    });
                                }
                            }
                        }
                    }
                    catch (Exception listEx)
                    {
                        Logger.Error(listEx, "Error calling ListModels(): {Message}", listEx.Message);
                        throw;
                    }
                }
                else
                {
                    Logger.Error("MetadataProvider or ModelManifest is null");
                    throw new InvalidOperationException("MetadataProvider or ModelManifest is null");
                }

                Logger.Information("Dynamic model discovery complete: {Count} models discovered", discoveredModels.Count);
                return discoveredModels;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error in dynamic model discovery");
                return discoveredModels; // Return partial results
            }
        }


    }
}
