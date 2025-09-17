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
using D365MetadataService.Services;
using Newtonsoft.Json;

#nullable enable

namespace D365MetadataService.Services
{
    /// <summary>
    /// D365 Object Factory using reflection for creating 500+ object types with dual provider support
    /// </summary>
    public class D365ObjectFactory
    {
        private readonly IMetadataProvider _customMetadataProvider;
        private readonly IMetadataProvider _standardMetadataProvider;
        private readonly IMetadataProvider _metadataProvider; // Primary provider for backward compatibility
        private readonly ILogger _logger;
        private readonly D365ReflectionManager _reflectionManager;
        private readonly Dictionary<string, Type> _axTypeCache;
        private readonly Dictionary<string, PropertyInfo> _providerPropertyCache;
        private readonly Dictionary<string, MethodInfo> _createMethodCache;

        public D365ObjectFactory(D365Configuration config, ILogger logger)
        {
            _logger = logger.ForContext<D365ObjectFactory>();
            _reflectionManager = D365ReflectionManager.Instance;
            _axTypeCache = new Dictionary<string, Type>();
            _providerPropertyCache = new Dictionary<string, PropertyInfo>();
            _createMethodCache = new Dictionary<string, MethodInfo>();

            try
            {
                // Initialize DUAL metadata providers
                var providerFactory = new MetadataProviderFactory();
                
                _customMetadataProvider = providerFactory.CreateDiskProvider(config.CustomMetadataPath);
                _logger.Information("✅ Custom metadata provider initialized: {Path}", config.CustomMetadataPath);
                
                _standardMetadataProvider = providerFactory.CreateDiskProvider(config.PackagesLocalDirectory);
                _logger.Information("✅ Standard metadata provider initialized: {Path}", config.PackagesLocalDirectory);

                // Set custom as primary for backward compatibility
                _metadataProvider = _customMetadataProvider;

                // Initialize reflection caches
                InitializeReflectionCaches();

                _logger.Information("🎯 DUAL-PROVIDER D365 Object Factory initialized with {TypeCount} cached types", _axTypeCache.Count);
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

            // Cache all Ax types from Microsoft.Dynamics.AX.Metadata.MetaModel namespace using centralized reflection manager
            var metaModelAssembly = _reflectionManager.GetD365MetadataAssembly();
            var axTypes = metaModelAssembly.GetTypes().Where(t => 
                t.IsClass && 
                !t.IsAbstract && 
                t.Name.StartsWith("Ax") && 
                t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel");

            foreach (var type in axTypes)
            {
                _axTypeCache[type.Name] = type;
            }

            _logger.Information("Cached {Count} Ax types", _axTypeCache.Count);

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
                var modelSaveInfo = CreateModelSaveInfo(model ?? "ApplicationSuite");

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
                        ["model"] = model ?? "ApplicationSuite",
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

            _logger.Information("=== PARAMETER MAPPING DEBUG === for {ObjectType}", axType.Name);
            _logger.Information("Received parameters: {Parameters}", string.Join(", ", parameters.Select(kvp => $"{kvp.Key}={kvp.Value}")));

            // Special handling for ObjectName -> Name mapping
            if (parameters.ContainsKey("ObjectName") && !parameters.ContainsKey("Name"))
            {
                parameters["Name"] = parameters["ObjectName"];
                _logger.Information("✅ Mapped ObjectName '{ObjectName}' to Name property", parameters["ObjectName"]);
            }
            else if (parameters.ContainsKey("ObjectName") && parameters.ContainsKey("Name"))
            {
                _logger.Information("⚠️ Both ObjectName and Name exist. Name='{Name}', ObjectName='{ObjectName}'", parameters["Name"], parameters["ObjectName"]);
            }
            else if (!parameters.ContainsKey("ObjectName") && !parameters.ContainsKey("Name"))
            {
                _logger.Error("❌ Neither ObjectName nor Name parameter found!");
            }

            foreach (var kvp in parameters)
            {
                // Skip parameters that don't belong to the AxForm object itself
                // These are handled elsewhere in the form creation process
                if (axType.Name == "AxForm")
                {
                    var nonAxFormProperties = new[] { "Pattern", "PatternVersion", "Layer" };
                    if (nonAxFormProperties.Contains(kvp.Key, StringComparer.OrdinalIgnoreCase))
                    {
                        _logger.Debug("Skipping {PropertyName} - handled elsewhere in form creation process", kvp.Key);
                        continue;
                    }
                }

                var property = properties.FirstOrDefault(p => 
                    string.Equals(p.Name, kvp.Key, StringComparison.OrdinalIgnoreCase));

                if (property != null && property.CanWrite)
                {
                    try
                    {
                        var value = ConvertValue(kvp.Value, property.PropertyType);
                        property.SetValue(axInstance, value);
                        _logger.Information("✅ Set {PropertyName} = '{Value}' on {ObjectType}", property.Name, value, axType.Name);
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "❌ Failed to set property {PropertyName}", property.Name);
                    }
                }
                else
                {
                    _logger.Warning("Property {PropertyName} not found or not writable on {ObjectType}. Available properties: {Properties}", 
                        kvp.Key, axType.Name, string.Join(", ", properties.Where(p => p.CanWrite).Select(p => p.Name).Take(10)));
                }
            }
        }

        /// <summary>
        /// Find the appropriate provider property for an object type
        /// </summary>
        private PropertyInfo? FindProviderProperty(string objectType)
        {
            _logger.Information("Finding provider property for object type: {ObjectType}", objectType);
            _logger.Information("Provider property cache has {Count} entries", _providerPropertyCache.Count);
            
            // BREAKTHROUGH DISCOVERY: All object types use the same "Item" property!
            // The provider only has one collection property with Create methods: Item
            
            foreach (var kvp in _providerPropertyCache)
            {
                _logger.Information("Cache entry: Key='{Key}', Property='{PropertyName}'", kvp.Key, kvp.Value?.Name ?? "null");
            }
            
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
        private object? ConvertValue(object value, Type targetType)
        {
            if (value == null) return null;
            if (targetType.IsAssignableFrom(value.GetType())) return value;

            // Handle string to other type conversions
            if (value is string stringValue)
            {
                if (targetType == typeof(int)) return int.Parse(stringValue);
                if (targetType == typeof(bool)) return bool.Parse(stringValue);
                if (targetType == typeof(DateTime)) return DateTime.Parse(stringValue);
                
                // Handle enum conversions (including D365 enums like FormTemplate_ITxt)
                if (targetType.IsEnum)
                {
                    try
                    {
                        return Enum.Parse(targetType, stringValue, true);
                    }
                    catch (ArgumentException)
                    {
                        _logger.Warning("Failed to parse '{Value}' as {EnumType}. Available values: {Values}", 
                            stringValue, targetType.Name, string.Join(", ", Enum.GetNames(targetType)));
                        throw;
                    }
                }
                
                // Handle D365 special enum types (like FormTemplate_ITxt)
                if (targetType.Name.EndsWith("_ITxt") || targetType.Name.Contains("Template"))
                {
                    try
                    {
                        // First try standard enum parsing
                        return Enum.Parse(targetType, stringValue, true);
                    }
                    catch (ArgumentException)
                    {
                        // Try with common D365 pattern variations
                        var possibleNames = new[] { stringValue, stringValue.ToLower(), stringValue.ToUpper(), 
                                                  $"{stringValue}Pattern", $"{stringValue}Template" };
                        
                        foreach (var name in possibleNames)
                        {
                            try
                            {
                                return Enum.Parse(targetType, name, true);
                            }
                            catch (ArgumentException) { continue; }
                        }
                        
                        _logger.Warning("Failed to parse '{Value}' as {EnumType}. Available values: {Values}", 
                            stringValue, targetType.Name, string.Join(", ", Enum.GetNames(targetType)));
                        throw;
                    }
                }
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

        /// <summary>
        /// Retrieve an existing D365 object from metadata providers (tries custom first, then standard)
        /// </summary>
        public object? GetExistingObject(string objectType, string objectName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(objectType) || string.IsNullOrWhiteSpace(objectName))
                {
                    _logger.Warning("Invalid parameters for GetExistingObject: objectType={ObjectType}, objectName={ObjectName}", objectType, objectName);
                    return null;
                }

                _logger.Information("🔍 DUAL-PROVIDER: Retrieving {ObjectType}:{ObjectName}", objectType, objectName);

                // Get the Ax type
                if (!_axTypeCache.TryGetValue(objectType, out var axType))
                {
                    _logger.Warning("Object type {ObjectType} not found in cache", objectType);
                    return null;
                }

                // DUAL-PROVIDER LOGIC: Try custom provider first, then standard provider
                _logger.Information("🔄 Trying CUSTOM provider first for {ObjectType}:{ObjectName}", objectType, objectName);
                var result = TryGetObjectFromProvider(_customMetadataProvider, "Custom", objectType, objectName, axType);
                if (result != null)
                {
                    _logger.Information("✅ Found {ObjectType}:{ObjectName} in CUSTOM provider", objectType, objectName);
                    return result;
                }

                _logger.Information("🔄 Custom provider failed, trying STANDARD provider for {ObjectType}:{ObjectName}", objectType, objectName);
                result = TryGetObjectFromProvider(_standardMetadataProvider, "Standard", objectType, objectName, axType);
                if (result != null)
                {
                    _logger.Information("✅ Found {ObjectType}:{ObjectName} in STANDARD provider", objectType, objectName);
                    return result;
                }

                _logger.Warning("❌ Object {ObjectType}:{ObjectName} not found in either provider", objectType, objectName);
                return null;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to retrieve existing object {ObjectType}:{ObjectName}", objectType, objectName);
                return null;
            }
        }

        /// <summary>
        /// Try to retrieve an object from a specific metadata provider
        /// </summary>
        private object? TryGetObjectFromProvider(IMetadataProvider provider, string providerName, string objectType, string objectName, Type axType)
        {
            try
            {
                // Find the provider property for this object type
                var providerProperty = FindProviderProperty(objectType);
                if (providerProperty == null)
                {
                    _logger.Debug("Provider property not found for {ObjectType} in {ProviderName}", objectType, providerName);
                    return null;
                }

                // Access the provider collection (e.g., Item[AxTable])
                var providerCollection = providerProperty.GetValue(provider, new object[] { axType });
                if (providerCollection == null)
                {
                    _logger.Debug("Provider collection is null for {ObjectType} in {ProviderName}", objectType, providerName);
                    return null;
                }

                // Look for read methods dynamically
                var providerType = providerCollection.GetType();
                var readMethod = GetReadMethodDynamically(providerType);
                if (readMethod == null)
                {
                    _logger.Debug("No Read method found for {ObjectType} in {ProviderName}", objectType, providerName);
                    return null;
                }

                // Invoke the Read/Get method
                var result = readMethod.Invoke(providerCollection, new object[] { objectName });
                
                if (result != null)
                {
                    _logger.Information("Successfully retrieved {ObjectType}:{ObjectName} from {ProviderName}", objectType, objectName, providerName);
                }
                else
                {
                    _logger.Debug("Object {ObjectType}:{ObjectName} not found in {ProviderName} metadata store", objectType, objectName, providerName);
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.Debug(ex, "Exception trying {ProviderName} provider for {ObjectType}:{ObjectName}", providerName, objectType, objectName);
                return null;
            }
        }

        /// <summary>
        /// Get parameter schemas for object creation - replaced hardcoding with dynamic discovery
        /// </summary>
        public object GetParameterSchemas()
        {
            try
            {
                // Return a dynamic schema based on discovered types rather than hardcoded schemas
                var assembly = _reflectionManager.GetD365MetadataAssembly();
                var axTypes = assembly.GetTypes()
                    .Where(t => t.Name.StartsWith("Ax") && 
                               t.IsClass && 
                               !t.IsAbstract && 
                               t.IsPublic)
                    .Take(50) // Limit for performance
                    .Select(t => new { 
                        TypeName = t.Name, 
                        Properties = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                            .Where(p => p.CanWrite)
                            .Select(p => new { 
                                Name = p.Name, 
                                Type = p.PropertyType.Name 
                            })
                            .Take(10) // Limit properties per type
                            .ToArray()
                    })
                    .ToArray();

                return new { 
                    Message = "Dynamic parameter schemas - no hardcoding", 
                    AvailableTypes = axTypes.Length,
                    SampleTypes = axTypes 
                };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error getting parameter schemas dynamically");
                return new { Error = "Failed to get dynamic parameter schemas", Details = ex.Message };
            }
        }

        /// <summary>
        /// Save a modified object back to the metadata store
        /// </summary>
        public Task<bool> SaveObjectAsync(string objectType, string objectName, object modifiedObject)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(objectType) || string.IsNullOrWhiteSpace(objectName) || modifiedObject == null)
                {
                    _logger.Warning("Invalid parameters for SaveObjectAsync: objectType={ObjectType}, objectName={ObjectName}, object is null={IsNull}", 
                        objectType, objectName, modifiedObject == null);
                    return Task.FromResult(false);
                }

                _logger.Information("Saving modified object: {ObjectType}:{ObjectName}", objectType, objectName);

                // First, try to save using the provider itself (not the collection)
                var providerType = _metadataProvider.GetType();
                var providerMethods = providerType.GetMethods(BindingFlags.Public | BindingFlags.Instance);
                
                _logger.Information("Available methods on provider for {ObjectType}: {Methods}", 
                    objectType, string.Join(", ", providerMethods.Select(m => $"{m.Name}({string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name))})")));

                // NO HARDCODING: Look for save methods dynamically
                var providerSaveMethod = GetSaveMethodDynamically(providerType, modifiedObject, providerMethods);

                if (providerSaveMethod != null)
                {
                    _logger.Information("Using provider method {MethodName} to save {ObjectType}:{ObjectName}", providerSaveMethod.Name, objectType, objectName);
                    providerSaveMethod.Invoke(_metadataProvider, new object[] { modifiedObject });
                    _logger.Information("Successfully saved {ObjectType}:{ObjectName} to metadata store using provider method", objectType, objectName);
                    return Task.FromResult(true);
                }

                // If no provider method found, try the collection approach as fallback
                _logger.Information("No provider save method found, trying collection approach for {ObjectType}", objectType);

                // Get the Ax type
                if (!_axTypeCache.TryGetValue(objectType, out var axType))
                {
                    _logger.Warning("Object type {ObjectType} not found in cache", objectType);
                    return Task.FromResult(false);
                }

                // Find the provider property
                var providerProperty = FindProviderProperty(objectType);
                if (providerProperty == null)
                {
                    _logger.Warning("Provider property not found for {ObjectType}", objectType);
                    return Task.FromResult(false);
                }

                // Access the provider collection (e.g., Item[AxTable])
                var providerCollection = providerProperty.GetValue(_metadataProvider, new object[] { axType });
                if (providerCollection == null)
                {
                    _logger.Warning("Provider collection is null for {ObjectType}", objectType);
                    return Task.FromResult(false);
                }

                // Discover available methods on the provider collection
                var collectionType = providerCollection.GetType();
                var allMethods = collectionType.GetMethods(BindingFlags.Public | BindingFlags.Instance);
                
                _logger.Information("Available methods on provider collection for {ObjectType}: {Methods}", 
                    objectType, string.Join(", ", allMethods.Select(m => $"{m.Name}({string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name))})")));

                // Look for methods that could save the object - these methods typically require ModelSaveInfo as second parameter
                var createMethod = allMethods.FirstOrDefault(m => m.Name == "Create" && 
                    m.GetParameters().Length == 2 && 
                    m.GetParameters()[0].ParameterType.IsAssignableFrom(modifiedObject.GetType()));
                
                var updateMethod = allMethods.FirstOrDefault(m => m.Name == "Update" && 
                    m.GetParameters().Length == 2 && 
                    m.GetParameters()[0].ParameterType.IsAssignableFrom(modifiedObject.GetType()));

                MethodInfo? saveMethod = null;
                object[]? parameters = null;

                if (createMethod != null)
                {
                    saveMethod = createMethod;
                    // Create a properly initialized ModelSaveInfo
                    var modelSaveInfoType = createMethod.GetParameters()[1].ParameterType;
                    var modelSaveInfo = CreateModelSaveInfo(modelSaveInfoType, objectName);
                    parameters = new object[] { modifiedObject, modelSaveInfo };
                    _logger.Information("Using Create method with parameters: {ObjectType}, {ModelSaveInfoType}", modifiedObject.GetType().Name, modelSaveInfoType.Name);
                }
                else if (updateMethod != null)
                {
                    saveMethod = updateMethod;
                    // Create a properly initialized ModelSaveInfo  
                    var modelSaveInfoType = updateMethod.GetParameters()[1].ParameterType;
                    var modelSaveInfo = CreateModelSaveInfo(modelSaveInfoType, objectName);
                    parameters = new object[] { modifiedObject, modelSaveInfo };
                    _logger.Information("Using Update method with parameters: {ObjectType}, {ModelSaveInfoType}", modifiedObject.GetType().Name, modelSaveInfoType.Name);
                }

                if (saveMethod == null)
                {
                    _logger.Warning("No suitable save method found on provider or collection for {ObjectType}", objectType);
                    return Task.FromResult(false);
                }

                _logger.Information("Using collection method {MethodName} to save {ObjectType}:{ObjectName}", saveMethod.Name, objectType, objectName);

                // Invoke the save method with proper parameters
                saveMethod.Invoke(providerCollection, parameters);
                
                _logger.Information("Successfully saved {ObjectType}:{ObjectName} to metadata store using collection method", objectType, objectName);
                return Task.FromResult(true);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error saving object {ObjectType}:{ObjectName}", objectType, objectName);
                return Task.FromResult(false);
            }
        }

