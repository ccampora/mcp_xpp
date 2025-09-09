using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using D365MetadataService.Models;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Dynamic reflection-based service that discovers and exposes D365 metadata API capabilities in real-time
    /// No hardcoded abstractions - everything is discovered through reflection
    /// </summary>
    public class DynamicD365ReflectionService
    {
        private readonly D365ObjectFactory _objectFactory;
        private readonly Dictionary<string, Type> _cachedTypes;
        private readonly Dictionary<string, MethodInfo[]> _cachedMethods;
        private readonly Serilog.ILogger _logger;

        public DynamicD365ReflectionService(D365ObjectFactory objectFactory)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
            _cachedTypes = new Dictionary<string, Type>();
            _cachedMethods = new Dictionary<string, MethodInfo[]>();
            _logger = Serilog.Log.ForContext<DynamicD365ReflectionService>();
        }

        /// <summary>
        /// Discovers all modification capabilities for a specific D365 object type
        /// Returns real-time analysis of what methods are available
        /// </summary>
        public async Task<ObjectCapabilities> DiscoverModificationCapabilitiesAsync(string objectTypeName)
        {
            try
            {
                var type = await GetD365TypeAsync(objectTypeName);
                if (type == null)
                {
                    return new ObjectCapabilities
                    {
                        ObjectType = objectTypeName,
                        Success = false,
                        Error = $"Object type '{objectTypeName}' not found"
                    };
                }

                var capabilities = new ObjectCapabilities
                {
                    ObjectType = objectTypeName,
                    Success = true,
                    TypeFullName = type.FullName
                };

                // Discover modification methods (Add*, Insert*, Create*, Remove*, etc.)
                var modificationMethods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => IsModificationMethod(m))
                    .ToArray();

                foreach (var method in modificationMethods)
                {
                    var methodInfo = new MethodCapability
                    {
                        Name = method.Name,
                        ReturnType = method.ReturnType.Name,
                        Description = GenerateMethodDescription(method),
                        Parameters = method.GetParameters().Select(p => new Models.ParameterInfo
                        {
                            Name = p.Name,
                            Type = p.ParameterType.Name,
                            TypeFullName = p.ParameterType.FullName,
                            IsOptional = p.IsOptional,
                            DefaultValue = p.HasDefaultValue ? p.DefaultValue?.ToString() : null,
                            IsOut = p.IsOut,
                            IsRef = p.ParameterType.IsByRef
                        }).ToList()
                    };

                    capabilities.ModificationMethods.Add(methodInfo);
                }

                // Discover writable properties/collections
                var writableProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => p.CanWrite && IsModifiableProperty(p))
                    .ToArray();

                foreach (var property in writableProperties)
                {
                    var propInfo = new PropertyCapability
                    {
                        Name = property.Name,
                        Type = property.PropertyType.Name,
                        TypeFullName = property.PropertyType.FullName,
                        CanRead = property.CanRead,
                        CanWrite = property.CanWrite,
                        IsCollection = IsCollectionType(property.PropertyType),
                        CollectionMethods = IsCollectionType(property.PropertyType) ? 
                            GetCollectionMethods(property.PropertyType) : new List<string>()
                    };

                    capabilities.WritableProperties.Add(propInfo);
                }

                // Discover constructors for related types (field types, etc.)
                capabilities.RelatedTypeConstructors = await DiscoverRelatedTypeConstructorsAsync(type);

                return capabilities;
            }
            catch (Exception ex)
            {
                return new ObjectCapabilities
                {
                    ObjectType = objectTypeName,
                    Success = false,
                    Error = $"Error discovering capabilities: {ex.Message}"
                };
            }
        }

        /// <summary>
        /// Dynamically executes a modification method using reflection
        /// </summary>
        public async Task<DynamicExecutionResult> ExecuteModificationMethodAsync(DynamicMethodCall methodCall)
        {
            var result = new DynamicExecutionResult
            {
                MethodName = methodCall.MethodName,
                ObjectName = methodCall.ObjectName,
                StartTime = DateTime.UtcNow
            };

            try
            {
                // Get the target object
                var targetObject = await GetD365ObjectAsync(methodCall.ObjectType, methodCall.ObjectName);
                if (targetObject == null)
                {
                    result.Success = false;
                    result.Error = $"Object '{methodCall.ObjectName}' of type '{methodCall.ObjectType}' not found";
                    return result;
                }

                // Get the method
                var method = targetObject.GetType().GetMethod(methodCall.MethodName, BindingFlags.Public | BindingFlags.Instance);
                if (method == null)
                {
                    result.Success = false;
                    result.Error = $"Method '{methodCall.MethodName}' not found on type '{methodCall.ObjectType}'";
                    return result;
                }

                // Prepare parameters
                var parameters = await PrepareMethodParametersAsync(method, methodCall.Parameters);
                if (parameters == null)
                {
                    result.Success = false;
                    result.Error = "Failed to prepare method parameters";
                    return result;
                }

                // Execute the method
                var returnValue = method.Invoke(targetObject, parameters);
                
                result.Success = true;
                result.ReturnValue = returnValue;
                result.ReturnType = method.ReturnType.Name;
                result.Message = $"Successfully executed {methodCall.MethodName} on {methodCall.ObjectName}";
                result.ExecutionTime = DateTime.UtcNow - result.StartTime;

                // Get updated object state
                result.UpdatedObjectInfo = await GetObjectStateInfoAsync(targetObject);

                return result;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = $"Execution error: {ex.Message}";
                result.ExecutionTime = DateTime.UtcNow - result.StartTime;
                return result;
            }
        }

        /// <summary>
        /// Discovers available field types that can be created for tables
        /// </summary>
        public async Task<List<Models.TypeInfo>> DiscoverFieldTypesAsync()
        {
            try
            {
                var assembly = Assembly.GetAssembly(typeof(AxTable));
                var fieldTypes = assembly.GetTypes()
                    .Where(t => t.IsSubclassOf(typeof(AxTableField)) && !t.IsAbstract)
                    .Select(t => new Models.TypeInfo
                    {
                        Name = t.Name,
                        FullName = t.FullName,
                        Description = GenerateTypeDescription(t),
                        Constructors = t.GetConstructors().Select(c => new Models.ConstructorInfo
                        {
                            Parameters = c.GetParameters().Select(p => new Models.ParameterInfo
                            {
                                Name = p.Name,
                                Type = p.ParameterType.Name,
                                TypeFullName = p.ParameterType.FullName,
                                IsOptional = p.IsOptional,
                                DefaultValue = p.HasDefaultValue ? p.DefaultValue?.ToString() : null
                            }).ToList()
                        }).ToList()
                    })
                    .ToList();

                return await Task.FromResult(fieldTypes);
            }
            catch (Exception ex)
            {
                throw new Exception($"Error discovering field types: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Creates an instance of a specific type dynamically
        /// </summary>
        public async Task<DynamicCreationResult> CreateInstanceAsync(string typeName, Dictionary<string, object> parameters = null)
        {
            var result = new DynamicCreationResult
            {
                TypeName = typeName,
                StartTime = DateTime.UtcNow
            };

            try
            {
                var type = await GetD365TypeAsync(typeName);
                if (type == null)
                {
                    result.Success = false;
                    result.Error = $"Type '{typeName}' not found";
                    return result;
                }

                // Create instance
                var instance = Activator.CreateInstance(type);
                
                // Set properties if provided
                if (parameters != null)
                {
                    foreach (var param in parameters)
                    {
                        var property = type.GetProperty(param.Key, BindingFlags.Public | BindingFlags.Instance);
                        if (property != null && property.CanWrite)
                        {
                            try
                            {
                                var convertedValue = ConvertParameterValue(param.Value, property.PropertyType);
                                property.SetValue(instance, convertedValue);
                            }
                            catch (Exception ex)
                            {
                                result.Warnings.Add($"Failed to set property '{param.Key}': {ex.Message}");
                            }
                        }
                    }
                }

                result.Success = true;
                result.Instance = instance;
                result.Message = $"Successfully created instance of '{typeName}'";
                result.ExecutionTime = DateTime.UtcNow - result.StartTime;

                return result;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = $"Creation error: {ex.Message}";
                result.ExecutionTime = DateTime.UtcNow - result.StartTime;
                return result;
            }
        }

        #region Helper Methods

        private Task<Type> GetD365TypeAsync(string typeName)
        {
            if (_cachedTypes.ContainsKey(typeName))
                return Task.FromResult(_cachedTypes[typeName]);

            try
            {
                var assembly = Assembly.GetAssembly(typeof(AxTable));
                
                // Try exact match first
                var type = assembly.GetType(typeName);
                if (type != null)
                {
                    _cachedTypes[typeName] = type;
                    return Task.FromResult(type);
                }

                // Try with full namespace
                var fullTypeName = $"Microsoft.Dynamics.AX.Metadata.MetaModel.{typeName}";
                type = assembly.GetType(fullTypeName);
                if (type != null)
                {
                    _cachedTypes[typeName] = type;
                    return Task.FromResult(type);
                }

                // Search all types
                type = assembly.GetTypes().FirstOrDefault(t => t.Name == typeName);
                if (type != null)
                {
                    _cachedTypes[typeName] = type;
                    return Task.FromResult(type);
                }

                return Task.FromResult<Type>(null);
            }
            catch
            {
                return Task.FromResult<Type>(null);
            }
        }

        private Task<object> GetD365ObjectAsync(string objectType, string objectName)
        {
            try
            {
                if (_objectFactory == null)
                {
                    _logger?.Warning("Object factory not available for retrieving {ObjectType}:{ObjectName}", objectType, objectName);
                    return Task.FromResult<object>(null);
                }

                // Use the object factory's metadata provider to retrieve the object
                var result = _objectFactory.GetExistingObject(objectType, objectName);
                return Task.FromResult(result);
            }
            catch (Exception ex)
            {
                _logger?.Error(ex, "Failed to retrieve {ObjectType}:{ObjectName}", objectType, objectName);
                return Task.FromResult<object>(null);
            }
        }

        private bool IsModificationMethod(MethodInfo method)
        {
            var modificationPrefixes = new[] { "Add", "Insert", "Create", "Remove", "Delete", "Update", "Modify" };
            return modificationPrefixes.Any(prefix => method.Name.StartsWith(prefix));
        }

        private bool IsModifiableProperty(PropertyInfo property)
        {
            var modifiableProperties = new[] { "Fields", "Methods", "Relations", "Indexes", "FieldGroups", "Controls", "DataSources" };
            return modifiableProperties.Any(prop => property.Name.Contains(prop));
        }

        private bool IsCollectionType(Type type)
        {
            return type.Name.Contains("Collection") || type.Name.Contains("List") || 
                   type.GetInterfaces().Any(i => i.Name.Contains("Collection") || i.Name.Contains("Enumerable"));
        }

        private List<string> GetCollectionMethods(Type collectionType)
        {
            return collectionType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => new[] { "Add", "Remove", "Insert", "Clear", "Contains" }.Any(op => m.Name.StartsWith(op)))
                .Select(m => m.Name)
                .Distinct()
                .ToList();
        }

        private string GenerateMethodDescription(MethodInfo method)
        {
            var parameterTypes = string.Join(", ", method.GetParameters().Select(p => p.ParameterType.Name));
            return $"Modifies object by {method.Name.ToLower()}. Parameters: ({parameterTypes}) -> {method.ReturnType.Name}";
        }

        private string GenerateTypeDescription(Type type)
        {
            if (type.IsSubclassOf(typeof(AxTableField)))
                return $"D365 table field type for {type.Name.Replace("AxTableField", "").ToLower()} data";
            
            return $"D365 metadata type: {type.Name}";
        }

        private async Task<List<Models.TypeInfo>> DiscoverRelatedTypeConstructorsAsync(Type mainType)
        {
            var relatedTypes = new List<Models.TypeInfo>();
            
            if (mainType == typeof(AxTable))
            {
                // For tables, include field types
                relatedTypes.AddRange(await DiscoverFieldTypesAsync());
            }
            
            return relatedTypes;
        }

        private Task<object[]> PrepareMethodParametersAsync(MethodInfo method, Dictionary<string, object> providedParams)
        {
            var parameters = method.GetParameters();
            var parameterValues = new object[parameters.Length];

            for (int i = 0; i < parameters.Length; i++)
            {
                var param = parameters[i];
                if (providedParams.ContainsKey(param.Name))
                {
                    parameterValues[i] = ConvertParameterValue(providedParams[param.Name], param.ParameterType);
                }
                else if (param.IsOptional)
                {
                    parameterValues[i] = param.DefaultValue;
                }
                else
                {
                    // Try to create default instance for complex types
                    if (!param.ParameterType.IsValueType && param.ParameterType != typeof(string))
                    {
                        try
                        {
                            parameterValues[i] = Activator.CreateInstance(param.ParameterType);
                        }
                        catch
                        {
                            parameterValues[i] = null;
                        }
                    }
                    else
                    {
                        parameterValues[i] = GetDefaultValue(param.ParameterType);
                    }
                }
            }

            return Task.FromResult(parameterValues);
        }

        private object ConvertParameterValue(object value, Type targetType)
        {
            if (value == null) return null;
            if (targetType.IsAssignableFrom(value.GetType())) return value;

            try
            {
                return Convert.ChangeType(value, targetType);
            }
            catch
            {
                return GetDefaultValue(targetType);
            }
        }

        private object GetDefaultValue(Type type)
        {
            return type.IsValueType ? Activator.CreateInstance(type) : null;
        }

        private Task<Dictionary<string, object>> GetObjectStateInfoAsync(object obj)
        {
            var stateInfo = new Dictionary<string, object>();
            
            try
            {
                var type = obj.GetType();
                
                // Get collection counts
                var collections = type.GetProperties()
                    .Where(p => IsCollectionType(p.PropertyType))
                    .ToList();

                foreach (var collection in collections)
                {
                    try
                    {
                        var collectionValue = collection.GetValue(obj);
                        if (collectionValue != null)
                        {
                            var countProperty = collectionValue.GetType().GetProperty("Count");
                            if (countProperty != null)
                            {
                                stateInfo[$"{collection.Name}Count"] = countProperty.GetValue(collectionValue);
                            }
                        }
                    }
                    catch
                    {
                        // Ignore errors getting collection info
                    }
                }

                // Get key properties
                var keyProperties = new[] { "Name", "Label", "Description" };
                foreach (var propName in keyProperties)
                {
                    var prop = type.GetProperty(propName);
                    if (prop != null && prop.CanRead)
                    {
                        try
                        {
                            stateInfo[propName] = prop.GetValue(obj);
                        }
                        catch
                        {
                            // Ignore errors
                        }
                    }
                }
            }
            catch
            {
                // Return empty state info on any error
            }

            return Task.FromResult(stateInfo);
        }

        /// <summary>
        /// Discover available D365 types that can be instantiated and modified
        /// Uses reflection to find all Ax* types dynamically - no hardcoding
        /// </summary>
        public Task<List<Models.TypeInfo>> DiscoverAvailableTypesAsync()
        {
            try
            {
                var availableTypes = new List<Models.TypeInfo>();
                
                // Use the same assembly discovery approach as other working methods
                var assembly = Assembly.GetAssembly(typeof(AxTable));

                if (assembly != null)
                {
                    // Find all types that start with "Ax" and are in the MetaModel namespace
                    var d365Types = assembly.GetTypes()
                        .Where(t => t.Name.StartsWith("Ax") && 
                                   t.Namespace != null && 
                                   t.Namespace.Contains("MetaModel") &&
                                   !t.IsAbstract &&
                                   t.IsPublic &&
                                   HasModificationCapabilities(t))
                        .OrderBy(t => t.Name)
                        .ToArray();

                    foreach (var type in d365Types)
                    {
                        availableTypes.Add(new Models.TypeInfo
                        {
                            Name = type.Name,
                            FullName = type.FullName,
                            Description = $"D365 {type.Name} object type - supports creation and modification operations",
                            IsAbstract = type.IsAbstract,
                            BaseType = type.BaseType?.Name
                        });
                    }
                }

                return Task.FromResult(availableTypes);
            }
            catch
            {
                // Return empty list on error rather than throwing
                return Task.FromResult(new List<Models.TypeInfo>());
            }
        }

        /// <summary>
        /// Check if a type has modification capabilities (Add*, Create*, etc. methods)
        /// </summary>
        private bool HasModificationCapabilities(Type type)
        {
            try
            {
                var modificationMethods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => IsModificationMethod(m))
                    .ToArray();

                return modificationMethods.Length > 0;
            }
            catch
            {
                return false;
            }
        }

        private Type GetTypeFromCache(string typeName)
        {
            try
            {
                // Check cache first
                if (_cachedTypes.TryGetValue(typeName, out var cachedType))
                {
                    return cachedType;
                }

                // Try to find in loaded assemblies
                var assembly = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => a.GetName().Name.Contains("Microsoft.Dynamics.AX.Metadata"));

                if (assembly == null) return null;

                // Try with full namespace
                var fullTypeName = $"Microsoft.Dynamics.AX.Metadata.MetaModel.{typeName}";
                var type = assembly.GetType(fullTypeName);
                if (type != null)
                {
                    _cachedTypes[typeName] = type;
                    return type;
                }

                // Search all types
                type = assembly.GetTypes().FirstOrDefault(t => t.Name == typeName);
                if (type != null)
                {
                    _cachedTypes[typeName] = type;
                    return type;
                }

                return null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Execute a modification method on a specific D365 object
        /// Public interface for MCP tool integration
        /// </summary>
        public async Task<ObjectModificationResult> ExecuteObjectModificationAsync(string objectType, string objectName, string methodName, Dictionary<string, object> parameters)
        {
            var result = new ObjectModificationResult
            {
                ObjectType = objectType,
                ObjectName = objectName,
                MethodName = methodName,
                Success = false,
                StartTime = DateTime.UtcNow
            };

            try
            {
                // First, get the object to modify
                var targetObject = await GetD365ObjectAsync(objectType, objectName);
                if (targetObject == null)
                {
                    result.Error = $"Object '{objectName}' of type '{objectType}' not found";
                    return result;
                }

                // Get the type to find the method
                var type = targetObject.GetType();
                var method = type.GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance);
                
                if (method == null)
                {
                    result.Error = $"Method '{methodName}' not found on type '{objectType}'";
                    return result;
                }

                // Prepare method parameters - special handling for specific operations
                object[] methodParams;
                switch (methodName.ToLower())
                {
                    case "addfield":
                        methodParams = await PrepareAddFieldParametersAsync(method, parameters, targetObject);
                        break;
                    case "addmethod":
                        methodParams = await PrepareAddMethodParametersAsync(method, parameters, targetObject);
                        break;
                    default:
                        methodParams = await PrepareMethodParametersAsync(method, parameters);
                        break;
                }
                
                _logger.Information("Prepared method parameters for {MethodName}: {ParameterCount} parameters", methodName, methodParams?.Length ?? 0);
                if (methodParams != null)
                {
                    for (int i = 0; i < methodParams.Length; i++)
                    {
                        var param = methodParams[i];
                        _logger.Information("Parameter {Index}: Type={Type}, Value={Value}", i, param?.GetType().Name ?? "null", param?.ToString() ?? "null");
                    }
                }

                // Execute the method
                try
                {
                    var returnValue = method.Invoke(targetObject, methodParams);

                    // CRITICAL: Save the modified object back to the metadata store
                    // This is essential for persisting changes!
                    var saveSuccess = await SaveModifiedObjectAsync(objectType, objectName, targetObject);
                    
                    result.Success = true;
                    result.ReturnValue = returnValue?.ToString();
                    result.ReturnType = method.ReturnType.Name;
                    
                    if (saveSuccess)
                    {
                        result.Message = $"Successfully executed {methodName} on {objectType}:{objectName} and saved changes to metadata store";
                    }
                    else
                    {
                        result.Message = $"Successfully executed {methodName} on {objectType}:{objectName} but failed to save changes to metadata store";
                        _logger.Warning("Method execution succeeded but save failed for {ObjectType}:{ObjectName}", objectType, objectName);
                    }
                    
                    result.ExecutionTime = DateTime.UtcNow - result.StartTime;

                    return result;
                }
                catch (TargetInvocationException tex)
                {
                    // TargetInvocationException wraps the actual exception
                    var actualException = tex.InnerException ?? tex;
                    _logger.Error(actualException, "Method invocation failed for {MethodName} on {ObjectType}:{ObjectName}", methodName, objectType, objectName);
                    
                    result.Success = false;
                    result.Error = $"Method execution error: {actualException.GetType().Name}: {actualException.Message}";
                    result.ExecutionTime = DateTime.UtcNow - result.StartTime;
                    return result;
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "General error in ExecuteObjectModificationAsync for {MethodName} on {ObjectType}:{ObjectName}", methodName, objectType, objectName);
                result.Success = false;
                result.Error = $"Execution error: {ex.Message}";
                result.ExecutionTime = DateTime.UtcNow - result.StartTime;
                return result;
            }
        }

        /// <summary>
        /// Prepare parameters specifically for AddField method
        /// </summary>
        private async Task<object[]> PrepareAddFieldParametersAsync(MethodInfo method, Dictionary<string, object> parameters, object targetTable)
        {
            try
            {
                // Get the field name and type from parameters
                var fieldName = parameters.ContainsKey("fieldName") ? parameters["fieldName"]?.ToString() : null;
                var fieldType = parameters.ContainsKey("fieldType") ? parameters["fieldType"]?.ToString() : "String";

                if (string.IsNullOrEmpty(fieldName))
                {
                    throw new ArgumentException("fieldName is required for AddField method");
                }

                _logger.Information("Creating field object: Name={FieldName}, Type={FieldType}", fieldName, fieldType);

                // Create the appropriate field type based on fieldType parameter
                object fieldObject = null;
                switch (fieldType.ToLower())
                {
                    case "string":
                        fieldObject = CreateStringField(fieldName);
                        break;
                    case "int":
                    case "integer":
                        fieldObject = CreateIntField(fieldName);
                        break;
                    case "real":
                    case "decimal":
                        fieldObject = CreateRealField(fieldName);
                        break;
                    default:
                        fieldObject = CreateStringField(fieldName); // Default to string
                        break;
                }

                if (fieldObject == null)
                {
                    throw new InvalidOperationException($"Failed to create field object for type '{fieldType}'");
                }

                _logger.Information("Successfully created field object: {FieldObjectType}", fieldObject.GetType().Name);
                return new object[] { fieldObject };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error preparing AddField parameters");
                throw;
            }
        }

        /// <summary>
        /// Create a string field object
        /// </summary>
        private object CreateStringField(string fieldName)
        {
            try
            {
                // Use reflection to create AxTableFieldString
                var stringFieldType = _objectFactory.GetAxType("AxTableFieldString");
                if (stringFieldType == null)
                {
                    throw new InvalidOperationException("AxTableFieldString type not found");
                }

                var fieldObject = Activator.CreateInstance(stringFieldType);
                
                // Set the Name property
                var nameProperty = stringFieldType.GetProperty("Name");
                nameProperty?.SetValue(fieldObject, fieldName);

                return fieldObject;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error creating string field {FieldName}", fieldName);
                throw;
            }
        }

        /// <summary>
        /// Create an integer field object
        /// </summary>
        private object CreateIntField(string fieldName)
        {
            try
            {
                var intFieldType = _objectFactory.GetAxType("AxTableFieldInt");
                if (intFieldType == null)
                {
                    throw new InvalidOperationException("AxTableFieldInt type not found");
                }

                var fieldObject = Activator.CreateInstance(intFieldType);
                
                var nameProperty = intFieldType.GetProperty("Name");
                nameProperty?.SetValue(fieldObject, fieldName);

                return fieldObject;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error creating int field {FieldName}", fieldName);
                throw;
            }
        }

        /// <summary>
        /// Create a real field object
        /// </summary>
        private object CreateRealField(string fieldName)
        {
            try
            {
                var realFieldType = _objectFactory.GetAxType("AxTableFieldReal");
                if (realFieldType == null)
                {
                    throw new InvalidOperationException("AxTableFieldReal type not found");
                }

                var fieldObject = Activator.CreateInstance(realFieldType);
                
                var nameProperty = realFieldType.GetProperty("Name");
                nameProperty?.SetValue(fieldObject, fieldName);

                return fieldObject;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error creating real field {FieldName}", fieldName);
                throw;
            }
        }

        /// <summary>
        /// Prepare parameters specifically for AddMethod method
        /// </summary>
        private async Task<object[]> PrepareAddMethodParametersAsync(MethodInfo method, Dictionary<string, object> parameters, object targetClass)
        {
            try
            {
                // Get method parameters
                var methodName = parameters.ContainsKey("methodName") ? parameters["methodName"]?.ToString() : null;
                var returnType = parameters.ContainsKey("returnType") ? parameters["returnType"]?.ToString() : "void";
                var accessLevel = parameters.ContainsKey("accessLevel") ? parameters["accessLevel"]?.ToString() : "public";
                var isStatic = parameters.ContainsKey("isStatic") ? Convert.ToBoolean(parameters["isStatic"]) : false;
                var source = parameters.ContainsKey("source") ? parameters["source"]?.ToString() : "";

                if (string.IsNullOrEmpty(methodName))
                {
                    throw new ArgumentException("methodName is required for AddMethod method");
                }

                _logger.Information("Creating method object: Name={MethodName}, ReturnType={ReturnType}, AccessLevel={AccessLevel}, IsStatic={IsStatic}", 
                    methodName, returnType, accessLevel, isStatic);

                // Create the AxMethod object
                var methodObject = CreateMethodObject(methodName, returnType, accessLevel, isStatic, source);

                if (methodObject == null)
                {
                    throw new InvalidOperationException($"Failed to create method object for '{methodName}'");
                }

                _logger.Information("Successfully created method object: {MethodObjectType}", methodObject.GetType().Name);
                return new object[] { methodObject };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error preparing AddMethod parameters");
                throw;
            }
        }

        /// <summary>
        /// Create an AxMethod object
        /// </summary>
        private object CreateMethodObject(string methodName, string returnType, string accessLevel, bool isStatic, string source)
        {
            try
            {
                // Use reflection to create AxMethod
                var methodType = _objectFactory.GetAxType("AxMethod");
                if (methodType == null)
                {
                    throw new InvalidOperationException("AxMethod type not found");
                }

                var methodObject = Activator.CreateInstance(methodType);
                
                // Set basic properties
                var nameProperty = methodType.GetProperty("Name");
                nameProperty?.SetValue(methodObject, methodName);

                // Set source code - AGENT MUST PROVIDE X++ SOURCE
                var sourceProperty = methodType.GetProperty("Source");
                if (sourceProperty != null)
                {
                    if (string.IsNullOrEmpty(source))
                    {
                        throw new ArgumentException("source parameter is required - agent must provide X++ method source code");
                    }
                    sourceProperty.SetValue(methodObject, source);
                }

                // Set access level if property exists
                var accessProperty = methodType.GetProperty("AccessLevel");
                if (accessProperty != null)
                {
                    // Try to convert string to enum
                    var accessType = accessProperty.PropertyType;
                    if (accessType.IsEnum)
                    {
                        try
                        {
                            var accessValue = Enum.Parse(accessType, accessLevel, true);
                            accessProperty.SetValue(methodObject, accessValue);
                        }
                        catch (Exception ex)
                        {
                            _logger.Warning(ex, "Failed to set access level {AccessLevel}, using default", accessLevel);
                        }
                    }
                }

                // Set static flag if property exists
                var staticProperty = methodType.GetProperty("IsStatic");
                staticProperty?.SetValue(methodObject, isStatic);

                // Set return type if property exists
                var returnTypeProperty = methodType.GetProperty("ReturnType");
                if (returnTypeProperty != null)
                {
                    // Try to create return type object
                    var returnTypeObject = CreateReturnTypeObject(returnType);
                    if (returnTypeObject != null)
                    {
                        returnTypeProperty.SetValue(methodObject, returnTypeObject);
                    }
                }

                return methodObject;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error creating method object {MethodName}", methodName);
                throw;
            }
        }

        // REMOVED: GenerateDefaultMethodSource method
        // PRINCIPLE: Agent must provide ALL X++ source code - NO hardcoding allowed

        /// <summary>
        /// Create a return type object for methods
        /// </summary>
        private object CreateReturnTypeObject(string returnType)
        {
            try
            {
                var returnTypeType = _objectFactory.GetAxType("AxMethodReturnType");
                if (returnTypeType == null)
                {
                    _logger.Warning("AxMethodReturnType type not found, skipping return type creation");
                    return null;
                }

                var returnTypeObject = Activator.CreateInstance(returnTypeType);
                
                // Set type name property
                var typeProperty = returnTypeType.GetProperty("Type");
                typeProperty?.SetValue(returnTypeObject, returnType);

                return returnTypeObject;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to create return type object for {ReturnType}", returnType);
                return null;
            }
        }

        /// <summary>
        /// Save a modified object back to the metadata store
        /// </summary>
        private async Task<bool> SaveModifiedObjectAsync(string objectType, string objectName, object modifiedObject)
        {
            try
            {
                _logger.Information("Saving modified object: {ObjectType}:{ObjectName}", objectType, objectName);
                
                // Use the D365ObjectFactory to save the object
                var saveResult = await _objectFactory.SaveObjectAsync(objectType, objectName, modifiedObject);
                
                if (saveResult)
                {
                    _logger.Information("Successfully saved {ObjectType}:{ObjectName} to metadata store", objectType, objectName);
                    return true;
                }
                else
                {
                    _logger.Warning("Failed to save {ObjectType}:{ObjectName} to metadata store", objectType, objectName);
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error saving modified object {ObjectType}:{ObjectName}", objectType, objectName);
                return false; // Don't throw, just return false to indicate failure
            }
        }

        #endregion
    }
}
