using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.IO;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.AX.Metadata.Service;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Microsoft.Dynamics.AX.Metadata.Providers;
using Serilog;
using D365MetadataService.Models;

namespace D365MetadataService.Services
{
    public class D365ObjectFactory
    {
        private readonly IMetaModelService _metaModelService;
        private readonly IMetadataProvider _metadataProvider;
        private readonly string _customMetadataPath;
        private readonly ILogger _logger;

        public D365ObjectFactory(D365Configuration config, ILogger logger)
        {
            _logger = logger.ForContext<D365ObjectFactory>();
            _customMetadataPath = config.CustomMetadataPath;

            _logger.Information("D365 Object Factory initializing with model: {Model}", config.DefaultModel);
            _logger.Information("PackagesLocalDirectory from config: '{PackagesPath}'", config.PackagesLocalDirectory);
            _logger.Information("CustomMetadataPath from config: '{CustomMetadataPath}'", config.CustomMetadataPath);

            try
            {
                // Create MetadataProviderFactory
                _logger.Information("Creating MetadataProviderFactory...");
                var providerFactory = new MetadataProviderFactory();

                // Create DiskProvider with custom metadata path for writing new objects
                _logger.Information("Creating DiskProvider with custom metadata path: {Path}", config.CustomMetadataPath);
                _metadataProvider = providerFactory.CreateDiskProvider(config.CustomMetadataPath);

                // For now, we'll skip MetaModelService as it's not required for basic object creation
                _logger.Information("Skipping MetaModelService - using direct provider approach");
                _metaModelService = null;
                _logger.Information("Direct provider approach initialized successfully with real Microsoft API");

                // Verify the custom metadata path exists
                if (Directory.Exists(config.CustomMetadataPath))
                {
                    _logger.Information("CustomMetadataPath verified: {Path}", config.CustomMetadataPath);
                }
                else
                {
                    _logger.Warning("CustomMetadataPath does not exist, will be created: {Path}", config.CustomMetadataPath);
                    Directory.CreateDirectory(config.CustomMetadataPath);
                }

                _logger.Information("D365 Object Factory initialized successfully with Microsoft API integration");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to initialize D365 Object Factory");
                throw;
            }

            _logger.Information("D365 Object Factory initialized");
        }

        public Task<ObjectCreationResult> CreateAxClassAsync(Dictionary<string, object> parameters)
        {
            return Task.FromResult(CreateAxClass(parameters));
        }