        /// <summary>
        /// Create a properly initialized ModelSaveInfo object
        /// </summary>
        private object CreateModelSaveInfo(Type modelSaveInfoType, string objectName)
        {
            try
            {
                var modelSaveInfo = Activator.CreateInstance(modelSaveInfoType);
                
                // Log all properties to understand the structure
                var properties = modelSaveInfoType.GetProperties();
                _logger.Information("ModelSaveInfo properties: {Properties}", 
                    string.Join(", ", properties.Select(p => $"{p.Name}:{p.PropertyType.Name}")));
                
                // Set all required properties based on discovered structure
                // Properties: Id:Int32, SequenceId:Int32, Layer:Int32, Name:String, Precedence:Int64
                                
                var idProperty = modelSaveInfoType.GetProperty("Id");
                if (idProperty != null && idProperty.CanWrite)
                {
                    idProperty.SetValue(modelSaveInfo, 1);
                    _logger.Information("Set Id property to: 1");
                }

                var sequenceIdProperty = modelSaveInfoType.GetProperty("SequenceId");
                if (sequenceIdProperty != null && sequenceIdProperty.CanWrite)
                {
                    sequenceIdProperty.SetValue(modelSaveInfo, 1);
                    _logger.Information("Set SequenceId property to: 1");
                }

                var layerProperty = modelSaveInfoType.GetProperty("Layer");
                if (layerProperty != null && layerProperty.CanWrite)
                {
                    // Use layer enum value - 8 is typically USR layer
                    layerProperty.SetValue(modelSaveInfo, 8);
                    _logger.Information("Set Layer property to: 8 (USR)");
                }

                var nameProperty = modelSaveInfoType.GetProperty("Name");
                if (nameProperty != null && nameProperty.CanWrite)
                {
                    // Use a default model name - this could be made configurable
                    nameProperty.SetValue(modelSaveInfo, "MyCustomModel");
                    _logger.Information("Set Name property to: MyCustomModel");
                }

                var precedenceProperty = modelSaveInfoType.GetProperty("Precedence");
                if (precedenceProperty != null && precedenceProperty.CanWrite)
                {
                    precedenceProperty.SetValue(modelSaveInfo, 1L);
                    _logger.Information("Set Precedence property to: 1");
                }

                return modelSaveInfo;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to create ModelSaveInfo for {ObjectName}", objectName);
                return Activator.CreateInstance(modelSaveInfoType);
            }
        }

