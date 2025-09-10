using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.AX.Metadata.Service;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Microsoft.Dynamics.AX.Metadata.Providers;
using Microsoft.Dynamics.AX.Metadata.Core.MetaModel;
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
        /// Dynamically discovers the D365 metadata assembly without hardcoding specific types
        /// Searches for any assembly containing D365 metadata types (Ax* pattern)
        /// </summary>
        private Assembly GetD365MetadataAssembly()
        {
            try
            {
                _logger.Information("Attempting to find D365 metadata assembly...");
                
                // First, try to get the assembly directly from a known type
                // This will force the assembly to be loaded if it's not already
                try
                {
                    var knownType = typeof(AxTable); // This should force assembly loading
                    var assembly = knownType.Assembly;
                    _logger.Information("Found D365 metadata assembly via known type: {AssemblyName}", assembly.FullName);
                    return assembly;
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Could not get assembly from known type, trying discovery...");
                }
                
                // Get all loaded assemblies and find the one containing D365 metadata types
                var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                _logger.Information("Searching through {AssemblyCount} loaded assemblies", assemblies.Length);
                
                foreach (var assembly in assemblies)
                {
                    try
                    {
                        // Look for assemblies that contain types in Microsoft.Dynamics.AX.Metadata.MetaModel namespace
                        var metaModelTypes = assembly.GetTypes()
                            .Where(t => t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel" && 
                                       t.Name.StartsWith("Ax"))
                            .Take(5);
                        
                        if (metaModelTypes.Any())
                        {
                            _logger.Information("Found D365 metadata assembly: {AssemblyName} with types: {Types}", 
                                assembly.FullName, string.Join(", ", metaModelTypes.Select(t => t.Name)));
                            return assembly;
                        }
                    }
                    catch (ReflectionTypeLoadException ex)
                    {
                        _logger.Debug("Could not load types from assembly {AssemblyName}: {Error}", 
                            assembly.GetName().Name, ex.Message);
                        continue;
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug("Error checking assembly {AssemblyName}: {Error}", 
                            assembly.GetName().Name, ex.Message);
                        continue;
                    }
                }
                
                // Fallback: try Microsoft.Dynamics.AX.Metadata assembly by name
                try
                {
                    _logger.Information("Attempting to load Microsoft.Dynamics.AX.Metadata by name...");
                    return Assembly.Load("Microsoft.Dynamics.AX.Metadata");
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Could not load Microsoft.Dynamics.AX.Metadata by name");
                }
                
                _logger.Error("Could not find D365 metadata assembly using any method");
                throw new InvalidOperationException("D365 metadata assembly not found. Ensure Microsoft.Dynamics.AX.Metadata is available.");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error discovering D365 metadata assembly");
                throw;
            }
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
                        }).ToList(),
                        // NEW: Add detailed parameter creation requirements
                        ParameterCreationRequirements = await AnalyzeParameterCreationRequirementsAsync(method)
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

                // NEW: Build structured inheritance hierarchy mapping
                capabilities.InheritanceHierarchy = await BuildInheritanceHierarchyAsync(type);
                
                // NEW: Add reflection information about the main type
                capabilities.ReflectionInfo = new TypeReflectionInfo
                {
                    Namespace = type.Namespace,
                    Assembly = type.Assembly.GetName().Name,
                    IsPublic = type.IsPublic,
                    IsAbstract = type.IsAbstract,
                    IsSealed = type.IsSealed,
                    BaseTypeName = type.BaseType?.Name,
                    InterfaceNames = type.GetInterfaces().Select(i => i.Name).ToList()
                };

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
                var assembly = GetD365MetadataAssembly();
                
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
            // Use actual method metadata instead of hardcoded prefixes
            // Check for methods that modify object state (non-readonly, void or return modified objects)
            return method.IsPublic && 
                   !method.IsStatic && 
                   !method.IsSpecialName && 
                   !method.Name.StartsWith("get_") && 
                   !method.Name.StartsWith("set_") &&
                   method.GetParameters().Length > 0; // Methods that take parameters are likely modification methods
        }

        private bool IsModifiableProperty(PropertyInfo property)
        {
            // Use actual property metadata instead of hardcoded property names
            return property.CanWrite && 
                   property.SetMethod != null && 
                   property.SetMethod.IsPublic && 
                   !property.SetMethod.IsStatic;
        }

        private bool IsCollectionType(Type type)
        {
            // Use proper type hierarchy checking instead of name matching
            return typeof(System.Collections.ICollection).IsAssignableFrom(type) ||
                   typeof(System.Collections.IEnumerable).IsAssignableFrom(type) ||
                   (type.IsGenericType && 
                    (type.GetGenericTypeDefinition() == typeof(ICollection<>) ||
                     type.GetGenericTypeDefinition() == typeof(IList<>) ||
                     type.GetGenericTypeDefinition() == typeof(IEnumerable<>)));
        }

        private List<string> GetCollectionMethods(Type collectionType)
        {
            // Use actual interface analysis instead of hardcoded method names
            return collectionType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => !m.IsSpecialName && // Exclude property getters/setters
                           !m.Name.StartsWith("get_") && 
                           !m.Name.StartsWith("set_") &&
                           m.IsPublic)
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
            // Check for actual Description attributes first
            var descriptionAttr = type.GetCustomAttribute<System.ComponentModel.DescriptionAttribute>();
            if (descriptionAttr != null)
            {
                return descriptionAttr.Description;
            }

            // Check for Display attributes
            var displayAttr = type.GetCustomAttribute<System.ComponentModel.DisplayNameAttribute>();
            if (displayAttr != null)
            {
                return displayAttr.DisplayName;
            }

            // Generic description based on actual type information
            return $"D365 metadata type: {type.Name} (Namespace: {type.Namespace})";
        }

        private Task<List<Models.TypeInfo>> DiscoverRelatedTypeConstructorsAsync(Type mainType)
        {
            var relatedTypes = new List<Models.TypeInfo>();
            
            // Get all modification methods to see what parameter types they need
            var modificationMethods = mainType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => IsModificationMethod(m))
                .ToArray();

            // For each parameter type in modification methods, find all concrete implementations
            var parameterTypes = modificationMethods
                .SelectMany(m => m.GetParameters())
                .Select(p => p.ParameterType)
                .Where(t => t.Name.StartsWith("Ax"))
                .Distinct()
                .ToArray();

            var assembly = GetD365MetadataAssembly();
            
            foreach (var paramType in parameterTypes)
            {
                if (paramType.IsAbstract || paramType.IsInterface)
                {
                    // Find all concrete implementations of this abstract type
                    var concreteTypes = assembly.GetTypes()
                        .Where(t => t.IsSubclassOf(paramType) && !t.IsAbstract && t.IsPublic)
                        .ToArray();

                    foreach (var concreteType in concreteTypes)
                    {
                        relatedTypes.Add(new Models.TypeInfo
                        {
                            Name = concreteType.Name,
                            FullName = concreteType.FullName,
                            Description = GenerateTypeDescription(concreteType),
                            IsAbstract = false,
                            BaseType = paramType.Name,
                            Constructors = concreteType.GetConstructors().Select(c => new Models.ConstructorInfo
                            {
                                Parameters = c.GetParameters().Select(p => new Models.ParameterInfo
                                {
                                    Name = p.Name,
                                    Type = p.ParameterType.Name,
                                    TypeFullName = p.ParameterType.FullName,
                                    IsOptional = p.IsOptional,
                                    DefaultValue = p.HasDefaultValue ? p.DefaultValue?.ToString() : null
                                }).ToList(),
                                IsPublic = c.IsPublic
                            }).ToList()
                        });
                    }
                }
                else
                {
                    // For concrete types, just add the type itself
                    relatedTypes.Add(new Models.TypeInfo
                    {
                        Name = paramType.Name,
                        FullName = paramType.FullName,
                        Description = GenerateTypeDescription(paramType),
                        IsAbstract = paramType.IsAbstract,
                        BaseType = paramType.BaseType?.Name,
                        Constructors = paramType.GetConstructors().Select(c => new Models.ConstructorInfo
                        {
                            Parameters = c.GetParameters().Select(p => new Models.ParameterInfo
                            {
                                Name = p.Name,
                                Type = p.ParameterType.Name,
                                TypeFullName = p.ParameterType.FullName,
                                IsOptional = p.IsOptional,
                                DefaultValue = p.HasDefaultValue ? p.DefaultValue?.ToString() : null
                            }).ToList(),
                            IsPublic = c.IsPublic
                        }).ToList()
                    });
                }
            }
            
            return Task.FromResult(relatedTypes.Distinct().ToList());
        }

        /// <summary>
        /// NEW: Build structured inheritance hierarchy mapping for concrete type resolution
        /// This provides explicit mapping of abstract types to their concrete implementations
        /// </summary>
        private Task<Dictionary<string, List<Models.TypeInfo>>> BuildInheritanceHierarchyAsync(Type mainType)
        {
            var hierarchy = new Dictionary<string, List<Models.TypeInfo>>();
            
            // Get all modification methods to see what parameter types they need
            var modificationMethods = mainType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => IsModificationMethod(m))
                .ToArray();

            // For each parameter type in modification methods
            var parameterTypes = modificationMethods
                .SelectMany(m => m.GetParameters())
                .Select(p => p.ParameterType)
                .Where(t => t.Name.StartsWith("Ax")) // D365 types
                .Distinct()
                .ToArray();

            var assembly = GetD365MetadataAssembly();
            
            foreach (var paramType in parameterTypes)
            {
                var concreteImplementations = new List<Models.TypeInfo>();
                
                if (paramType.IsAbstract || paramType.IsInterface)
                {
                    // Find all concrete implementations of this abstract type
                    var concreteTypes = assembly.GetTypes()
                        .Where(t => (t.IsSubclassOf(paramType) || paramType.IsAssignableFrom(t)) 
                                   && !t.IsAbstract 
                                   && t.IsPublic
                                   && t != paramType) // Exclude the abstract type itself
                        .ToArray();

                    foreach (var concreteType in concreteTypes)
                    {
                        concreteImplementations.Add(new Models.TypeInfo
                        {
                            Name = concreteType.Name,
                            FullName = concreteType.FullName,
                            Description = GenerateTypeDescription(concreteType),
                            IsAbstract = false,
                            BaseType = GetMostRelevantBaseType(concreteType, paramType),
                            Constructors = concreteType.GetConstructors().Select(c => new Models.ConstructorInfo
                            {
                                Parameters = c.GetParameters().Select(p => new Models.ParameterInfo
                                {
                                    Name = p.Name,
                                    Type = p.ParameterType.Name,
                                    TypeFullName = p.ParameterType.FullName,
                                    IsOptional = p.IsOptional,
                                    DefaultValue = p.HasDefaultValue ? p.DefaultValue?.ToString() : null
                                }).ToList(),
                                IsPublic = c.IsPublic
                            }).ToList()
                        });
                    }
                    
                    // Only add to hierarchy if we found concrete implementations
                    if (concreteImplementations.Any())
                    {
                        hierarchy[paramType.Name] = concreteImplementations;
                    }
                }
                else
                {
                    // For concrete types, add them as implementations of themselves
                    concreteImplementations.Add(new Models.TypeInfo
                    {
                        Name = paramType.Name,
                        FullName = paramType.FullName,
                        Description = GenerateTypeDescription(paramType),
                        IsAbstract = false,
                        BaseType = paramType.BaseType?.Name
                    });
                    
                    hierarchy[paramType.Name] = concreteImplementations;
                }
            }
            
            return Task.FromResult(hierarchy);
        }
        
        /// <summary>
        /// Helper to get the most relevant base type name for inheritance display
        /// </summary>
        private string GetMostRelevantBaseType(Type concreteType, Type abstractType)
        {
            // Walk up the inheritance chain to find the direct relationship
            var current = concreteType.BaseType;
            while (current != null && current != typeof(object))
            {
                if (current == abstractType || abstractType.IsAssignableFrom(current))
                {
                    return current.Name;
                }
                current = current.BaseType;
            }
            
            // If we couldn't find the relationship, return the immediate base type
            return concreteType.BaseType?.Name ?? "object";
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
                    // For simple types, just specify the type
                    requirement.CreationInstructions = $"Provide {param.ParameterType.Name} value";
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
        /// Generate expected parameter name from property name - NO MAPPING
        /// Returns the exact property name as it exists on the D365 object
        /// </summary>
        private string GenerateExpectedParameterName(PropertyInfo property, Type objectType = null)
        {
            // Return the exact property name - no transformation, no mapping
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
                    return ConvertParameterValue(providedParams[param.Name], param.ParameterType);
                }
                
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

        // REMOVED: All fuzzy matching and guessing code
        // Now using explicit parameter requirements from DiscoverModificationCapabilitiesAsync

        /// <summary>
        /// Create collection objects
        /// </summary>
        private object CreateCollectionObject(Type collectionType)
        {
            try
            {
                return Activator.CreateInstance(collectionType);
            }
            catch
            {
                return null;
            }
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

                // Get key properties dynamically - discover what properties exist rather than hardcoding
                var commonPropertyNames = new List<string>();
                var allProperties = type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
                
                // Dynamically identify key properties that are strings and commonly used for identification
                foreach (var prop in allProperties)
                {
                    if (prop.CanRead && prop.PropertyType == typeof(string))
                    {
                        var propName = prop.Name;
                        // Include properties that are typically used for object identification/description
                        // but don't hardcode the specific names - check if they exist
                        if (propName.EndsWith("Name") || propName.EndsWith("Label") || propName.EndsWith("Description") ||
                            propName.Equals("Name", StringComparison.OrdinalIgnoreCase) ||
                            propName.Equals("Label", StringComparison.OrdinalIgnoreCase) ||
                            propName.Equals("Description", StringComparison.OrdinalIgnoreCase))
                        {
                            commonPropertyNames.Add(propName);
                        }
                    }
                }
                
                foreach (var propName in commonPropertyNames)
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
                var assembly = GetD365MetadataAssembly();

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
