using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using System.IO;
using System.Linq;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.AX.Metadata.Service;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Microsoft.Dynamics.AX.Metadata.Providers;
using Microsoft.Dynamics.AX.Metadata.Core.MetaModel;
using Serilog;
using D365MetadataService.Models;
using Newtonsoft.Json;

namespace D365MetadataService.Services
{
    /// <summary>
    /// D365 Object Factory using reflection for creating 500+ object types
    /// </summary>
    public class D365ObjectFactory
    {
        private readonly IMetadataProvider _metadataProvider;
        private readonly ILogger _logger;
        private readonly Dictionary<string, Type> _axTypeCache;
        private readonly Dictionary<string, PropertyInfo> _providerPropertyCache;
        private readonly Dictionary<string, MethodInfo> _createMethodCache;

        public D365ObjectFactory(D365Configuration config, ILogger logger)
        {
            _logger = logger.ForContext<D365ObjectFactory>();
            _axTypeCache = new Dictionary<string, Type>();
            _providerPropertyCache = new Dictionary<string, PropertyInfo>();
            _createMethodCache = new Dictionary<string, MethodInfo>();

            try
            {
                // Initialize metadata provider
                var providerFactory = new MetadataProviderFactory();
                _metadataProvider = providerFactory.CreateDiskProvider(config.CustomMetadataPath);

                // Initialize reflection caches
                InitializeReflectionCaches();

                _logger.Information("Dynamic D365 Object Factory initialized with {TypeCount} cached types", _axTypeCache.Count);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to initialize Dynamic D365 Object Factory");
                throw;
            }
        }

        /// <summary>
        /// Initialize reflection caches for performance
        /// </summary>
        private void InitializeReflectionCaches()
        {
            _logger.Information("Initializing reflection caches...");

            // Cache all Ax types from Microsoft.Dynamics.AX.Metadata.MetaModel namespace
            var metaModelAssembly = typeof(AxClass).Assembly;
            var axTypes = metaModelAssembly.GetTypes().Where(t => 
                t.IsClass && 
                !t.IsAbstract && 
                t.Name.StartsWith("Ax") && 
                t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel");

            foreach (var type in axTypes)
            {
                _axTypeCache[type.Name] = type;
            }

            // Cache provider properties with Create methods
            // BREAKTHROUGH: Based on logs, provider DOES have direct collection properties:
            // Classes, Tables, Enums, Forms, etc. - we don't need to look in provider.Item!
            
            var providerInstance = _metadataProvider;
            var providerType = providerInstance.GetType(); // Use actual provider instance type, not interface
            var providerProperties = providerType.GetProperties(BindingFlags.Public | BindingFlags.Instance);
            
            _logger.Information("Exploring {Count} properties on provider instance of type: {ProviderType}", 
                providerProperties.Length, providerType.FullName);

            foreach (var prop in providerProperties)
            {
                // Check if this property has Create methods with exactly 2 parameters
                var createMethods = prop.PropertyType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.Name == "Create" && m.GetParameters().Length == 2);
                
                if (createMethods.Any())
                {
                    _providerPropertyCache[prop.Name] = prop;
                    _createMethodCache[prop.Name] = createMethods.First();
                    
                    _logger.Information("Cached provider property: {PropertyName} with Create method (declaring type: {PropertyType})", 
                        prop.Name, prop.PropertyType.Name);
                }
                else
                {
                    _logger.Debug("Provider property {PropertyName} has no Create method with 2 parameters (type: {PropertyType})", 
                        prop.Name, prop.PropertyType.Name);
                }
            }

            _logger.Information("Reflection caches initialized: {AxTypes} types, {ProviderProperties} provider properties",
                _axTypeCache.Count, _providerPropertyCache.Count);

            // Log the available provider properties for debugging
            _logger.Information("Available provider properties: {Properties}", 
                string.Join(", ", _providerPropertyCache.Keys));
        }

        /// <summary>
        /// Dynamically create any D365 object type
        /// </summary>
        public async Task<ObjectCreationResult> CreateObjectDynamicallyAsync(string objectType, Dictionary<string, object> parameters)
        {
            return await Task.FromResult(CreateObjectDynamically(objectType, parameters));
        }

