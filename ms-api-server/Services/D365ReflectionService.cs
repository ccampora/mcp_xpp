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
                
                // Fallback: if method not found and name starts with "Add", try collection-add pattern
                // e.g. "AddEntryPoint" -> find "EntryPoints" collection property and call its Add method
                if (method == null && methodCall.MethodName.StartsWith("Add"))
                {
                    var addResult = await TryCollectionAddFallbackAsync(targetObject, methodCall);
                    if (addResult != null)
                    {
                        return addResult;
                    }
                }
                
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
        /// Finds a collection property on the given type that matches an "Add{ItemName}" method name.
        /// For example, "AddEntryPoint" will look for properties named "EntryPoints", "EntryPoint", etc.
        /// Returns null if no match is found.
        /// </summary>
        private PropertyInfo FindCollectionPropertyForAddMethod(Type objectType, string addMethodName)
        {
            if (!addMethodName.StartsWith("Add") || addMethodName.Length <= 3)
                return null;

            var itemName = addMethodName.Substring(3);

            var candidateNames = new List<string>
            {
                itemName + "s",
                itemName + "es",
                itemName,
                itemName + "Collection",
                itemName + "Permissions",
            };

            foreach (var candidate in candidateNames)
            {
                var prop = objectType.GetProperty(candidate, BindingFlags.Public | BindingFlags.Instance);
                if (prop != null)
                    return prop;
            }

            // Broader suffix-based search
            return objectType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(p =>
                    p.Name.EndsWith(itemName + "s", StringComparison.OrdinalIgnoreCase) ||
                    p.Name.EndsWith(itemName, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Fallback for method calls like "AddEntryPoint" on objects that don't have that method directly.
        /// Resolves the collection property (e.g., "EntryPoints") and calls its Add method
        /// with a newly created item populated from the provided parameters.
        /// </summary>
        private async Task<DynamicExecutionResult> TryCollectionAddFallbackAsync(object targetObject, DynamicMethodCall methodCall)
        {
            var result = new DynamicExecutionResult
            {
                MethodName = methodCall.MethodName,
                ObjectName = methodCall.ObjectName,
                StartTime = DateTime.UtcNow
            };

            try
            {
                var objectType = targetObject.GetType();

                // Use shared helper to find the matching collection property
                var collectionProperty = FindCollectionPropertyForAddMethod(objectType, methodCall.MethodName);

                if (collectionProperty == null)
                {
                    _logger.Warning("No collection property found for {MethodName} on {ObjectType}", methodCall.MethodName, objectType.Name);
                    return null; // Signal to caller that fallback did not match
                }

                _logger.Information("Found collection property '{PropertyName}' for {MethodName}", collectionProperty.Name, methodCall.MethodName);

                // Get the collection instance
                var collection = collectionProperty.GetValue(targetObject);
                if (collection == null)
                {
                    _logger.Warning("Collection property '{PropertyName}' is null on {ObjectType}", collectionProperty.Name, objectType.Name);
                    return null;
                }

                // Determine the item type from the collection's Add method or generic type argument
                var collectionType = collection.GetType();
                var addMethods = collectionType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.Name == "Add" && m.GetParameters().Length == 1)
                    .ToList();

                if (addMethods.Count == 0)
                {
                    _logger.Warning("No Add method found on collection type {CollectionType}", collectionType.Name);
                    return null;
                }

                // Determine the concrete type for the item to add
                Type itemType = null;

                // Check for explicit concreteType parameter
                if (methodCall.Parameters.ContainsKey("concreteType"))
                {
                    var concreteTypeName = methodCall.Parameters["concreteType"]?.ToString();
                    itemType = _reflectionManager.GetD365Type(concreteTypeName);
                    if (itemType != null)
                    {
                        _logger.Information("Using explicit concreteType: {ConcreteType}", itemType.Name);
                    }
                }

                // Fallback: use the Add method's parameter type
                if (itemType == null)
                {
                    var addMethodParamType = addMethods[0].GetParameters()[0].ParameterType;
                    if (!addMethodParamType.IsAbstract)
                    {
                        itemType = addMethodParamType;
                    }
                    else
                    {
                        _logger.Warning("Add method parameter type {ParamType} is abstract and no concreteType specified", addMethodParamType.Name);
                        result.Success = false;
                        result.Error = $"Cannot add item to collection '{collectionProperty.Name}': the item type " +
                                       $"'{addMethodParamType.Name}' is abstract. Specify 'concreteType' parameter with the exact type name.";
                        return result;
                    }
                }

                // Create the item instance
                var newItem = Activator.CreateInstance(itemType);
                _logger.Information("Created instance of {ItemType}", itemType.Name);

                // Set properties from provided parameters (excluding concreteType)
                var propsToSkip = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "concreteType" };
                foreach (var kvp in methodCall.Parameters)
                {
                    if (propsToSkip.Contains(kvp.Key)) continue;

                    // Skip collection/array values - these are handled by PopulateChildCollections
                    if (kvp.Value is Newtonsoft.Json.Linq.JArray || 
                        (kvp.Value is System.Collections.IEnumerable && !(kvp.Value is string)))
                    {
                        _logger.Information("Deferring collection parameter '{PropName}' to PopulateChildCollections", kvp.Key);
                        continue;
                    }

                    var prop = itemType.GetProperty(kvp.Key, BindingFlags.Public | BindingFlags.Instance);
                    if (prop != null && prop.CanWrite)
                    {
                        try
                        {
                            var converted = ConvertParameterValue(kvp.Value, prop.PropertyType);
                            prop.SetValue(newItem, converted);
                            _logger.Information("Set property {PropName} = {Value} on {ItemType}", kvp.Key, kvp.Value, itemType.Name);
                        }
                        catch (Exception ex)
                        {
                            _logger.Warning("Failed to set property '{PropName}' on {ItemType}: {Error}", kvp.Key, itemType.Name, ex.Message);
                        }
                    }
                    else
                    {
                        _logger.Warning("Property '{PropName}' not found or not writable on {ItemType}", kvp.Key, itemType.Name);
                    }
                }

                // Inline nested collection handling for the newly created item.
                // This directly processes deferred array parameters (e.g., Fields on AxDataEntityViewKey)
                // by finding Add* methods on the new item and invoking them for each child.
                _logger.Information("Processing nested collections on {ItemType}. Param types: {Keys}",
                    itemType.Name,
                    string.Join(", ", methodCall.Parameters.Select(p => $"{p.Key}={p.Value?.GetType().FullName ?? "null"}")));

                var itemAddMethods = itemType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(m => m.Name.StartsWith("Add") && m.GetParameters().Length == 1)
                    .ToList();
                _logger.Information("Found {Count} Add methods on {ItemType}: {Methods}",
                    itemAddMethods.Count, itemType.Name,
                    string.Join(", ", itemAddMethods.Select(m => m.Name)));

                foreach (var kvp in methodCall.Parameters)
                {
                    if (kvp.Value == null) continue;
                    if (string.Equals(kvp.Key, "concreteType", StringComparison.OrdinalIgnoreCase)) continue;

                    // Normalize the value to a JArray regardless of how it arrived
                    Newtonsoft.Json.Linq.JArray childArray = null;
                    if (kvp.Value is Newtonsoft.Json.Linq.JArray ja)
                    {
                        childArray = ja;
                    }
                    else if (kvp.Value is Newtonsoft.Json.Linq.JToken jt && jt.Type == Newtonsoft.Json.Linq.JTokenType.Array)
                    {
                        childArray = (Newtonsoft.Json.Linq.JArray)jt;
                    }
                    else if (kvp.Value is System.Collections.IEnumerable enumVal && !(kvp.Value is string))
                    {
                        // Convert IEnumerable (e.g. List<object>) back to JArray for uniform handling
                        childArray = Newtonsoft.Json.Linq.JArray.FromObject(kvp.Value);
                    }

                    if (childArray == null || childArray.Count == 0) continue;

                    _logger.Information("Processing nested collection param '{Key}' with {Count} items (original type: {Type})",
                        kvp.Key, childArray.Count, kvp.Value.GetType().FullName);

                    // Find matching Add method: param "Fields" -> AddField, "Indexes" -> AddIndex, etc.
                    MethodInfo childAddMethod = null;
                    foreach (var am in itemAddMethods)
                    {
                        var methodSuffix = am.Name.Substring(3); // Remove "Add"
                        var plural1 = methodSuffix + "s";
                        var plural2 = methodSuffix.EndsWith("x") ? methodSuffix + "es" : methodSuffix + "s";
                        if (string.Equals(kvp.Key, plural1, StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(kvp.Key, plural2, StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(kvp.Key, methodSuffix, StringComparison.OrdinalIgnoreCase))
                        {
                            childAddMethod = am;
                            break;
                        }
                    }

                    if (childAddMethod == null)
                    {
                        _logger.Warning("No Add method found on {ItemType} matching param '{Key}'", itemType.Name, kvp.Key);
                        continue;
                    }

                    var childBaseType = childAddMethod.GetParameters()[0].ParameterType;
                    _logger.Information("Matched param '{Key}' to {Method}({ParamType}) on {ItemType}",
                        kvp.Key, childAddMethod.Name, childBaseType.Name, itemType.Name);

                    foreach (var jItem in childArray)
                    {
                        if (jItem is not Newtonsoft.Json.Linq.JObject jChild) continue;

                        try
                        {
                            // Resolve concrete type
                            Type concreteChildType = childBaseType;
                            var ctToken = jChild["concreteType"];
                            if (ctToken != null)
                            {
                                var ctName = ctToken.ToString();
                                var resolved = _reflectionManager.GetD365Type(ctName);
                                if (resolved != null && !resolved.IsAbstract)
                                {
                                    concreteChildType = resolved;
                                }
                            }
                            if (concreteChildType.IsAbstract)
                            {
                                // Last resort: if the base type param is not abstract, use it
                                if (!childBaseType.IsAbstract)
                                    concreteChildType = childBaseType;
                                else
                                {
                                    _logger.Warning("Cannot instantiate abstract type {Type} for {Key}", concreteChildType.Name, kvp.Key);
                                    continue;
                                }
                            }

                            var childInstance = Activator.CreateInstance(concreteChildType);

                            // Set properties from JObject directly
                            foreach (var childProp in jChild.Properties())
                            {
                                if (childProp.Name == "concreteType") continue;
                                var pi = concreteChildType.GetProperty(childProp.Name, BindingFlags.Public | BindingFlags.Instance);
                                if (pi != null && pi.CanWrite)
                                {
                                    var val = ConvertParameterValue(childProp.Value?.ToObject<object>(), pi.PropertyType);
                                    pi.SetValue(childInstance, val);
                                    _logger.Information("Set nested child prop {Prop} = {Val} on {Type}",
                                        childProp.Name, val, concreteChildType.Name);
                                }
                            }

                            childAddMethod.Invoke(newItem, new[] { childInstance });
                            _logger.Information("Added nested child {Type} to {Parent} via {Method}",
                                concreteChildType.Name, itemType.Name, childAddMethod.Name);
                        }
                        catch (Exception ex)
                        {
                            _logger.Error(ex, "Failed to add nested child for param '{Key}' on {ItemType}", kvp.Key, itemType.Name);
                        }
                    }
                }

                // Find a compatible Add method for the created item
                MethodInfo compatibleAdd = null;
                foreach (var addMethod in addMethods)
                {
                    var paramType = addMethod.GetParameters()[0].ParameterType;
                    if (paramType.IsAssignableFrom(itemType))
                    {
                        compatibleAdd = addMethod;
                        break;
                    }
                }

                if (compatibleAdd == null)
                {
                    result.Success = false;
                    result.Error = $"No compatible Add method found on collection '{collectionProperty.Name}' for item type '{itemType.Name}'";
                    return result;
                }

                // Add the item to the collection
                compatibleAdd.Invoke(collection, new[] { newItem });
                _logger.Information("Successfully added {ItemType} to {CollectionName} via collection-add fallback", itemType.Name, collectionProperty.Name);

                // Save the modified object
                await SaveModifiedObjectAsync(methodCall.ObjectType, methodCall.ObjectName, targetObject);

                result.Success = true;
                result.Message = $"Successfully added {itemType.Name} to {collectionProperty.Name} on {methodCall.ObjectName} (via collection-add fallback)";
                result.ExecutionTime = DateTime.UtcNow - result.StartTime;
                result.UpdatedObjectInfo = _reflectionManager.GetObjectStateInfo(targetObject);

                return result;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Collection-add fallback failed for {MethodName} on {ObjectName}", methodCall.MethodName, methodCall.ObjectName);
                result.Success = false;
                result.Error = $"Collection-add fallback error: {ex.Message}";
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

            // Check for explicit concreteType parameter first (works for both abstract AND concrete base types)
            // This handles cases like AxDataEntityViewField -> AxDataEntityViewMappedField where the base is concrete
            _logger.Information("Type check: {TypeName} - IsAbstract: {IsAbstract}, IsInterface: {IsInterface}, IsClass: {IsClass}", 
                objectType.Name, objectType.IsAbstract, objectType.IsInterface, objectType.IsClass);
            
            // Always check for concreteType override, regardless of whether base type is abstract
            if (providedParams.ContainsKey("concreteType"))
            {
                var concreteType = DetermineConcreteTypeFromParameters(objectType, providedParams);
                if (concreteType != null && concreteType != objectType)
                {
                    _logger.Information("Overriding type {BaseType} with explicit concrete type: {ConcreteType}", 
                        objectType.Name, concreteType.Name);
                    objectType = concreteType;
                }
            }
            
            // If still abstract after concreteType check, try automatic resolution
            if (objectType.IsAbstract)
            {
                _logger.Information("Type {TypeName} is abstract, determining concrete type automatically", objectType.Name);
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
            
            // Re-analyze properties from the actual concrete type so subtype properties
            // (e.g., EnumType on AxTableFieldEnum, StringSize on AxTableFieldString) are included
            var effectiveProperties = requirement?.RequiredProperties;
            if (requirement?.RequiredProperties != null)
            {
                var concreteProperties = AnalyzeD365ObjectPropertiesAsync(objectType).Result;
                if (concreteProperties.Count > requirement.RequiredProperties.Count)
                {
                    _logger.Information("Using concrete type properties ({ConcreteCount}) instead of base type ({BaseCount}) for {TypeName}",
                        concreteProperties.Count, requirement.RequiredProperties.Count, objectType.Name);
                    effectiveProperties = concreteProperties;
                }
            }

            if (effectiveProperties != null)
            {
                _logger.Information("Processing {PropertyCount} property requirements", effectiveProperties.Count);
                
                foreach (var propReq in effectiveProperties)
                {
                    _logger.Information("Checking property requirement: {PropertyName} -> {ExpectedParameter}", 
                        propReq.PropertyName, propReq.ExpectedParameterName);
                        
                    var property = objectType.GetProperty(propReq.PropertyName, BindingFlags.Public | BindingFlags.Instance);
                    if (property != null && property.CanWrite)
                    {
                        // Look for the expected parameter name
                        if (providedParams.ContainsKey(propReq.ExpectedParameterName))
                        {
                            var rawValue = providedParams[propReq.ExpectedParameterName];

                            // Skip collection properties when the value is a JSON array -
                            // these will be handled by PopulateChildCollections instead
                            if (rawValue is Newtonsoft.Json.Linq.JArray || 
                                (rawValue is System.Collections.IEnumerable && !(rawValue is string) && 
                                 property.PropertyType.IsGenericType && 
                                 property.PropertyType.Name.Contains("Collection")))
                            {
                                _logger.Information("Deferring collection property {PropertyName} to PopulateChildCollections",
                                    propReq.PropertyName);
                                continue;
                            }

                            var value = ConvertParameterValue(rawValue, property.PropertyType);
                            property.SetValue(instance, value);
                            _logger.Information("Set property {PropertyName} = {Value} from parameter {ParameterName}", 
                                propReq.PropertyName, value, propReq.ExpectedParameterName);
                        }
                        else if (propReq.IsRequired)
                        {
                            _logger.Warning("Required property {PropertyName} could not be set - parameter {ParameterName} not provided", 
                                propReq.PropertyName, propReq.ExpectedParameterName);
                        }
                        else
                        {
                            _logger.Information("Optional property {PropertyName} skipped - parameter {ParameterName} not provided", 
                                propReq.PropertyName, propReq.ExpectedParameterName);
                        }
                    }
                    else
                    {
                        _logger.Warning("Property {PropertyName} not found or not writable on {TypeName}", 
                            propReq.PropertyName, objectType.Name);
                    }
                }
            }
            else
            {
                _logger.Warning("No property requirements provided for {TypeName}", objectType.Name);
            }

            // Handle collection-type child objects (e.g., Fields on AxTableIndex)
            // If a provided parameter is a JSON array and the instance has a matching Add* method,
            // create child objects and add them to the parent
            PopulateChildCollections(instance, objectType, providedParams);

            _logger.Information("Created D365 object: {TypeName}", objectType.Name);
            return Task.FromResult(instance);
        }

        /// <summary>
        /// Populate collection-type child objects on a parent instance.
        /// Handles cases like adding AxTableIndexField items to an AxTableIndex via its AddField method.
        /// Provided parameters that are JSON arrays matching an Add* method on the parent are processed.
        /// </summary>
        private void PopulateChildCollections(object parentInstance, Type parentType, Dictionary<string, object> providedParams)
        {
            // Find all Add* methods on the parent type that take a single parameter
            var addMethods = parentType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => m.Name.StartsWith("Add") && m.GetParameters().Length == 1)
                .ToList();

            var addMethodNames = string.Join(", ", addMethods.Select(m => $"{m.Name}({m.GetParameters()[0].ParameterType.Name})"));
            _logger.Information("PopulateChildCollections on {ParentType}: Found {Count} Add methods: {Methods}",
                parentType.Name, addMethods.Count, addMethodNames);
            _logger.Information("Provided params with array values: {Keys}",
                string.Join(", ", providedParams.Where(p => p.Value is Newtonsoft.Json.Linq.JArray || (p.Value is System.Collections.IEnumerable && !(p.Value is string))).Select(p => p.Key)));

            foreach (var addMethod in addMethods)
            {
                // Derive collection name from method name: AddField -> Fields, AddIndex -> Indexes
                var collectionName = addMethod.Name.Substring(3); // Remove "Add" prefix
                // Try plural forms: "Field" -> "Fields", "Index" -> "Indexes"  
                var pluralName = collectionName.EndsWith("x") ? collectionName + "es" : collectionName + "s";
                
                // Check if the caller provided an array parameter matching this collection
                string matchedKey = null;
                if (providedParams.ContainsKey(pluralName))
                    matchedKey = pluralName;
                else if (providedParams.ContainsKey(collectionName))
                    matchedKey = collectionName;
                else if (providedParams.ContainsKey(collectionName + "Items"))
                    matchedKey = collectionName + "Items";

                // Fallback: check if any provided array param key is a suffix of the method name
                // e.g. AddRootDataSource -> matches "DataSources" param because "DataSource" is a suffix of "RootDataSource"
                if (matchedKey == null)
                {
                    foreach (var key in providedParams.Keys)
                    {
                        var val = providedParams[key];
                        bool isArray = val is Newtonsoft.Json.Linq.JArray || 
                                       (val is System.Collections.IEnumerable && !(val is string));
                        if (!isArray) continue;

                        var keySingular = key.EndsWith("s") ? key.Substring(0, key.Length - 1) : key;
                        if (collectionName.EndsWith(keySingular, StringComparison.OrdinalIgnoreCase) ||
                            keySingular.EndsWith(collectionName, StringComparison.OrdinalIgnoreCase))
                        {
                            matchedKey = key;
                            _logger.Information("Matched param '{Key}' to method '{Method}' via suffix matching",
                                key, addMethod.Name);
                            break;
                        }
                    }
                }

                if (matchedKey == null) continue;

                var paramValue = providedParams[matchedKey];
                if (paramValue == null) continue;

                _logger.Information("Found collection parameter '{Key}' for Add method '{Method}' on {ParentType}",
                    matchedKey, addMethod.Name, parentType.Name);

                // Get the child type from the Add method parameter
                var childParamType = addMethod.GetParameters()[0].ParameterType;
                
                // Parse the array items
                var items = ParseCollectionItems(paramValue);
                if (items == null || items.Count == 0)
                {
                    _logger.Warning("No items found in collection parameter '{Key}'", matchedKey);
                    continue;
                }

                foreach (var itemData in items)
                {
                    try
                    {
                        // Determine the concrete child type
                        Type concreteChildType = childParamType;
                        if (childParamType.IsAbstract && itemData.ContainsKey("concreteType"))
                        {
                            var concreteTypeName = itemData["concreteType"]?.ToString();
                            var assembly = Assembly.GetAssembly(childParamType);
                            concreteChildType = assembly?.GetTypes()
                                .FirstOrDefault(t => t.Name == concreteTypeName &&
                                                     (t.IsSubclassOf(childParamType) || childParamType.IsAssignableFrom(t)) &&
                                                     !t.IsAbstract && t.IsPublic) ?? childParamType;
                        }

                        if (concreteChildType.IsAbstract)
                        {
                            _logger.Warning("Cannot create abstract child type {ChildType} - provide concreteType parameter", concreteChildType.Name);
                            continue;
                        }

                        // Create the child instance
                        var childInstance = Activator.CreateInstance(concreteChildType);

                        // Set properties on the child from the item data
                        foreach (var kvp in itemData)
                        {
                            if (kvp.Key == "concreteType") continue; // Skip meta-parameter
                            
                            var childProperty = concreteChildType.GetProperty(kvp.Key, BindingFlags.Public | BindingFlags.Instance);
                            if (childProperty != null && childProperty.CanWrite && kvp.Value != null)
                            {
                                var convertedValue = ConvertParameterValue(kvp.Value, childProperty.PropertyType);
                                childProperty.SetValue(childInstance, convertedValue);
                                _logger.Information("Set child property {Property} = {Value} on {ChildType}",
                                    kvp.Key, convertedValue, concreteChildType.Name);
                            }
                        }

                        // Invoke the Add method on the parent
                        addMethod.Invoke(parentInstance, new[] { childInstance });
                        _logger.Information("Added child {ChildType} to {ParentType} via {Method}",
                            concreteChildType.Name, parentType.Name, addMethod.Name);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "Failed to create and add child object for collection '{Key}'", matchedKey);
                    }
                }
            }
        }

        /// <summary>
        /// Parse a provided parameter value into a list of dictionaries representing child objects.
        /// Handles JArray, List, and other iterable formats from JSON deserialization.
        /// </summary>
        private List<Dictionary<string, object>> ParseCollectionItems(object paramValue)
        {
            var items = new List<Dictionary<string, object>>();

            try
            {
                if (paramValue is Newtonsoft.Json.Linq.JArray jArray)
                {
                    foreach (var jItem in jArray)
                    {
                        if (jItem is Newtonsoft.Json.Linq.JObject jObj)
                        {
                            var dict = new Dictionary<string, object>();
                            foreach (var prop in jObj.Properties())
                            {
                                dict[prop.Name] = prop.Value?.ToObject<object>();
                            }
                            items.Add(dict);
                        }
                    }
                }
                else if (paramValue is System.Collections.IEnumerable enumerable && !(paramValue is string))
                {
                    foreach (var item in enumerable)
                    {
                        if (item is Dictionary<string, object> dict)
                        {
                            items.Add(dict);
                        }
                        else if (item is Newtonsoft.Json.Linq.JObject jObj2)
                        {
                            var dict2 = new Dictionary<string, object>();
                            foreach (var prop in jObj2.Properties())
                            {
                                dict2[prop.Name] = prop.Value?.ToObject<object>();
                            }
                            items.Add(dict2);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to parse collection items from parameter value");
            }

            return items;
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
                
                // Fallback: if method not found and name starts with "Add", try collection-add pattern
                if (method == null && methodName.StartsWith("Add"))
                {
                    var methodCallObj = new DynamicMethodCall
                    {
                        MethodName = methodName,
                        ObjectName = objectName,
                        ObjectType = objectType,
                        Parameters = parameters
                    };
                    var addResult = await TryCollectionAddFallbackAsync(targetObject, methodCallObj);
                    if (addResult != null)
                    {
                        // Convert DynamicExecutionResult to ObjectModificationResult
                        result.Success = addResult.Success;
                        result.Message = addResult.Message;
                        result.Error = addResult.Error;
                        result.ExecutionTime = DateTime.UtcNow - result.StartTime;
                        return result;
                    }
                }
                
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

        /// <summary>
        /// Validate that provided parameters match what the target method and object types require
        /// This prevents silent parameter mapping failures and guides agents to use discovery tools
        /// </summary>
        public async Task<ParameterValidationResult> ValidateModificationParametersAsync(
            string objectType, 
            string objectName, 
            string methodName, 
            Dictionary<string, object> providedParameters)
        {
            _logger.Information("Validating parameters for {MethodName} on {ObjectType}:{ObjectName}", 
                methodName, objectType, objectName);

            try
            {
                // Get the target object to validate method exists
                var targetObject = await GetD365ObjectAsync(objectType, objectName);
                if (targetObject == null)
                {
                    return ParameterValidationResult.Failure(
                        $"Object '{objectName}' of type '{objectType}' not found",
                        methodName: methodName,
                        targetObjectType: objectType);
                }

                // Get the method to validate it exists and analyze parameters
                var type = targetObject.GetType();
                var method = type.GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance);
                
                if (method == null)
                {
                    // Check if this is a collection-add pattern (e.g., "AddEntryPoint" -> "EntryPoints" collection)
                    if (methodName.StartsWith("Add"))
                    {
                        var collectionProp = FindCollectionPropertyForAddMethod(type, methodName);
                        if (collectionProp != null)
                        {
                            _logger.Information("Validation: {MethodName} resolved to collection-add on '{CollectionName}', skipping deep validation",
                                methodName, collectionProp.Name);
                            return ParameterValidationResult.Success();
                        }
                    }
                    
                    return ParameterValidationResult.Failure(
                        $"Method '{methodName}' not found on type '{objectType}'",
                        methodName: methodName,
                        targetObjectType: objectType);
                }

                // Analyze parameter requirements for the method
                var parameterRequirements = await AnalyzeParameterCreationRequirementsAsync(method);
                _logger.Information("Found {RequirementCount} parameter requirements for method {MethodName}", 
                    parameterRequirements.Count, methodName);

                // Validate each parameter requirement
                foreach (var requirement in parameterRequirements)
                {
                    if (requirement.RequiredProperties?.Any() == true)
                    {
                        _logger.Information("Validating parameter {ParameterName} of type {ParameterType} with {PropertyCount} property requirements",
                            requirement.ParameterName, requirement.ParameterType, requirement.RequiredProperties.Count);

                        // This parameter requires object creation - validate property parameters
                        var validationResult = ValidateObjectCreationParameters(requirement, providedParameters);
                        if (!validationResult.IsValid)
                        {
                            // Enhance the error message with context
                            validationResult.MethodName = methodName;
                            validationResult.TargetObjectType = objectType;
                            validationResult.ObjectTypeBeingCreated = requirement.ParameterType;
                            
                            return validationResult;
                        }
                    }
                }

                _logger.Information("✅ Parameter validation successful for {MethodName} on {ObjectType}:{ObjectName}", 
                    methodName, objectType, objectName);

                return ParameterValidationResult.Success();
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error during parameter validation for {MethodName} on {ObjectType}:{ObjectName}", 
                    methodName, objectType, objectName);
                
                return ParameterValidationResult.Failure(
                    $"Parameter validation error: {ex.Message}",
                    methodName: methodName,
                    targetObjectType: objectType);
            }
        }

        /// <summary>
        /// Validate that provided parameters match the property requirements for object creation.
        /// When a concreteType is specified, validates against the concrete type's properties
        /// instead of the abstract base type, enabling subtype-specific properties like
        /// EnumType on AxTableFieldEnum and StringSize on AxTableFieldString.
        /// </summary>
        private ParameterValidationResult ValidateObjectCreationParameters(
            ParameterCreationRequirement requirement, 
            Dictionary<string, object> providedParameters)
        {
            // If a concreteType is provided, re-analyze properties using the concrete type
            // This allows subtype-specific properties (e.g., EnumType, StringSize) to pass validation
            var effectiveRequirement = requirement;
            if (providedParameters.TryGetValue("concreteType", out var concreteTypeObj) && concreteTypeObj != null)
            {
                var concreteTypeName = concreteTypeObj.ToString();
                var baseType = _reflectionManager.GetD365Type(requirement.ParameterType);
                if (baseType != null)
                {
                    var assembly = Assembly.GetAssembly(baseType);
                    var concreteType = assembly?.GetTypes()
                        .FirstOrDefault(t => t.Name == concreteTypeName &&
                                            (t.IsSubclassOf(baseType) || baseType.IsAssignableFrom(t)) &&
                                            !t.IsAbstract &&
                                            t.IsPublic);

                    if (concreteType != null)
                    {
                        _logger.Information("Validating against concrete type {ConcreteType} instead of base type {BaseType}",
                            concreteTypeName, requirement.ParameterType);

                        var concreteProperties = AnalyzeD365ObjectPropertiesAsync(concreteType).Result;
                        effectiveRequirement = new ParameterCreationRequirement
                        {
                            ParameterName = requirement.ParameterName,
                            ParameterType = concreteTypeName,
                            ParameterTypeFullName = concreteType.FullName,
                            IsRequired = requirement.IsRequired,
                            RequiredProperties = concreteProperties,
                            CreationInstructions = requirement.CreationInstructions
                        };
                    }
                }
            }

            var result = new ParameterValidationResult
            {
                ObjectTypeBeingCreated = effectiveRequirement.ParameterType
            };

            // Check for required parameters
            foreach (var propReq in effectiveRequirement.RequiredProperties.Where(p => p.IsRequired))
            {
                if (!providedParameters.ContainsKey(propReq.ExpectedParameterName))
                {
                    result.MissingRequiredParameters.Add(propReq.ExpectedParameterName);
                }
            }

            // Check for unknown parameters (parameters provided that don't match any expected parameters)
            var expectedParameterNames = effectiveRequirement.RequiredProperties.Select(p => p.ExpectedParameterName).ToHashSet();
            foreach (var providedParam in providedParameters.Keys)
            {
                // Skip system parameters that are not property mappings
                if (IsSystemParameter(providedParam))
                    continue;

                if (!expectedParameterNames.Contains(providedParam))
                {
                    result.UnknownParameters.Add(providedParam);
                }
            }

            // Set suggested parameters (all expected parameters)
            result.SuggestedParameters = effectiveRequirement.RequiredProperties.Select(p => p.ExpectedParameterName).ToList();

            // Determine if validation passed
            if (result.MissingRequiredParameters.Any() || result.UnknownParameters.Any())
            {
                result.IsValid = false;
                result.ErrorMessage = CreateParameterValidationErrorMessage(effectiveRequirement, result);
            }
            else
            {
                result.IsValid = true;
            }

            return result;
        }

        /// <summary>
        /// Check if a parameter is a system parameter (not a property mapping parameter)
        /// </summary>
        private bool IsSystemParameter(string parameterName)
        {
            var systemParameters = new[] { "concreteType" };
            return systemParameters.Contains(parameterName, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Create a detailed error message for parameter validation failures
        /// </summary>
        private string CreateParameterValidationErrorMessage(
            ParameterCreationRequirement requirement, 
            ParameterValidationResult result)
        {
            var message = $"Parameter validation failed: Invalid parameters for {requirement.ParameterType} creation.\n\n";

            if (result.UnknownParameters.Any())
            {
                message += $"❌ Unknown parameters provided: {string.Join(", ", result.UnknownParameters)}\n";
            }

            if (result.MissingRequiredParameters.Any())
            {
                message += $"❌ Missing required parameters: {string.Join(", ", result.MissingRequiredParameters)}\n";
            }

            if (result.SuggestedParameters.Any())
            {
                message += $"✅ Expected parameters for {requirement.ParameterType}:\n";
                foreach (var propReq in requirement.RequiredProperties)
                {
                    var requiredMarker = propReq.IsRequired ? "[REQUIRED]" : "[OPTIONAL]";
                    message += $"   - {propReq.ExpectedParameterName} ({propReq.PropertyType}) {requiredMarker}: {propReq.PropertyName} property\n";
                }
            }

            message += $"\n💡 Use discover_modification_capabilities tool to get exact parameter requirements:\n";
            message += $"   mcp_mcp-xpp-serve_discover_modification_capabilities({{\n";
            message += $"     \"objectType\": \"{requirement.ParameterType}\"\n";
            message += $"   }})";

            return message;
        }

        #endregion
    }
}
