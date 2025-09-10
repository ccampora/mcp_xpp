using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Collections.Concurrent;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.AX.Metadata.Service;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Microsoft.Dynamics.AX.Metadata.Providers;
using Microsoft.Dynamics.AX.Metadata.Core.MetaModel;
using D365MetadataService.Models;
using Serilog;

namespace D365MetadataService.Services
{
    /// <summary>
    /// CENTRALIZED D365 Reflection Manager - Single Source of Truth for all reflection operations
    /// Eliminates scattered reflection logic across multiple handlers and services
    /// 
    /// DESIGN PRINCIPLES:
    /// - Single Responsibility: All reflection logic in one place
    /// - Thread-Safe: Concurrent collections for high-performance caching
    /// - Lazy Loading: Assembly discovery only when needed
    /// - Performance Optimized: Aggressive caching with minimal overhead
    /// </summary>
    public class D365ReflectionManager
    {
        #region Private Fields

        private readonly ILogger _logger;
        private static readonly Lazy<D365ReflectionManager> _instance = new(() => new D365ReflectionManager());
        
        // Thread-safe caches for high-performance operations
        private readonly ConcurrentDictionary<string, Type> _typeCache = new();
        private readonly ConcurrentDictionary<string, MethodInfo[]> _methodCache = new();
        private readonly ConcurrentDictionary<string, PropertyInfo[]> _propertyCache = new();
        private readonly ConcurrentDictionary<Type, string[]> _supportedTypesCache = new();
        
        // Assembly management
        private Assembly _d365MetadataAssembly;
        private readonly object _assemblyLock = new();
        private bool _isInitialized = false;

        #endregion

        #region Constructor & Singleton

        private D365ReflectionManager()
        {
            _logger = Serilog.Log.ForContext<D365ReflectionManager>();
        }

        /// <summary>
        /// Singleton instance - thread-safe lazy initialization
        /// </summary>
        public static D365ReflectionManager Instance => _instance.Value;

        #endregion

        #region Core Assembly Management