        private ObjectCreationResult CreateAxClass(Dictionary<string, object> parameters)
        {
            try
            {
                _logger.Information("Creating AxClass with parameters: {@Parameters}", parameters);

                // Extract parameters
                var name = parameters.ContainsKey("name") ? parameters["name"]?.ToString() : throw new ArgumentException("Name parameter is required");
                var model = parameters.ContainsKey("model") ? parameters["model"]?.ToString() : "ApplicationSuite";

                _logger.Information("Creating AxClass with name: {Name}, model: {Model}", name, model);

                // Create the AxClass object using Microsoft API
                var axClass = new AxClass();
                axClass.Name = name;
                axClass.Declaration = $"public class {name}\r\n{{\r\n}}";

                _logger.Information("AxClass created with Name: {Name} and Declaration set", axClass.Name);

                // CRITICAL FIX: Verify the GetPrimaryKey() method returns the correct value
                var primaryKey = axClass.GetPrimaryKey();
                _logger.Information("AxClass.GetPrimaryKey(): '{PrimaryKey}' (this becomes metaKey in CreateInternalWithDelta)", primaryKey);
                
                if (string.IsNullOrEmpty(primaryKey))
                {
                    _logger.Error("CRITICAL ERROR: AxClass.GetPrimaryKey() returned null or empty - this causes metaKey null reference!");
                    throw new InvalidOperationException($"AxClass.GetPrimaryKey() returned null or empty for name '{name}'. This will cause metaKey null reference in CreateInternalWithDelta.");
                }

                // Additional validation - check if Name matches GetPrimaryKey()
                if (!string.Equals(name, primaryKey, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.Warning("Name '{Name}' != GetPrimaryKey() '{PrimaryKey}' - this might cause issues", name, primaryKey);
                }

                // Log all critical AxClass properties for debugging
                _logger.Information("AxClass properties before API call:");
                _logger.Information("  Name: '{Name}'", axClass.Name);
                _logger.Information("  GetPrimaryKey(): '{PrimaryKey}'", axClass.GetPrimaryKey());
                _logger.Information("  Declaration length: {Length}", axClass.Declaration?.Length ?? 0);

                // Create ModelSaveInfo using the CORRECT type from investigation
                var modelSaveInfo = CreateModelSaveInfo(model);
                
                // Use Microsoft API to create the class
                _logger.Information("Calling Microsoft API to create AxClass...");
                _metadataProvider.Classes.Create(axClass, modelSaveInfo);
                _logger.Information("Microsoft API CreateClass completed successfully");

                return new ObjectCreationResult
                {
                    Success = true,
                    ObjectType = "AxClass",
                    Name = name,
                    Properties = new Dictionary<string, object>
                    {
                        ["message"] = $"AxClass '{name}' created successfully in model '{model}'",
                        ["model"] = model,
                        ["customMetadataPath"] = _customMetadataPath
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Microsoft API CreateClass failed: {Message}", ex.Message);
                _logger.Error(ex, "Failed to create AxClass with parameters: {@Parameters}", parameters);
                return new ObjectCreationResult
                {
                    Success = false,
                    ErrorMessage = $"Microsoft API CreateClass failed: {ex.Message}",
                    ObjectType = "AxClass",
                    Name = parameters.ContainsKey("name") ? parameters["name"]?.ToString() : "Unknown"
                };
            }
        }

        private ModelSaveInfo CreateModelSaveInfo(string modelName)
        {
            _logger.Information("Creating ModelInfo for model: {Model} using exact type discovered", modelName);

            try
            {
                // Use the CORRECT ModelSaveInfo type: Microsoft.Dynamics.AX.Metadata.MetaModel.ModelSaveInfo
                var modelSaveInfo = new Microsoft.Dynamics.AX.Metadata.MetaModel.ModelSaveInfo();

                // Get the actual model information from the Microsoft API
                if (modelName.Equals("cc", StringComparison.OrdinalIgnoreCase) && _metadataProvider?.ModelManifest != null)
                {
                    try
                    {
                        // Read the actual model info from Microsoft API
                        var modelInfo = _metadataProvider.ModelManifest.Read(modelName);
                        if (modelInfo != null)
                        {
                            modelSaveInfo.Id = modelInfo.Id;  // Use ACTUAL ID from Microsoft API (1, not 896000582)
                            modelSaveInfo.Layer = modelInfo.Layer;
                            modelSaveInfo.Name = modelInfo.Name;
                            
                            _logger.Information("ModelSaveInfo configured from Microsoft API for 'cc' model:");
                            _logger.Information("  Id: {Id} (from Microsoft API, not cc.xml)", modelSaveInfo.Id);
                            _logger.Information("  Layer: {Layer} (from Microsoft API)", modelSaveInfo.Layer);
                            _logger.Information("  Name: {Name} (from Microsoft API)", modelSaveInfo.Name);
                            _logger.Information("  Model Key from API: {Key}", modelInfo.Key?.ToString() ?? "null");
                        }
                        else
                        {
                            _logger.Warning("Could not read model '{Model}' from Microsoft API, using fallback values", modelName);
                            // Fallback to previous values
                            modelSaveInfo.Id = 1;  // Use ID 1 as discovered from API
                            modelSaveInfo.Layer = 14;
                            modelSaveInfo.Name = "cc";
                        }
                    }
                    catch (Exception apiEx)
                    {
                        _logger.Error(apiEx, "Error reading model '{Model}' from Microsoft API: {Message}", modelName, apiEx.Message);
                        // Fallback to discovered values
                        modelSaveInfo.Id = 1;  // Use actual ID from API response
                        modelSaveInfo.Layer = 14;
                        modelSaveInfo.Name = "cc";
                    }
                }
                else
                {
                    // Default values for other models or if API is not available
                    modelSaveInfo.Name = modelName;
                    modelSaveInfo.Layer = 14; // usr layer as Int32
                    modelSaveInfo.Id = 1; // Use discovered ID
                    
                    _logger.Information("ModelSaveInfo configured for '{Model}' model with default values", modelName);
                }

                _logger.Information("SUCCESS: ModelSaveInfo created with Microsoft API-aligned configuration for: {Model}", modelName);
                return modelSaveInfo;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to create ModelSaveInfo for model: {Model}", modelName);
                throw;
            }
        }

        public Task<Dictionary<string, object>> GetStatusAsync()
        {
            return Task.FromResult(new Dictionary<string, object>
            {
                ["initialized"] = _metadataProvider != null,
                ["customMetadataPath"] = _customMetadataPath,
                ["metadataProvider"] = _metadataProvider?.GetType()?.Name ?? "null",
                ["metaModelService"] = _metaModelService?.GetType()?.Name ?? "null"
            });
        }

        // Placeholder methods to satisfy interface requirements
        public Task<ObjectCreationResult> CreateAxEnumAsync(Dictionary<string, object> parameters)
        {
            return Task.FromResult(new ObjectCreationResult
            {
                Success = false,
                ErrorMessage = "AxEnum creation not implemented yet",
                ObjectType = "AxEnum"
            });
        }

        public Task<ObjectCreationResult> CreateAxProjectAsync(Dictionary<string, object> parameters)
        {
            return Task.FromResult(new ObjectCreationResult
            {
                Success = false,
                ErrorMessage = "AxProject creation not implemented yet",
                ObjectType = "AxProject"
            });
        }

        public Task<ObjectCreationResult> CreateVS2022ProjectAsync(Dictionary<string, object> parameters)
        {
            return Task.FromResult(new ObjectCreationResult
            {
                Success = false,
                ErrorMessage = "VS2022 project creation not implemented yet",
                ObjectType = "VS2022Project"
            });
        }

        public Dictionary<string, object> GetParameterSchemas()
        {
            return new Dictionary<string, object>
            {
                ["AxClass"] = new Dictionary<string, object>
                {
                    ["name"] = new { type = "string", required = true, description = "The name of the class" },
                    ["model"] = new { type = "string", required = false, description = "The model to create the class in", defaultValue = "ApplicationSuite" }
                }
            };
        }

        public bool ValidateParameters(string objectType, Dictionary<string, object> parameters)
        {
            switch (objectType)
            {
                case "AxClass":
                    return parameters.ContainsKey("name") && !string.IsNullOrEmpty(parameters["name"]?.ToString());
                default:
                    return false;
            }
        }

        public Task<ObjectCreationResult> AssociateObjectToProjectAsync(Dictionary<string, object> parameters)
        {
            return Task.FromResult(new ObjectCreationResult
            {
                Success = false,
                ErrorMessage = "Object association not implemented yet",
                ObjectType = "Association"
            });
        }

        public Dictionary<string, object> GetAllModelsInformation()
        {
            try
            {
                _logger.Information("Getting all models information from Microsoft API");

                var result = new Dictionary<string, object>();
                var models = new List<Dictionary<string, object>>();

                // Get models from the metadata provider using ModelManifest
                if (_metadataProvider?.ModelManifest != null)
                {
                    _logger.Information("Getting models from MetadataProvider.ModelManifest");
                    
                    // Try to get model list using ListModels() method
                    try
                    {
                        var modelList = _metadataProvider.ModelManifest.ListModels();
                        _logger.Information("Found {Count} models using ListModels()", modelList?.Count ?? 0);

                        if (modelList != null)
                        {
                            foreach (var modelName in modelList)
                            {
                                try
                                {
                                    _logger.Information("Processing model: {ModelName}", modelName);
                                    
                                    // Read model information
                                    var modelInfo = _metadataProvider.ModelManifest.Read(modelName);
                                    if (modelInfo != null)
                                    {
                                        var modelData = new Dictionary<string, object>
                                        {
                                            ["Name"] = modelInfo.Name,
                                            ["Id"] = modelInfo.Id,
                                            ["Layer"] = modelInfo.Layer,
                                            ["Module"] = modelInfo.Module,
                                            ["Publisher"] = modelInfo.Publisher ?? "N/A",
                                            ["Description"] = modelInfo.Description ?? "N/A",
                                            ["Key"] = modelInfo.Key?.ToString() ?? "N/A"
                                        };

                                        // Additional properties
                                        try
                                        {
                                            modelData["DisplayName"] = modelInfo.DisplayName ?? modelInfo.Name;
                                            modelData["VersionMajor"] = modelInfo.VersionMajor;
                                            modelData["VersionMinor"] = modelInfo.VersionMinor;
                                            modelData["VersionBuild"] = modelInfo.VersionBuild;
                                            modelData["VersionRevision"] = modelInfo.VersionRevision;
                                        }
                                        catch (Exception propEx)
                                        {
                                            _logger.Warning("Error getting additional properties for model {ModelName}: {Error}", modelName, propEx.Message);
                                        }

                                        models.Add(modelData);
                                        _logger.Information("Added model: {Name} (ID: {Id}, Layer: {Layer}, Key: {Key})", 
                                            modelInfo.Name, modelInfo.Id, modelInfo.Layer, modelInfo.Key);
                                    }
                                    else
                                    {
                                        _logger.Warning("Could not read model info for: {ModelName}", modelName);
                                        models.Add(new Dictionary<string, object>
                                        {
                                            ["Name"] = modelName,
                                            ["Error"] = "Could not read model info",
                                            ["ErrorType"] = "ModelReadError"
                                        });
                                    }
                                }
                                catch (Exception ex)
                                {
                                    _logger.Error(ex, "Error processing model {ModelName}: {Message}", modelName, ex.Message);
                                    models.Add(new Dictionary<string, object>
                                    {
                                        ["Name"] = modelName,
                                        ["Error"] = ex.Message,
                                        ["ErrorType"] = ex.GetType().Name
                                    });
                                }
                            }
                        }
                    }
                    catch (Exception listEx)
                    {
                        _logger.Error(listEx, "Error calling ListModels(): {Message}", listEx.Message);
                        
                        // Try alternative method: ListModelInfos()
                        try
                        {
                            _logger.Information("Trying ListModelInfos() as alternative");
                            var modelInfos = _metadataProvider.ModelManifest.ListModelInfos();
                            _logger.Information("Found {Count} model infos using ListModelInfos()", modelInfos?.Count ?? 0);
                            
                            if (modelInfos != null)
                            {
                                foreach (var modelInfo in modelInfos)
                                {
                                    var modelData = new Dictionary<string, object>
                                    {
                                        ["Name"] = modelInfo.Name,
                                        ["Id"] = modelInfo.Id,
                                        ["Layer"] = modelInfo.Layer,
                                        ["Module"] = modelInfo.Module,
                                        ["Publisher"] = modelInfo.Publisher ?? "N/A",
                                        ["Description"] = modelInfo.Description ?? "N/A",
                                        ["Key"] = modelInfo.Key?.ToString() ?? "N/A",
                                        ["Source"] = "ListModelInfos"
                                    };
                                    
                                    models.Add(modelData);
                                    _logger.Information("Added model from ListModelInfos: {Name} (ID: {Id}, Key: {Key})", 
                                        modelInfo.Name, modelInfo.Id, modelInfo.Key);
                                }
                            }
                        }
                        catch (Exception altEx)
                        {
                            _logger.Error(altEx, "ListModelInfos() also failed: {Message}", altEx.Message);
                        }
                    }
                }
                else
                {
                    _logger.Warning("MetadataProvider.ModelManifest is null");
                }

                result["models"] = models;
                result["totalCount"] = models.Count;
                result["customMetadataPath"] = _customMetadataPath;
                result["metadataProviderType"] = _metadataProvider?.GetType()?.FullName ?? "null";
                result["modelManifestType"] = _metadataProvider?.ModelManifest?.GetType()?.FullName ?? "null";

                _logger.Information("Successfully retrieved {Count} models", models.Count);
                return result;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to get models information: {Message}", ex.Message);
                return new Dictionary<string, object>
                {
                    ["error"] = ex.Message,
                    ["errorType"] = ex.GetType().Name,
                    ["models"] = new List<object>(),
                    ["totalCount"] = 0
                };
            }
        }
    }
}
