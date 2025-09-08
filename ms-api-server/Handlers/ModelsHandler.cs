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
    /// Returns both custom development models AND standard D365 models
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
                // Get custom development models from D365ObjectFactory
                Logger.Information("Getting custom development models...");
                var customModelsResult = _objectFactory.GetAllModelsInformation();
                var customModels = new List<object>();
                
                if (customModelsResult != null && customModelsResult.TryGetValue("models", out var modelsValue))
                {
                    // Handle the models array
                    if (modelsValue is IEnumerable<object> models)
                    {
                        foreach (var model in models)
                        {
                            // Convert to dictionary to safely access properties
                            if (model is IDictionary<string, object> modelDict)
                            {
                                customModels.Add(new
                                {
                                    Name = modelDict.ContainsKey("Name") ? modelDict["Name"]?.ToString() : "Unknown",
                                    Type = "Custom",
                                    Publisher = modelDict.ContainsKey("Publisher") ? modelDict["Publisher"]?.ToString() : "Unknown",
                                    Version = GetVersionString(modelDict),
                                    Layer = modelDict.ContainsKey("Layer") ? modelDict["Layer"]?.ToString() : "Unknown",
                                    ObjectCount = 0, // Custom models don't have easy object count
                                    HasObjects = false,
                                    Status = "Available"
                                });
                            }
                        }
                    }
                }

                // Get standard D365 models using metadata provider
                Logger.Information("Getting standard D365 models...");
                var standardModels = GetStandardD365Models();

                // Combine both types
                var allModels = new List<object>();
                allModels.AddRange(customModels);
                allModels.AddRange(standardModels);

                var totalObjects = standardModels.Sum(m => {
                    var props = m.GetType().GetProperty("ObjectCount");
                    return props != null ? (int)(props.GetValue(m) ?? 0) : 0;
                });
                var modelsWithObjects = allModels.Count(m => {
                    var props = m.GetType().GetProperty("HasObjects");
                    return props != null ? (bool)(props.GetValue(m) ?? false) : false;
                });

                var result = new
                {
                    models = allModels.OrderBy(m => {
                        var props = m.GetType().GetProperty("Name");
                        return props != null ? props.GetValue(m)?.ToString() : "Unknown";
                    }).ToList(),
                    summary = new
                    {
                        totalModels = allModels.Count,
                        customModels = customModels.Count,
                        standardModels = standardModels.Count,
                        modelsWithObjects = modelsWithObjects,
                        totalObjects = totalObjects,
                        retrievedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    }
                };

                Logger.Information("Comprehensive models enumeration complete: {TotalModels} total ({CustomModels} custom, {StandardModels} standard), {TotalObjects} total objects", 
                    allModels.Count, customModels.Count, standardModels.Count, totalObjects);

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
            var standardModels = new List<object>();
            
            try
            {
                // Get metadata path from configuration
                var metadataPath = _config.D365Config.PackagesLocalDirectory;
                Logger.Information("Creating metadata provider for standard models: {MetadataPath}", metadataPath);

                // Create the metadata provider using the same pattern as ListObjectsByModelHandler
                var factory = new MetadataProviderFactory();
                var provider = factory.CreateDiskProvider(metadataPath);

                // Known standard D365 models (expanded from our discovery)
                var candidateModels = new List<string>
                {
                    "ApplicationSuite", "ApplicationFoundation", "ApplicationPlatform", "ApplicationCommon",
                    "Foundation", "ApplicationWorkspaces", "BusinessProcessDesigner", "Calendar",
                    "ContactPerson", "Currency", "Dimensions", "Directory", "ElectronicReporting",
                    "ElectronicReportingConfiguration", "ElectronicReportingMapping", "GeneralLedger",
                    "Ledger", "Policy", "SourceDocumentation", "Tax", "UnitOfMeasure",
                    "TestEssentials", "ApplicationSuiteTest", "ApplicationFoundationTest"
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

                            standardModels.Add(new
                            {
                                Name = modelName,
                                Type = "Standard",
                                Publisher = "Microsoft",
                                Version = "10.0",
                                Layer = "Standard",
                                ObjectCount = objectCount,
                                HasObjects = objectCount > 0,
                                Status = "Available"
                            });

                            Logger.Debug("Standard model {ModelName}: {ObjectCount} tables", modelName, objectCount);
                        }
                    }
                    catch (Exception modelEx)
                    {
                        Logger.Debug("Standard model {ModelName} not available: {Error}", modelName, modelEx.Message);
                        // Model doesn't exist or isn't accessible - skip it
                    }
                }

                Logger.Information("Found {Count} standard D365 models", standardModels.Count);
                return standardModels;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting standard D365 models");
                return standardModels; // Return partial results
            }
        }

        private string GetVersionString(IDictionary<string, object> modelDict)
        {
            try
            {
                var major = modelDict.ContainsKey("VersionMajor") ? modelDict["VersionMajor"]?.ToString() ?? "0" : "0";
                var minor = modelDict.ContainsKey("VersionMinor") ? modelDict["VersionMinor"]?.ToString() ?? "0" : "0";
                var build = modelDict.ContainsKey("VersionBuild") ? modelDict["VersionBuild"]?.ToString() ?? "0" : "0";
                var revision = modelDict.ContainsKey("VersionRevision") ? modelDict["VersionRevision"]?.ToString() ?? "0" : "0";
                return $"{major}.{minor}.{build}.{revision}";
            }
            catch
            {
                return "Unknown";
            }
        }
    }
}