        /// <summary>
        /// UNIFIED assembly discovery - replaces all scattered GetD365MetadataAssembly methods
        /// Thread-safe, cached, with comprehensive fallback logic
        /// </summary>
        public Assembly GetD365MetadataAssembly()
        {
            if (_d365MetadataAssembly != null)
                return _d365MetadataAssembly;

            lock (_assemblyLock)
            {
                if (_d365MetadataAssembly != null)
                    return _d365MetadataAssembly;

                try
                {
                    _logger.Information("🔍 Discovering D365 metadata assembly...");
                    
                    // Strategy 1: Force assembly loading via known type
                    try
                    {
                        var knownType = typeof(AxTable);
                        _d365MetadataAssembly = knownType.Assembly;
                        _logger.Information("✅ Found D365 assembly via typeof(AxTable): {Assembly}", 
                            _d365MetadataAssembly.FullName);
                        return _d365MetadataAssembly;
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "⚠️ typeof(AxTable) approach failed, trying discovery...");
                    }

                    // Strategy 2: Dynamic discovery through loaded assemblies
                    var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                    _logger.Debug("🔍 Searching {Count} loaded assemblies", assemblies.Length);

                    foreach (var assembly in assemblies)
                    {
                        try
                        {
                            var metaModelTypes = assembly.GetTypes()
                                .Where(t => t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel" && 
                                           t.Name.StartsWith("Ax"))
                                .Take(5)
                                .ToArray();

                            if (metaModelTypes.Length > 0)
                            {
                                _d365MetadataAssembly = assembly;
                                _logger.Information("✅ Found D365 assembly via discovery: {Assembly} with {TypeCount} types", 
                                    assembly.FullName, metaModelTypes.Length);
                                return _d365MetadataAssembly;
                            }
                        }
                        catch (ReflectionTypeLoadException ex)
                        {
                            _logger.Debug("Skipping assembly {Name}: {Error}", 
                                assembly.GetName().Name, ex.Message);
                        }
                    }

                    // Strategy 3: Load by name
                    try
                    {
                        _d365MetadataAssembly = Assembly.Load("Microsoft.Dynamics.AX.Metadata");
                        _logger.Information("✅ Loaded D365 assembly by name");
                        return _d365MetadataAssembly;
                    }
                    catch (Exception ex)
                    {
                        _logger.Error(ex, "❌ Failed to load D365 assembly by name");
                    }

                    throw new InvalidOperationException("❌ Could not discover D365 metadata assembly using any strategy");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "❌ Critical error in D365 assembly discovery");
                    throw;
                }
            }
        }

        #endregion

        #region Type Discovery & Caching

        /// <summary>
        /// UNIFIED type discovery - replaces scattered type enumeration logic
        /// High-performance cached approach with intelligent filtering
        /// </summary>
        public string[] GetSupportedObjectTypes()
        {
            return _supportedTypesCache.GetOrAdd(typeof(object), _ => DiscoverSupportedTypes());
        }

        private string[] DiscoverSupportedTypes()
        {
            try
            {
                var assembly = GetD365MetadataAssembly();
                
                var axTypes = assembly.GetTypes()
                    .Where(IsValidD365ObjectType)
                    .Select(t => t.Name)
                    .Distinct()
                    .OrderBy(name => name)
                    .ToArray();

                _logger.Information("🎯 Discovered {Count} supported D365 object types", axTypes.Length);
                
                return axTypes;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error discovering supported object types");
                return Array.Empty<string>();
            }
        }

        /// <summary>
        /// UNIFIED type validation - consistent filtering logic
        /// </summary>
        private bool IsValidD365ObjectType(Type type)
        {
            return type.IsClass &&
                   type.IsPublic &&
                   type.Name.StartsWith("Ax") &&
                   !type.IsAbstract &&
                   !type.Name.Contains("Collection") &&
                   !type.Name.Contains("Base") &&
                   !type.Name.Contains("Helper") &&
                   !type.Name.Contains("Util") &&
                   HasDefaultConstructor(type);
        }

        /// <summary>
        /// UNIFIED constructor validation
        /// </summary>
        private bool HasDefaultConstructor(Type type)
        {
            try
            {
                return type.GetConstructor(Type.EmptyTypes) != null;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// UNIFIED type retrieval with caching
        /// </summary>
        public Type GetD365Type(string typeName)
        {
            return _typeCache.GetOrAdd(typeName, name =>
            {
                try
                {
                    var assembly = GetD365MetadataAssembly();
                    var type = assembly.GetType($"Microsoft.Dynamics.AX.Metadata.MetaModel.{name}");
                    
                    if (type == null)
                    {
                        _logger.Warning("⚠️ Type not found: {TypeName}", name);
                    }
                    
                    return type;
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "❌ Error retrieving type: {TypeName}", name);
                    return null;
                }
            });
        }

        #endregion

        #region Method Discovery & Analysis

        /// <summary>
        /// UNIFIED method discovery - replaces scattered method enumeration
        /// High-performance cached with intelligent filtering for modification methods
        /// </summary>
        public MethodInfo[] GetModificationMethods(string typeName)
        {
            return _methodCache.GetOrAdd($"{typeName}_modifications", _ => DiscoverModificationMethods(typeName));
        }

        private MethodInfo[] DiscoverModificationMethods(string typeName)
        {
            try
            {
                var type = GetD365Type(typeName);
                if (type == null) return Array.Empty<MethodInfo>();

                var methods = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Where(IsModificationMethod)
                    .OrderBy(m => m.Name)
                    .ToArray();

                _logger.Debug("🔧 Found {Count} modification methods for {Type}", methods.Length, typeName);
                
                return methods;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error discovering modification methods for {Type}", typeName);
                return Array.Empty<MethodInfo>();
            }
        }

        /// <summary>
        /// UNIFIED modification method identification - consistent logic
        /// </summary>
        private bool IsModificationMethod(MethodInfo method)
        {
            var name = method.Name.ToLowerInvariant();
            
            // Positive patterns: methods that modify state
            var modificationPatterns = new[]
            {
                "add", "set", "apply", "create", "update", "modify", "insert",
                "remove", "delete", "clear", "reset", "configure"
            };

            // Negative patterns: methods that don't modify state
            var readOnlyPatterns = new[]
            {
                "get", "find", "search", "list", "enumerate", "count", "contains",
                "equals", "compare", "validate", "check", "test"
            };

            // Check for modification patterns
            if (modificationPatterns.Any(pattern => name.Contains(pattern)))
                return true;

            // Exclude read-only patterns
            if (readOnlyPatterns.Any(pattern => name.Contains(pattern)))
                return false;

            // Default: include public methods that return void or modify objects
            return method.ReturnType == typeof(void) || 
                   method.ReturnType.Name.StartsWith("Ax");
        }

        #endregion

        #region Property Discovery & Analysis

        /// <summary>
        /// UNIFIED property discovery - replaces scattered property enumeration
        /// </summary>
        public PropertyInfo[] GetWritableProperties(string typeName)
        {
            return _propertyCache.GetOrAdd($"{typeName}_writable", _ => DiscoverWritableProperties(typeName));
        }

        private PropertyInfo[] DiscoverWritableProperties(string typeName)
        {
            try
            {
                var type = GetD365Type(typeName);
                if (type == null) return Array.Empty<PropertyInfo>();

                var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(IsWritableProperty)
                    .OrderBy(p => p.Name)
                    .ToArray();

                _logger.Debug("📝 Found {Count} writable properties for {Type}", properties.Length, typeName);
                
                return properties;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error discovering writable properties for {Type}", typeName);
                return Array.Empty<PropertyInfo>();
            }
        }

        /// <summary>
        /// UNIFIED property validation - consistent filtering
        /// </summary>
        private bool IsWritableProperty(PropertyInfo property)
        {
            return property.CanRead && 
                   property.CanWrite && 
                   property.GetSetMethod() != null &&
                   !property.Name.StartsWith("Internal") &&
                   !property.Name.Contains("Readonly");
        }

        #endregion

        #region Initialization & Management

        /// <summary>
        /// Initialize all caches - call once at startup for optimal performance
        /// </summary>
        public void Initialize()
        {
            if (_isInitialized) return;

            lock (_assemblyLock)
            {
                if (_isInitialized) return;

                try
                {
                    _logger.Information("🚀 Initializing D365 Reflection Manager...");
                    
                    // Force assembly loading
                    var assembly = GetD365MetadataAssembly();
                    
                    // Pre-populate type cache
                    var supportedTypes = GetSupportedObjectTypes();
                    _logger.Information("✅ Pre-cached {Count} D365 object types", supportedTypes.Length);
                    
                    _isInitialized = true;
                    _logger.Information("🎯 D365 Reflection Manager initialized successfully");
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "❌ Failed to initialize D365 Reflection Manager");
                    throw;
                }
            }
        }

        /// <summary>
        /// Get comprehensive statistics about cached reflection data
        /// </summary>
        public object GetStatistics()
        {
            return new
            {
                IsInitialized = _isInitialized,
                AssemblyLoaded = _d365MetadataAssembly != null,
                AssemblyName = _d365MetadataAssembly?.FullName,
                CachedTypes = _typeCache.Count,
                CachedMethods = _methodCache.Count,
                CachedProperties = _propertyCache.Count,
                SupportedObjectTypes = GetSupportedObjectTypes().Length,
                Timestamp = DateTime.UtcNow
            };
        }

        /// <summary>
        /// Discover all object collection properties on a metadata provider
        /// Returns properties that have ListObjectsForModel method (indicating D365 object collections)
        /// </summary>
        public PropertyInfo[] GetProviderCollectionProperties(IMetadataProvider provider)
        {
            if (provider == null) return Array.Empty<PropertyInfo>();

            var providerType = provider.GetType();
            var cacheKey = $"ProviderCollections_{providerType.FullName}";

            return _propertyCache.GetOrAdd(cacheKey, _ =>
            {
                _logger.Debug("🔍 Discovering collection properties for provider type: {ProviderType}", providerType.Name);

                var properties = providerType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(prop => 
                        // Look for properties that have a ListObjectsForModel method (indicating they're D365 object collections)
                        prop.PropertyType.GetMethod("ListObjectsForModel") != null &&
                        prop.CanRead)
                    .OrderBy(prop => prop.Name)
                    .ToArray();

                _logger.Information("📊 Cached {Count} collection properties for {ProviderType}", 
                    properties.Length, providerType.Name);

                return properties;
            });
        }

        /// <summary>
        /// Get all objects for a specific model using dynamic collection discovery
        /// Replaces hardcoded object type enumeration with reflection-based approach
        /// </summary>
        public Dictionary<string, object> GetAllObjectsForModel(IMetadataProvider provider, string modelName)
        {
            var objects = new Dictionary<string, object>();
            var totalObjectCount = 0;

            if (provider == null || string.IsNullOrEmpty(modelName))
            {
                _logger.Warning("⚠️ Invalid parameters: provider={Provider}, model={Model}", 
                    provider?.GetType().Name ?? "null", modelName ?? "null");
                return objects;
            }

            try
            {
                _logger.Debug("🔍 Dynamically discovering all objects for model: {Model}", modelName);
                
                var collectionProperties = GetProviderCollectionProperties(provider);
                _logger.Information("📊 Processing {Count} object collection properties for model {Model}", 
                    collectionProperties.Length, modelName);

                foreach (var collectionProp in collectionProperties)
                {
                    try
                    {
                        _logger.Debug("   🔄 Processing collection: {PropertyName} ({PropertyType})", 
                            collectionProp.Name, collectionProp.PropertyType.Name);

                        // Get the collection instance
                        var collection = collectionProp.GetValue(provider);
                        if (collection == null)
                        {
                            _logger.Debug("   ⚠️ Collection {PropertyName} is null, skipping", collectionProp.Name);
                            continue;
                        }

                        // Call ListObjectsForModel on the collection
                        var listMethod = collection.GetType().GetMethod("ListObjectsForModel");
                        if (listMethod == null)
                        {
                            _logger.Debug("   ⚠️ Collection {PropertyName} has no ListObjectsForModel method, skipping", collectionProp.Name);
                            continue;
                        }

                        // Invoke the method to get objects for this model
                        var result = listMethod.Invoke(collection, new object[] { modelName });
                        if (result != null)
                        {
                            // Convert to list to get count and allow enumeration
                            var resultList = ((System.Collections.IEnumerable)result).Cast<object>().ToList();
                            
                            if (resultList.Any())
                            {
                                // Use collection property name as object type
                                var objectTypeName = collectionProp.Name;
                                
                                objects[objectTypeName] = resultList;
                                totalObjectCount += resultList.Count;
                                
                                _logger.Debug("   ✅ {ObjectType}: {Count} objects", objectTypeName, resultList.Count);
                            }
                            else
                            {
                                _logger.Debug("   📭 {PropertyName}: No objects found for model {Model}", 
                                    collectionProp.Name, modelName);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning("   ⚠️ Failed to process collection {PropertyName}: {Error}", 
                            collectionProp.Name, ex.Message);
                    }
                }

                _logger.Information("🎯 Dynamic enumeration complete for model {Model}: {TotalObjects} total objects across {CollectionCount} collections", 
                    modelName, totalObjectCount, objects.Count);

                return objects;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error during dynamic object enumeration for model {Model}", modelName);
                return objects; // Return whatever we managed to collect
            }
        }

        /// <summary>
        /// Discover all modification capabilities for a specific D365 object type
        /// Centralized method that replaces scattered capability discovery logic
        /// </summary>
        public ObjectCapabilities DiscoverModificationCapabilities(string objectTypeName)
        {
            try
            {
                var type = GetD365Type(objectTypeName);
                if (type == null)
                {
                    _logger.Warning("⚠️ Type not found: {TypeName}", objectTypeName);
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

                // Use cached modification methods
                var modificationMethods = GetModificationMethods(objectTypeName);

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

                // Use cached writable properties
                var writableProperties = GetWritableProperties(objectTypeName);

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

                // Add reflection information about the main type
                capabilities.ReflectionInfo = new TypeReflectionInfo
                {
                    Namespace = type.Namespace,
                    Assembly = type.Assembly.GetName().Name,
                    IsPublic = type.IsPublic,
                    IsAbstract = type.IsAbstract,
                    IsSealed = type.IsSealed,
                    BaseTypeName = type.BaseType?.Name
                };

                _logger.Debug("📋 Discovered capabilities for {TypeName}: {MethodCount} methods, {PropertyCount} properties", 
                    objectTypeName, capabilities.ModificationMethods.Count, capabilities.WritableProperties.Count);

                return capabilities;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error discovering capabilities for {TypeName}", objectTypeName);
                return new ObjectCapabilities
                {
                    ObjectType = objectTypeName,
                    Success = false,
                    Error = $"Error discovering capabilities: {ex.Message}"
                };
            }
        }

        /// <summary>
        /// Generate human-readable description for a method based on its signature
        /// </summary>
        private string GenerateMethodDescription(MethodInfo method)
        {
            var paramCount = method.GetParameters().Length;
            var paramDesc = paramCount == 0 ? "no parameters" : $"{paramCount} parameter{(paramCount > 1 ? "s" : "")}";
            
            return $"{method.Name} - {method.ReturnType.Name} method with {paramDesc}";
        }

        /// <summary>
        /// Check if a property type represents a collection
        /// </summary>
        private bool IsCollectionType(Type type)
        {
            return type != typeof(string) && 
                   (typeof(System.Collections.IEnumerable).IsAssignableFrom(type) ||
                    type.IsGenericType && type.GetGenericTypeDefinition() == typeof(ICollection<>) ||
                    type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IList<>));
        }

        /// <summary>
        /// Get available methods on collection types
        /// </summary>
        private List<string> GetCollectionMethods(Type collectionType)
        {
            return collectionType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => m.Name.StartsWith("Add") || m.Name.StartsWith("Insert") || 
                           m.Name.StartsWith("Remove") || m.Name.StartsWith("Clear"))
                .Select(m => m.Name)
                .Distinct()
                .OrderBy(name => name)
                .ToList();
        }

        /// <summary>
        /// Discover related type constructors for a main type
        /// CENTRALIZED: Moved from D365ReflectionService
        /// </summary>
        public List<Models.TypeInfo> DiscoverRelatedTypeConstructors(Type mainType)
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
            
            return relatedTypes.Distinct().ToList();
        }

        /// <summary>
        /// Build structured inheritance hierarchy mapping for concrete type resolution
        /// CENTRALIZED: Moved from D365ReflectionService
        /// </summary>
        public Dictionary<string, List<Models.TypeInfo>> BuildInheritanceHierarchy(Type mainType)
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
            
            return hierarchy;
        }
        
        /// <summary>
        /// Helper to get the most relevant base type name for inheritance display
        /// CENTRALIZED: Moved from D365ReflectionService
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
        /// Generate description for a type based on metadata attributes
        /// CENTRALIZED: Moved from D365ReflectionService
        /// </summary>
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

        /// <summary>
        /// Get comprehensive object state information using reflection
        /// CENTRALIZED: Moved from D365ReflectionService
        /// </summary>
        public Dictionary<string, object> GetObjectStateInfo(object obj)
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
                var allProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
                
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

            return stateInfo;
        }

        /// <summary>
        /// Clear all caches - useful for testing or when assemblies change
        /// </summary>
        public void ClearCaches()
        {
            _typeCache.Clear();
            _methodCache.Clear();
            _propertyCache.Clear();
            _supportedTypesCache.Clear();
            _logger.Information("🧹 Cleared all reflection caches");
        }

        #endregion
    }
}