        /// <summary>
        /// Core dynamic object creation method
        /// </summary>
        public ObjectCreationResult CreateObjectDynamically(string objectType, Dictionary<string, object> parameters)
        {
            try
            {
                _logger.Information("Creating {ObjectType} dynamically with parameters: {@Parameters}", objectType, parameters);

                // 1. Validate and get the Ax type
                if (!_axTypeCache.TryGetValue(objectType, out var axType))
                {
                    return new ObjectCreationResult
                    {
                        Success = false,
                        ErrorMessage = $"Unknown object type: {objectType}. Available types: {string.Join(", ", _axTypeCache.Keys.Take(10))}...",
                        ObjectType = objectType
                    };
                }

                // 2. Create instance of the Ax type
                var axInstance = Activator.CreateInstance(axType);
                _logger.Information("Created instance of {ObjectType}", objectType);

                // 3. Set properties dynamically
                SetObjectPropertiesDynamically(axInstance, axType, parameters);

                // 4. Find the appropriate provider property and create method
                var providerProperty = FindProviderProperty(objectType);
                if (providerProperty == null)
                {
                    var availableProperties = string.Join(", ", _providerPropertyCache.Keys);
                    return new ObjectCreationResult
                    {
                        Success = false,
                        ErrorMessage = $"No provider property found for {objectType}. Available properties: {availableProperties}",
                        ObjectType = objectType
                    };
                }

                // 5. Get the provider collection using indexer parameters
                // The Item property is an indexer that requires the AX object type as parameter
                _logger.Information("Accessing Item[{AxType}] indexer property", axType);
                var providerCollection = providerProperty.GetValue(_metadataProvider, new object[] { axType });
                
                if (providerCollection == null)
                {
                    return new ObjectCreationResult
                    {
                        Success = false,
                        ErrorMessage = $"Provider collection is null for {objectType} (property: {providerProperty.Name})",
                        ObjectType = objectType
                    };
                }
                
                var createMethod = _createMethodCache[providerProperty.Name];

                // 6. Create ModelSaveInfo
                var model = parameters.ContainsKey("model") ? parameters["model"]?.ToString() : "ApplicationSuite";
                var modelSaveInfo = CreateModelSaveInfo(model);

                // 7. Deep type analysis before invoking Create method
                _logger.Information("=== DEEP TYPE ANALYSIS ===");
                _logger.Information("Target method: {MethodName}", createMethod.Name);
                _logger.Information("Method declaring type: {DeclaringType}", createMethod.DeclaringType.FullName);
                _logger.Information("Provider collection type: {ProviderType}", providerCollection.GetType().FullName);
                
                var methodParams = createMethod.GetParameters();
                _logger.Information("Method expects {ParamCount} parameters:", methodParams.Length);
                for (int i = 0; i < methodParams.Length; i++)
                {
                    var param = methodParams[i];
                    _logger.Information("  [{Index}] {ParamName}: {ParamType}", i, param.Name, param.ParameterType.FullName);
                }
                
                _logger.Information("Actual parameters being passed:");
                _logger.Information("  [0] axInstance: {AxType} (value: {AxValue})", axInstance.GetType().FullName, axInstance);
                _logger.Information("  [1] modelSaveInfo: {ModelType} (value: {ModelValue})", modelSaveInfo.GetType().FullName, modelSaveInfo);
                
                // Check parameter type compatibility
                bool param0Compatible = methodParams[0].ParameterType.IsAssignableFrom(axInstance.GetType());
                bool param1Compatible = methodParams[1].ParameterType.IsAssignableFrom(modelSaveInfo.GetType());
                _logger.Information("Parameter compatibility: param0={Param0}, param1={Param1}", param0Compatible, param1Compatible);
                
                // 8. Invoke the Create method
                _logger.Information("Invoking {ProviderProperty}.Create() for {ObjectType}", providerProperty.Name, objectType);
                createMethod.Invoke(providerCollection, new object[] { axInstance, modelSaveInfo });

                _logger.Information("Successfully created {ObjectType} using dynamic factory", objectType);

                return new ObjectCreationResult
                {
                    Success = true,
                    ObjectType = objectType,
                    Name = GetObjectName(axInstance),
                    Properties = new Dictionary<string, object>
                    {
                        ["message"] = $"{objectType} created successfully using dynamic factory",
                        ["model"] = model,
                        ["providerProperty"] = providerProperty.Name
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to create {ObjectType} dynamically", objectType);
                return new ObjectCreationResult
                {
                    Success = false,
                    ErrorMessage = $"Dynamic creation failed: {ex.Message}",
                    ObjectType = objectType
                };
            }
        }

        /// <summary>
        /// Set object properties using reflection
        /// </summary>
        private void SetObjectPropertiesDynamically(object axInstance, Type axType, Dictionary<string, object> parameters)
        {
            var properties = axType.GetProperties(BindingFlags.Public | BindingFlags.Instance);

            foreach (var kvp in parameters)
            {
                var property = properties.FirstOrDefault(p => 
                    string.Equals(p.Name, kvp.Key, StringComparison.OrdinalIgnoreCase));

                if (property != null && property.CanWrite)
                {
                    try
                    {
                        var value = ConvertValue(kvp.Value, property.PropertyType);
                        property.SetValue(axInstance, value);
                        _logger.Debug("Set {PropertyName} = {Value}", property.Name, value);
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "Failed to set property {PropertyName}", property.Name);
                    }
                }
            }
        }

        /// <summary>
        /// Find the appropriate provider property for an object type
        /// </summary>
        private PropertyInfo FindProviderProperty(string objectType)
        {
            _logger.Information("Finding provider property for object type: {ObjectType}", objectType);
            
            // BREAKTHROUGH DISCOVERY: All object types use the same "Item" property!
            // The provider only has one collection property with Create methods: Item
            
            if (_providerPropertyCache.TryGetValue("Item", out var itemProperty))
            {
                _logger.Information("Using universal 'Item' provider property for {ObjectType}", objectType);
                return itemProperty;
            }
            
            var allCachedProps = string.Join(", ", _providerPropertyCache.Keys.OrderBy(x => x));
            _logger.Error("'Item' provider property not found. Available cached properties: {Properties}", allCachedProps);
                
            return null;
        }

        /// <summary>
        /// Convert parameter values to appropriate types
        /// </summary>
        private object ConvertValue(object value, Type targetType)
        {
            if (value == null) return null;
            if (targetType.IsAssignableFrom(value.GetType())) return value;

            // Handle string to other type conversions
            if (value is string stringValue)
            {
                if (targetType == typeof(int)) return int.Parse(stringValue);
                if (targetType == typeof(bool)) return bool.Parse(stringValue);
                if (targetType == typeof(DateTime)) return DateTime.Parse(stringValue);
                // Add more conversions as needed
            }

            return Convert.ChangeType(value, targetType);
        }

        /// <summary>
        /// Get object name using reflection
        /// </summary>
        private string GetObjectName(object axInstance)
        {
            var nameProperty = axInstance.GetType().GetProperty("Name");
            return nameProperty?.GetValue(axInstance)?.ToString() ?? "Unknown";
        }

        /// <summary>
        /// Create ModelSaveInfo
        /// </summary>
        private ModelSaveInfo CreateModelSaveInfo(string modelName)
        {
            _logger.Information("Creating ModelInfo for model: {Model} using exact type discovered", modelName);

            try
            {
                // Use the CORRECT ModelSaveInfo type: Microsoft.Dynamics.AX.Metadata.MetaModel.ModelSaveInfo
                var modelSaveInfo = new Microsoft.Dynamics.AX.Metadata.MetaModel.ModelSaveInfo();

                // Get the actual model information from the Microsoft API
                if (_metadataProvider?.ModelManifest != null)
                {
                    try
                    {
                        // Read the actual model info from Microsoft API
                        var modelInfo = _metadataProvider.ModelManifest.Read(modelName);
                        if (modelInfo != null)
                        {
                            modelSaveInfo.Id = modelInfo.Id;
                            modelSaveInfo.Layer = modelInfo.Layer;
                            modelSaveInfo.Name = modelInfo.Name;
                            
                            _logger.Information("ModelSaveInfo configured from Microsoft API for '{Model}' model", modelName);
                        }
                        else
                        {
                            _logger.Warning("Could not read model '{Model}' from Microsoft API, using fallback values", modelName);
                            // Fallback to default values
                            modelSaveInfo.Id = 1;
                            modelSaveInfo.Layer = 14;
                            modelSaveInfo.Name = modelName;
                        }
                    }
                    catch (Exception apiEx)
                    {
                        _logger.Error(apiEx, "Error reading model '{Model}' from Microsoft API: {Message}", modelName, apiEx.Message);
                        // Fallback to discovered values
                        modelSaveInfo.Id = 1;
                        modelSaveInfo.Layer = 14;
                        modelSaveInfo.Name = modelName;
                    }
                }
                else
                {
                    // Default values for other models or if API is not available
                    modelSaveInfo.Name = modelName;
                    modelSaveInfo.Layer = 14; // usr layer as Int32
                    modelSaveInfo.Id = 1;
                    
                    _logger.Information("ModelSaveInfo configured with default values for model: {Model}", modelName);
                }

                return modelSaveInfo;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to create ModelSaveInfo for model: {Model}", modelName);
                throw;
            }
        }

        /// <summary>
        /// Get all supported object types
        /// </summary>
        public Dictionary<string, string> GetSupportedObjectTypes()
        {
            var result = new Dictionary<string, string>();

            foreach (var kvp in _axTypeCache)
            {
                var providerProperty = FindProviderProperty(kvp.Key);
                result[kvp.Key] = providerProperty?.Name ?? "No provider found";
            }

            return result;
        }

        /// <summary>
        /// Get object creation statistics
        /// </summary>
        public object GetCreationStatistics()
        {
            return new
            {
                TotalAxTypes = _axTypeCache.Count,
                TotalProviderProperties = _providerPropertyCache.Count,
                SupportedTypes = _axTypeCache.Keys.Where(k => FindProviderProperty(k) != null).Count(),
                UnsupportedTypes = _axTypeCache.Keys.Where(k => FindProviderProperty(k) == null).Count()
            };
        }

        // ===== UTILITY METHODS FOR COMPATIBILITY WITH OLD HANDLERS =====

        /// <summary>
        /// Get parameter schemas for all object types
        /// </summary>
        public Dictionary<string, object> GetParameterSchemas()
        {
            var schemas = new Dictionary<string, object>();

            // Add schemas for common object types
            foreach (var objectType in new[] { "AxClass", "AxEnum", "AxTable", "AxForm", "AxQuery", "AxMenu", "AxView", "AxReport" })
            {
                schemas[objectType] = new Dictionary<string, object>
                {
                    ["name"] = new { type = "string", required = true, description = $"The name of the {objectType.Substring(2).ToLower()}" },
                    ["model"] = new { type = "string", required = false, description = "The model to create the object in", defaultValue = "ApplicationSuite" }
                };
            }

            return schemas;
        }

        /// <summary>
        /// Validate parameters for object creation
        /// </summary>
        public bool ValidateParameters(string objectType, Dictionary<string, object> parameters)
        {
            // Basic validation - all object types need a name
            if (!parameters.ContainsKey("name") || string.IsNullOrEmpty(parameters["name"]?.ToString()))
            {
                return false;
            }

            // Check if object type is supported
            if (!_axTypeCache.ContainsKey(objectType))
            {
                return false;
            }

            return true;
        }

        /// <summary>
        /// Associate object to project (placeholder implementation)
        /// </summary>
        public Task<ObjectCreationResult> AssociateObjectToProjectAsync(Dictionary<string, object> parameters)
        {
            return Task.FromResult(new ObjectCreationResult
            {
                Success = false,
                ErrorMessage = "Object association not implemented yet in dynamic factory",
                ObjectType = "Association"
            });
        }

        /// <summary>
        /// Get all models information from Microsoft API
        /// </summary>
        public Dictionary<string, object> GetAllModelsInformation()
        {
            try
            {
                _logger.Information("Getting all models information from Microsoft API using Dynamic Factory");

                var result = new Dictionary<string, object>();
                var models = new List<Dictionary<string, object>>();

                // Get models from the metadata provider using ModelManifest
                if (_metadataProvider?.ModelManifest != null)
                {
                    _logger.Information("Getting models from MetadataProvider.ModelManifest");
                    
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
                    }
                }
                else
                {
                    _logger.Warning("MetadataProvider.ModelManifest is null");
                }

                result["models"] = models;
                result["totalCount"] = models.Count;
                result["source"] = "DynamicD365ObjectFactory";

                _logger.Information("Successfully retrieved {Count} models using Dynamic Factory", models.Count);
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
                    ["totalCount"] = 0,
                    ["source"] = "DynamicD365ObjectFactory"
                };
            }
        }
    }
}