        /// <summary>
        /// Get an Ax type by name for external use
        /// </summary>
        public Type? GetAxType(string typeName)
        {
            return _axTypeCache.TryGetValue(typeName, out var type) ? type : null;
        }

        /// <summary>
        /// NO HARDCODING: Dynamically find read methods on provider collections
        /// </summary>
        private MethodInfo? GetReadMethodDynamically(Type providerType)
        {
            try
            {
                // Get all methods that could be read methods
                var readMethods = providerType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.GetParameters().Length == 1 && 
                               m.GetParameters()[0].ParameterType == typeof(string) &&
                               m.ReturnType != typeof(void))
                    .OrderBy(m => GetMethodPriority(m.Name))
                    .ToArray();

                if (readMethods.Any())
                {
                    var selectedMethod = readMethods.First();
                    _logger.Debug("Selected read method: {MethodName} from {MethodCount} candidates", 
                        selectedMethod.Name, readMethods.Length);
                    return selectedMethod;
                }

                _logger.Warning("No suitable read method found on provider type {TypeName}", providerType.Name);
                return null;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error finding read method dynamically");
                return null;
            }
        }

        /// <summary>
        /// NO HARDCODING: Dynamically find save methods on provider collections
        /// </summary>
        private MethodInfo? GetSaveMethodDynamically(Type providerType, object modifiedObject, MethodInfo[] providerMethods)
        {
            try
            {
                var objectType = modifiedObject.GetType();

                // Define methods that should be excluded from save method consideration
                var excludedMethods = new HashSet<string> 
                { 
                    "ToString", "Equals", "GetHashCode", "GetType", "Dispose", 
                    "WaitForCompletion", "GetEnumerator", "FromFile" 
                };

                // Filter out methods that are clearly not save methods
                var candidateMethods = providerMethods
                    .Where(m => !excludedMethods.Contains(m.Name) && 
                               m.GetParameters().Length == 1 &&
                               !m.Name.StartsWith("get_") && 
                               !m.Name.StartsWith("set_") &&
                               !m.Name.StartsWith("add_") && 
                               !m.Name.StartsWith("remove_"))
                    .ToArray();

                _logger.Information("Filtered candidate save methods: {Methods}", 
                    string.Join(", ", candidateMethods.Select(m => m.Name)));

                // First try methods that take the exact object type
                var exactMethods = candidateMethods
                    .Where(m => m.GetParameters()[0].ParameterType == objectType)
                    .OrderBy(m => GetMethodPriority(m.Name))
                    .ToArray();

                if (exactMethods.Any())
                {
                    var selectedMethod = exactMethods.First();
                    _logger.Information("Selected exact save method: {MethodName}", selectedMethod.Name);
                    return selectedMethod;
                }

                // Then try methods that can accept the object type (assignable)
                var assignableMethods = candidateMethods
                    .Where(m => m.GetParameters()[0].ParameterType.IsAssignableFrom(objectType))
                    .OrderBy(m => GetMethodPriority(m.Name))
                    .ToArray();

                if (assignableMethods.Any())
                {
                    var selectedMethod = assignableMethods.First();
                    _logger.Information("Selected assignable save method: {MethodName}", selectedMethod.Name);
                    return selectedMethod;
                }

                _logger.Warning("No suitable save method found for object type {ObjectType}", objectType.Name);
                _logger.Warning("Available candidate methods were: {Methods}", 
                    string.Join(", ", candidateMethods.Select(m => m.Name)));
                return null;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error finding save method dynamically");
                return null;
            }
        }

