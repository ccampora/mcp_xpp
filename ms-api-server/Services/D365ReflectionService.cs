using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using D365MetadataService.Models;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Reflection-based service that discovers and exposes D365 metadata API capabilities in real-time
    /// No hardcoded abstractions - everything is discovered through reflection
    /// </summary>
    public class D365ReflectionService
    {
        private readonly D365ObjectFactory _objectFactory;
        private readonly D365ReflectionManager _reflectionManager;
        private readonly Serilog.ILogger _logger;

        public D365ReflectionService(D365ObjectFactory objectFactory, D365ReflectionManager reflectionManager)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
            _reflectionManager = reflectionManager ?? throw new ArgumentNullException(nameof(reflectionManager));
            _logger = Serilog.Log.ForContext<D365ReflectionService>();
        }



        /// <summary>
        /// Discovers all modification capabilities for a specific D365 object type
        /// REFACTORED: Now uses centralized D365ReflectionManager
        /// </summary>
        public async Task<ObjectCapabilities> DiscoverModificationCapabilitiesAsync(string objectTypeName)
        {
            // Delegate to centralized reflection manager
            var capabilities = _reflectionManager.DiscoverModificationCapabilities(objectTypeName);
            
            // Add any additional processing specific to this service if needed
            if (capabilities.Success)
            {
                // Add parameter creation requirements for advanced scenarios
                foreach (var method in capabilities.ModificationMethods)
                {
                    if (method.Parameters?.Any() == true)
                    {
                        // Get the actual method from reflection manager and analyze parameters
                        var d365Type = _reflectionManager.GetD365Type(objectTypeName);
                        var methodInfo = d365Type?.GetMethod(method.Name);
                        if (methodInfo != null)
                        {
                            method.ParameterCreationRequirements = await AnalyzeParameterCreationRequirementsAsync(methodInfo);
                        }
                    }
                }

                // Add related type constructors and inheritance hierarchy for complex scenarios
                var objectType = _reflectionManager.GetD365Type(objectTypeName);
                if (objectType != null)
                {
                    capabilities.RelatedTypeConstructors = _reflectionManager.DiscoverRelatedTypeConstructors(objectType);
                    capabilities.InheritanceHierarchy = _reflectionManager.BuildInheritanceHierarchy(objectType);
                }
            }

            return capabilities;
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

                // Prepare parameters using the new requirements-based approach
                var parameters = await PrepareParametersAsync(method, methodCall.Parameters, targetObject);
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
                result.UpdatedObjectInfo = _reflectionManager.GetObjectStateInfo(targetObject);

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
            // 🚀 REFACTORED: Use centralized reflection manager
            var type = _reflectionManager.GetD365Type(typeName);
            return Task.FromResult(type);
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
            // Use actual method metadata instead of hardcoded prefixes
            // Check for methods that modify object state (non-readonly, void or return modified objects)
            
            // INCLUDE property setters - they are modification methods!
            if (method.IsPublic && !method.IsStatic && method.Name.StartsWith("set_") && method.GetParameters().Length == 1)
            {
                return true; // Property setters are modification methods
            }
            
            // Other modification methods (exclude getters but include setters)
            return method.IsPublic && 
                   !method.IsStatic && 
                   !method.IsSpecialName && 
                   !method.Name.StartsWith("get_") && 
                   method.GetParameters().Length > 0; // Methods that take parameters are likely modification methods
        }

        private bool IsCollectionType(Type type)
        {
            // Exclude strings from being treated as collections (even though they implement IEnumerable<char>)
            if (type == typeof(string))
                return false;
                
            // Use proper type hierarchy checking instead of name matching
            return typeof(System.Collections.ICollection).IsAssignableFrom(type) ||
                   typeof(System.Collections.IEnumerable).IsAssignableFrom(type) ||
                   (type.IsGenericType && 
                    (type.GetGenericTypeDefinition() == typeof(ICollection<>) ||
                     type.GetGenericTypeDefinition() == typeof(IList<>) ||
                     type.GetGenericTypeDefinition() == typeof(IEnumerable<>)));
        }







        /// <summary>
        /// Analyze what parameters are required to create objects for a method's parameters
        /// This tells the user exactly what they need to provide
        /// </summary>
        private async Task<List<ParameterCreationRequirement>> AnalyzeParameterCreationRequirementsAsync(MethodInfo method)
        {
            var requirements = new List<ParameterCreationRequirement>();
            
            foreach (var param in method.GetParameters())
            {
                var requirement = new ParameterCreationRequirement
                {
                    ParameterName = param.Name,
                    ParameterType = param.ParameterType.Name,
                    ParameterTypeFullName = param.ParameterType.FullName,
                    IsRequired = !param.IsOptional
                };

                // For D365 objects (Ax* types), analyze what properties need to be set
                if (param.ParameterType.Name.StartsWith("Ax"))
                {
                    requirement.RequiredProperties = await AnalyzeD365ObjectPropertiesAsync(param.ParameterType);
                    requirement.CreationInstructions = $"Create {param.ParameterType.Name} object with the specified properties";
                }
                else if (param.ParameterType.IsValueType || param.ParameterType == typeof(string))
                {
                    // For simple types, specify the type and add special note for property setters
                    if (method.Name.StartsWith("set_") && param.Name == "value")
                    {
                        var propertyName = method.Name.Substring(4); // Remove "set_" prefix
                        requirement.CreationInstructions = $"Provide {param.ParameterType.Name} value for {propertyName} property (parameter name: '{param.Name}')";
                        
                        // For enums, add the possible values
                        if (param.ParameterType.IsEnum)
                        {
                            var enumValues = Enum.GetNames(param.ParameterType);
                            requirement.CreationInstructions += $". Possible values: {string.Join(", ", enumValues)}";
                        }
                    }
                    else
                    {
                        requirement.CreationInstructions = $"Provide {param.ParameterType.Name} value";
                    }
                }
                else
                {
                    requirement.CreationInstructions = $"Create instance of {param.ParameterType.Name}";
                }

                requirements.Add(requirement);
            }

            return requirements;
        }

        /// <summary>
        /// Analyze what properties of a D365 object type typically need to be set
        /// </summary>
        private Task<List<PropertyRequirement>> AnalyzeD365ObjectPropertiesAsync(Type d365Type)
        {
            var propertyRequirements = new List<PropertyRequirement>();
            
            try
            {
                var properties = d365Type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => p.CanWrite)
                    .ToArray();

                foreach (var property in properties)
                {
                    // Determine if this property is commonly required based on its name and type
                    var isRequired = IsPropertyLikelyRequired(property);
                    var expectedParamName = GenerateExpectedParameterName(property, d365Type);

                    propertyRequirements.Add(new PropertyRequirement
                    {
                        PropertyName = property.Name,
                        PropertyType = property.PropertyType.Name,
                        IsRequired = isRequired,
                        ExpectedParameterName = expectedParamName,
                        Description = GeneratePropertyDescription(property)
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to analyze properties for {TypeName}", d365Type.Name);
            }

            return Task.FromResult(propertyRequirements);
        }

        /// <summary>
        /// Determine if a property is required - NO HARDCODED PATTERNS
        /// Uses actual reflection to check if property has required attributes or constraints
        /// </summary>
        private bool IsPropertyLikelyRequired(PropertyInfo property)
        {
            // Check for Required attributes or other indicators of required properties
            var hasRequiredAttribute = property.GetCustomAttributes(typeof(System.ComponentModel.DataAnnotations.RequiredAttribute), false).Any();
            if (hasRequiredAttribute) return true;

            // Check if it's a non-nullable value type (likely required)
            if (property.PropertyType.IsValueType && Nullable.GetUnderlyingType(property.PropertyType) == null)
            {
                return true;
            }

            // For everything else, assume optional unless proven otherwise
            return false;
        }

        /// <summary>
        /// Generate expected parameter name from property name - CONTEXT AWARE
        /// For object property setting during creation, returns the property name
        /// For direct setter method calls, would return "value" but this is handled elsewhere
        /// </summary>
        private string GenerateExpectedParameterName(PropertyInfo property, Type objectType = null)
        {
            // For object creation and property setting, we use the actual property name
            // The "value" parameter is only used when calling setter methods directly via ExecuteMethodAsync
            // which is handled separately in method parameter processing
            return property.Name;
        }

        /// <summary>
        /// Generate description for a property - NO HARDCODED PATTERNS
        /// Uses actual property metadata and attributes to generate descriptions
        /// </summary>
        private string GeneratePropertyDescription(PropertyInfo property)
        {
            var type = property.PropertyType.Name;

            // Check for actual Description attributes first
            var descriptionAttr = property.GetCustomAttribute<System.ComponentModel.DescriptionAttribute>();
            if (descriptionAttr != null)
            {
                return $"{descriptionAttr.Description} ({type})";
            }

            // Check for Display attributes
            var displayAttr = property.GetCustomAttribute<System.ComponentModel.DisplayNameAttribute>();
            if (displayAttr != null)
            {
                return $"{displayAttr.DisplayName} ({type})";
            }

            // Generic description based on actual property name and type
            return $"Property {property.Name} of type {type}";
        }

        /// <summary>
        /// Determine concrete type from provided parameters using intelligent analysis
        /// </summary>
        private Type DetermineConcreteTypeFromParameters(Type abstractType, Dictionary<string, object> providedParams)
        {
            _logger.Information("Determining concrete type for abstract type {AbstractType}", abstractType.Name);

            // GENERIC LOGIC: Check for concreteType parameter first (works for ALL abstract types)
            if (providedParams.ContainsKey("concreteType"))
            {
                var concreteTypeName = providedParams["concreteType"]?.ToString();
                _logger.Information("Found concreteType parameter: {ConcreteType}", concreteTypeName);

                var typeAssembly = Assembly.GetAssembly(abstractType);
                var targetType = typeAssembly.GetTypes()
                    .FirstOrDefault(t => t.Name == concreteTypeName && 
                                        (t.IsSubclassOf(abstractType) || abstractType.IsAssignableFrom(t)) &&
                                        !t.IsAbstract && 
                                        t.IsPublic);
                
                if (targetType != null)
                {
                    _logger.Information("Using exact concrete type from parameter: {ConcreteType}", targetType.Name);
                    return targetType;
                }
                
                _logger.Warning("Concrete type '{ConcreteType}' specified in parameters not found or not compatible with {AbstractType}", 
                    concreteTypeName, abstractType.Name);
            }

            // FALLBACK: Find available concrete types
            var assembly = Assembly.GetAssembly(abstractType);
            var concreteTypes = assembly.GetTypes()
                .Where(t => (t.IsSubclassOf(abstractType) || abstractType.IsAssignableFrom(t)) && 
                           !t.IsAbstract && 
                           t.IsPublic &&
                           t != abstractType)
                .ToArray();

            if (concreteTypes.Length > 0)
            {
                _logger.Information("Found {Count} concrete types for {AbstractType}, using first: {ConcreteType}", 
                    concreteTypes.Length, abstractType.Name, concreteTypes[0].Name);
                return concreteTypes[0];
            }

            _logger.Warning("No concrete types found for abstract type {AbstractType}", abstractType.Name);
            return null;
        }



        /// <summary>
        /// General-purpose parameter preparation using explicit parameter requirements
        /// No fuzzy matching - uses exact parameter specifications from capabilities discovery
        /// </summary>
        private async Task<object[]> PrepareParametersAsync(MethodInfo method, Dictionary<string, object> providedParams, object targetObject = null)
        {
            var parameters = method.GetParameters();
            var parameterValues = new object[parameters.Length];

            _logger.Information("Preparing parameters for method {MethodName} with {ParameterCount} parameters", method.Name, parameters.Length);

            // Get the parameter requirements for this method
            var requirements = await AnalyzeParameterCreationRequirementsAsync(method);

            for (int i = 0; i < parameters.Length; i++)
            {
                var param = parameters[i];
                var requirement = requirements.FirstOrDefault(r => r.ParameterName == param.Name);
                
                _logger.Information("Preparing parameter {Index}: {Name} of type {Type}", i, param.Name, param.ParameterType.Name);
                _logger.Information("Available provided parameters: {ProvidedParams}", string.Join(", ", providedParams.Keys));
                _logger.Information("Looking for parameter with name: {ParamName}", param.Name);

                try
                {
                    parameterValues[i] = await CreateParameterUsingRequirementsAsync(param, requirement, providedParams);
                    _logger.Information("Successfully prepared parameter {Name}: {Value}", param.Name, parameterValues[i]?.GetType().Name ?? "null");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Failed to prepare parameter {Name} of type {Type}", param.Name, param.ParameterType.Name);
                    
                    // Try fallback approaches
                    if (param.IsOptional)
                    {
                        parameterValues[i] = param.DefaultValue;
                    }
                    else
                    {
                        parameterValues[i] = GetDefaultValue(param.ParameterType);
                    }
                }
            }

            return parameterValues;
        }

        /// <summary>
        /// Create a parameter object using explicit requirements - no guessing
        /// </summary>
        private async Task<object> CreateParameterUsingRequirementsAsync(
            System.Reflection.ParameterInfo param, 
            ParameterCreationRequirement requirement, 
            Dictionary<string, object> providedParams)
        {
            // Handle primitive types directly
            if (param.ParameterType.IsValueType || param.ParameterType == typeof(string))
            {
                // Look for direct parameter match first
                if (providedParams.ContainsKey(param.Name))
                {
                    _logger.Information("Found parameter {ParamName} in provided params with value: {Value}", param.Name, providedParams[param.Name]);
                    return ConvertParameterValue(providedParams[param.Name], param.ParameterType);
                }
                
                _logger.Warning("Parameter {ParamName} not found in provided params, using default value", param.Name);
                return GetDefaultValue(param.ParameterType);
            }

            // Handle D365 objects using explicit property requirements
            if (param.ParameterType.Name.StartsWith("Ax"))
            {
                return await CreateD365ObjectUsingRequirementsAsync(param.ParameterType, requirement, providedParams);
            }

            // Handle other complex types
            try
            {
                return Activator.CreateInstance(param.ParameterType);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Create D365 objects using explicit property requirements - no fuzzy matching
        /// </summary>
        private Task<object> CreateD365ObjectUsingRequirementsAsync(
            Type objectType, 
            ParameterCreationRequirement requirement, 
            Dictionary<string, object> providedParams)
        {
            _logger.Information("Creating D365 object {TypeName} using explicit requirements", objectType.Name);
            _logger.Information("Provided parameters: {Parameters}", string.Join(", ", providedParams.Keys));
            
            if (requirement != null)
            {
                _logger.Information("Requirement specifies {PropertyCount} properties for {ParameterType}", 
                    requirement.RequiredProperties?.Count ?? 0, requirement.ParameterType);
            }

            // If the type is abstract, try to determine concrete type from provided parameters
            _logger.Information("Type check: {TypeName} - IsAbstract: {IsAbstract}, IsInterface: {IsInterface}, IsClass: {IsClass}", 
                objectType.Name, objectType.IsAbstract, objectType.IsInterface, objectType.IsClass);
                
            if (objectType.IsAbstract)
            {
                _logger.Information("Type {TypeName} is abstract, determining concrete type", objectType.Name);
                var concreteType = DetermineConcreteTypeFromParameters(objectType, providedParams);
                if (concreteType != null)
                {
                    objectType = concreteType;
                    _logger.Information("Resolved abstract type to concrete type: {ConcreteType}", objectType.Name);
                }
                else
                {
                    _logger.Warning("Cannot create abstract type {AbstractType} and no concrete type could be determined", objectType.Name);
                    return Task.FromResult<object>(null);
                }
            }
            else
            {
                _logger.Information("Type {TypeName} is concrete, proceeding with direct instantiation", objectType.Name);
            }

            var instance = Activator.CreateInstance(objectType);
            
            if (requirement?.RequiredProperties != null)
            {
                _logger.Information("Processing {PropertyCount} property requirements", requirement.RequiredProperties.Count);
                
                foreach (var propReq in requirement.RequiredProperties)
                {
                    _logger.Information("Checking property requirement: {PropertyName} -> {ExpectedParameter}", 
                        propReq.PropertyName, propReq.ExpectedParameterName);
                        
                    var property = objectType.GetProperty(propReq.PropertyName, BindingFlags.Public | BindingFlags.Instance);
                    if (property != null && property.CanWrite)
                    {
                        // Look for the expected parameter name
                        if (providedParams.ContainsKey(propReq.ExpectedParameterName))
                        {
                            var value = ConvertParameterValue(providedParams[propReq.ExpectedParameterName], property.PropertyType);
                            property.SetValue(instance, value);
                            _logger.Information("✅ Set property {PropertyName} = {Value} from parameter {ParameterName}", 
                                propReq.PropertyName, value, propReq.ExpectedParameterName);
                        }
                        else if (propReq.IsRequired)
                        {
                            _logger.Warning("❌ Required property {PropertyName} could not be set - parameter {ParameterName} not provided", 
                                propReq.PropertyName, propReq.ExpectedParameterName);
                        }
                        else
                        {
                            _logger.Information("⚪ Optional property {PropertyName} skipped - parameter {ParameterName} not provided", 
                                propReq.PropertyName, propReq.ExpectedParameterName);
                        }
                    }
                    else
                    {
                        _logger.Warning("⚠️ Property {PropertyName} not found or not writable on {TypeName}", 
                            propReq.PropertyName, objectType.Name);
                    }
                }
            }
            else
            {
                _logger.Warning("⚠️ No property requirements provided for {TypeName}", objectType.Name);
            }

            _logger.Information("✅ Created D365 object: {TypeName}", objectType.Name);
            return Task.FromResult(instance);
        }

        private object ConvertParameterValue(object value, Type targetType)
        {
            if (value == null) return null;
            if (targetType.IsAssignableFrom(value.GetType())) return value;

            // Special handling for enums
            if (targetType.IsEnum)
            {
                try
                {
                    // Try parsing as string first
                    if (value is string stringValue)
                    {
                        _logger.Information("Converting string '{StringValue}' to enum {EnumType}", stringValue, targetType.Name);
                        var enumValue = Enum.Parse(targetType, stringValue, true);
                        _logger.Information("Successfully converted string to enum: {EnumValue}", enumValue);
                        return enumValue;
                    }
                    
                    // Try parsing as integer
                    if (value is int intValue || value is long longValue)
                    {
                        var enumIntValue = Convert.ToInt32(value);
                        _logger.Information("Converting integer {IntValue} to enum {EnumType}", enumIntValue, targetType.Name);
                        
                        if (Enum.IsDefined(targetType, enumIntValue))
                        {
                            var enumValue = Enum.ToObject(targetType, enumIntValue);
                            _logger.Information("Successfully converted integer to enum: {EnumValue}", enumValue);
                            return enumValue;
                        }
                        else
                        {
                            _logger.Warning("Integer value {IntValue} is not valid for enum {EnumType}", enumIntValue, targetType.Name);
                        }
                    }
                    
                    // Try direct conversion
                    var convertedEnum = Enum.ToObject(targetType, value);
                    _logger.Information("Successfully converted {Value} to enum: {EnumValue}", value, convertedEnum);
                    return convertedEnum;
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Failed to convert {Value} to enum {EnumType}, using default", value, targetType.Name);
                    return GetDefaultValue(targetType);
                }
            }

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



        /// <summary>
        /// Discover available D365 types that can be instantiated and modified
        /// Uses reflection to find all Ax* types dynamically - no hardcoding
        /// </summary>
        public Task<List<Models.TypeInfo>> DiscoverAvailableTypesAsync()
        {
            try
            {
                // 🚀 REFACTORED: Use centralized reflection manager
                var supportedTypes = _reflectionManager.GetSupportedObjectTypes();
                
                var availableTypes = supportedTypes.Select(typeName =>
                {
                    var type = _reflectionManager.GetD365Type(typeName);
                    return new Models.TypeInfo
                    {
                        Name = typeName,
                        FullName = type?.FullName ?? $"Microsoft.Dynamics.AX.Metadata.MetaModel.{typeName}",
                        Description = $"D365 {typeName} object type - supports creation and modification operations",
                        IsAbstract = type?.IsAbstract ?? false,
                        BaseType = type?.BaseType?.Name ?? "MetadataNode"
                    };
                }).ToList();

                return Task.FromResult(availableTypes);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Error discovering available types");
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
            // 🚀 REFACTORED: Use centralized reflection manager
            return _reflectionManager.GetD365Type(typeName);
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

                // Prepare method parameters using general reflection-based approach
                object[] methodParams = await PrepareParametersAsync(method, parameters, targetObject);
                
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