        /// <summary>
        /// NO HARDCODING: Get method priority based on name patterns (lower = higher priority)
        /// </summary>
        private int GetMethodPriority(string methodName)
        {
            // Define priority patterns without hardcoding specific names
            var lowerName = methodName.ToLowerInvariant();
            
            // Prioritize common patterns
            if (lowerName.Contains("create")) return 1;
            if (lowerName.Contains("save")) return 2;
            if (lowerName.Contains("write")) return 3;
            if (lowerName.Contains("update")) return 4;
            if (lowerName.Contains("read")) return 5;
            if (lowerName.Contains("get")) return 6;
            
            // Default priority for unknown patterns
            return 10;
        }

        /// <summary>
        /// Discover available object types using existing reflection cache
        /// </summary>
        public Dictionary<string, Type> GetAvailableObjectTypes()
        {
            return new Dictionary<string, Type>(_axTypeCache);
        }

        /// <summary>
        /// Check if an object type is supported
        /// </summary>
        public bool IsObjectTypeSupported(string objectType)
        {
            return _axTypeCache.ContainsKey(objectType);
        }

        /// <summary>
        /// Get type information for an object type
        /// </summary>
        public Type? GetObjectType(string objectType)
        {
            return _axTypeCache.TryGetValue(objectType, out var type) ? type : null;
        }
    }
}
