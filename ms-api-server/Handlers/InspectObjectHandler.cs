using D365MetadataService.Models;
using D365MetadataService.Services;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.AX.Metadata.Providers;
using Microsoft.Dynamics.AX.Metadata.Service;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Serilog;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for inspecting D365 objects and returning detailed property and structure information
    /// This enables enhanced object inspection capabilities for the find_xpp_object tool
    /// </summary>
    public class InspectObjectHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly D365ReflectionManager _reflectionManager;
        
        // Circular reference tracking for safety
        private readonly ThreadLocal<HashSet<object>> _visitedObjects = new ThreadLocal<HashSet<object>>(() => new HashSet<object>());
        private readonly ThreadLocal<int> _recursionDepth = new ThreadLocal<int>(() => 0);
        private const int MAX_RECURSION_DEPTH = 5;
        private const int MAX_COLLECTION_ITEMS = 50;
        private const int MAX_PROPERTY_COUNT = 200;

        public InspectObjectHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _reflectionManager = D365ReflectionManager.Instance;
        }

        public override string SupportedAction => "inspectobject";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Inspect Object request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Extract parameters
                var objectName = request.Parameters?.ContainsKey("objectName") == true ? request.Parameters["objectName"]?.ToString() : null;
                var objectType = request.Parameters?.ContainsKey("objectType") == true ? request.Parameters["objectType"]?.ToString() : null;
                var includeProperties = request.Parameters?.ContainsKey("includeProperties") == true ? 
                    bool.Parse(request.Parameters["includeProperties"]?.ToString() ?? "true") : true;
                var includeChildren = request.Parameters?.ContainsKey("includeChildren") == true ? 
                    bool.Parse(request.Parameters["includeChildren"]?.ToString() ?? "true") : true;
                var propertyDetail = request.Parameters?.ContainsKey("propertyDetail") == true ? 
                    request.Parameters["propertyDetail"]?.ToString() ?? "simple" : "simple";

                if (string.IsNullOrEmpty(objectName))
                {
                    return ServiceResponse.CreateError("ObjectName parameter is required");
                }

                if (string.IsNullOrEmpty(objectType))
                {
                    return ServiceResponse.CreateError("ObjectType parameter is required");
                }

                // Use ReflectionManager to inspect D365 objects - direct approach
                var inspectionResult = await InspectSpecificObjectTypeUsingReflection(objectName, objectType, includeProperties, includeChildren, propertyDetail);

                return ServiceResponse.CreateSuccess(inspectionResult);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error inspecting D365 object");
                return ServiceResponse.CreateError($"Failed to inspect object: {ex.Message}");
            }
        }



        private Task<object> InspectSpecificObjectTypeUsingReflection(string objectName, string objectType,
            bool includeProperties, bool includeChildren, string propertyDetail = "simple")
        {
            try
            {
                Logger.Information("Inspecting {ObjectType} '{ObjectName}' using enhanced reflection with object instance loading", objectType, objectName);

                // Get the D365 type from reflection manager
                var axType = _reflectionManager.GetD365Type(objectType);
                if (axType == null)
                {
                    return Task.FromResult<object>(new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        Found = false,
                        Error = $"Unknown object type: {objectType}",
                        Properties = new List<object>(),
                        Collections = new Dictionary<string, object>()
                    });
                }

                // Try to load the actual object instance to get current property values
                object actualObject = null;
                bool objectLoaded = false;
                D365ObjectFactory objectFactory = null;
                
                try
                {
                    objectFactory = _reflectionManager.GetObjectFactory(_config.D365Config);
                }
                catch (Exception ex)
                {
                    Logger.Warning(ex, "Failed to get ObjectFactory from ReflectionManager, will fallback to type-only inspection");
                }
                
                if (objectFactory != null)
                {
                    try
                    {
                        actualObject = objectFactory.GetExistingObject(objectType, objectName);
                        objectLoaded = actualObject != null;
                        if (objectLoaded)
                        {
                            Logger.Information("✅ Successfully loaded actual object instance for {ObjectType}:{ObjectName}", objectType, objectName);
                        }
                        else
                        {
                            Logger.Information("⚠️ Object instance not found, will inspect type definition only for {ObjectType}:{ObjectName}", objectType, objectName);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning(ex, "Failed to load object instance for {ObjectType}:{ObjectName}, falling back to type inspection", objectType, objectName);
                    }
                }

                // Enhanced inspection with properties and collections separated like VS 2022
                var inspection = new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    Found = true,
                    ObjectLoaded = objectLoaded,
                    Properties = includeProperties ? InspectPropertiesWithValues(axType, actualObject, propertyDetail) : new List<object>(),
                    Collections = includeChildren ? InspectCollections(axType, actualObject) : new Dictionary<string, object>(),
                    Structure = InspectTypeStructure(axType),
                    Metadata = InspectTypeMetadata(axType, objectName),
                    ReflectionInfo = new
                    {
                        InspectionMode = objectLoaded ? "Enhanced Collection Separation" : "Type Reflection with Collection Discovery",
                        Note = objectLoaded ? 
                            "Properties and Collections separated like VS 2022 - Properties contains only non-collection properties, Collections contains enumerated collection contents" : 
                            "Object instance not available, using type discovery with collection separation",
                        ObjectFactoryAvailable = objectFactory != null,
                        CollectionSeparationEnabled = true
                    }
                };

                return Task.FromResult<object>(inspection);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error inspecting object type {ObjectType} for {ObjectName} using enhanced reflection", objectType, objectName);
                return Task.FromResult<object>(new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    Found = false,
                    Error = ex.Message,
                    Properties = new List<object>(),
                    Collections = new Dictionary<string, object>()
                });
            }
        }

        private List<object> InspectPropertiesWithValues(Type type, object objectInstance, string propertyDetail = "detailed")
        {
            var properties = new List<object>();
            
            try
            {
                var propertyInfos = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => !IsCollectionType(p.PropertyType)) // FILTER OUT COLLECTIONS - they go to Collections section
                    .ToArray();

                Logger.Debug("Found {Count} non-collection properties for {TypeName}", propertyInfos.Length, type.Name);

                // PERFORMANCE OPTIMIZATION: Get all property labels and descriptions in ONE call
                // instead of calling GetAllPropertiesWithLabelsAndValues for each property
                var allPropertyDetails = _reflectionManager.GetAllPropertiesWithLabelsAndValues(type.Name);
                Dictionary<string, (string Label, string Description)> propertyLabelDescCache = new();
                
                if (allPropertyDetails.Success && allPropertyDetails.Properties != null)
                {
                    // Cache all property labels and descriptions for fast lookup
                    foreach (var propDetail in allPropertyDetails.Properties)
                    {
                        propertyLabelDescCache[propDetail.Name] = (propDetail.Label, propDetail.Description);
                    }
                    Logger.Debug("✅ Cached labels and descriptions for {Count} properties from single VS2022 lookup", 
                        propertyLabelDescCache.Count);
                }
                else
                {
                    Logger.Warning("❌ Failed to get property details for {TypeName}: {Error}", 
                        type.Name, allPropertyDetails.Error ?? "Unknown error");
                }

                foreach (var prop in propertyInfos)
                {
                    object currentValue = null;
                    string currentValueString = "<not available>";
                    bool valueRetrieved = false;

                    // Try to get current value from object instance
                    if (objectInstance != null && prop.CanRead)
                    {
                        try
                        {
                            currentValue = prop.GetValue(objectInstance);
                            currentValueString = currentValue?.ToString() ?? "<null>";
                            valueRetrieved = true;
                        }
                        catch (Exception ex)
                        {
                            currentValueString = $"<error: {ex.Message}>";
                        }
                    }

                    // For enum properties, discover all possible values
                    var possibleValues = new List<string>();
                    bool isEnum = false;
                    
                    if (prop.PropertyType.IsEnum)
                    {
                        isEnum = true;
                        try
                        {
                            possibleValues = Enum.GetNames(prop.PropertyType).ToList();
                        }
                        catch (Exception ex)
                        {
                            Logger.Warning(ex, "Failed to get enum values for property {PropertyName} of type {PropertyType}", prop.Name, prop.PropertyType.Name);
                        }
                    }
                    // Check if it's a nullable enum
                    else if (prop.PropertyType.IsGenericType && 
                             prop.PropertyType.GetGenericTypeDefinition() == typeof(Nullable<>) &&
                             prop.PropertyType.GetGenericArguments()[0].IsEnum)
                    {
                        isEnum = true;
                        try
                        {
                            var enumType = prop.PropertyType.GetGenericArguments()[0];
                            possibleValues = Enum.GetNames(enumType).ToList();
                        }
                        catch (Exception ex)
                        {
                            Logger.Warning(ex, "Failed to get nullable enum values for property {PropertyName}", prop.Name);
                        }
                    }
                    // SPECIAL CASE: For D365 enum properties, try to get the actual enum values
                    else
                    {
                        var d365EnumValues = GetEnumPossibleValues(prop);
                        if (d365EnumValues?.Any() == true)
                        {
                            possibleValues = d365EnumValues;
                            isEnum = true;
                        }
                    }

                    var (label, description) = GetPropertyLabelAndDescriptionFromCache(prop, propertyLabelDescCache);
                    
                    // DEBUG: Log description retrieval for first few properties to verify Label vs Description are different
                    if (properties.Count < 5)
                    {
                        Logger.Information("🔍 Property '{PropertyName}' label: '{Label}', description: '{Description}'", 
                            prop.Name, label ?? "(null)", description ?? "(null)");
                    }

                    var propInfo = new
                    {
                        Name = prop.Name,
                        Type = prop.PropertyType.Name,
                        FullType = prop.PropertyType.FullName,
                        CurrentValue = currentValueString,
                        ValueRetrieved = valueRetrieved,
                        Label = label,
                        Description = description,
                        IsEnum = isEnum,
                        PossibleValues = possibleValues.Any() ? possibleValues : null,
                        IsReadOnly = !prop.CanWrite,
                        HasSetter = prop.CanWrite,
                        HasGetter = prop.CanRead,
                        IsCollection = IsCollectionType(prop.PropertyType),
                        IsNullable = IsNullableType(prop.PropertyType),
                        DefaultValue = GetDefaultValue(prop.PropertyType)
                    };
                    
                    properties.Add(propInfo);
                }
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Error inspecting properties with values for {TypeName}", type.Name);
            }

            return properties;
        }

        private List<object> InspectTypeProperties(Type type)
        {
            var properties = new List<object>();
            
            try
            {
                var propertyInfos = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);

                // PERFORMANCE OPTIMIZATION: Get all property descriptions in ONE call
                var allPropertyDetails = _reflectionManager.GetAllPropertiesWithLabelsAndValues(type.Name);
                Dictionary<string, (string Label, string Description)> propertyLabelDescCache = new();
                
                if (allPropertyDetails.Success && allPropertyDetails.Properties != null)
                {
                    // Cache all property labels and descriptions for fast lookup
                    foreach (var propDetail in allPropertyDetails.Properties)
                    {
                        propertyLabelDescCache[propDetail.Name] = (propDetail.Label, propDetail.Description);
                    }
                }

                foreach (var prop in propertyInfos)
                {
                    var (_, description) = GetPropertyLabelAndDescriptionFromCache(prop, propertyLabelDescCache);
                    
                    var propInfo = new
                    {
                        Name = prop.Name,
                        Type = prop.PropertyType.Name,
                        FullType = prop.PropertyType.FullName,
                        Description = description,
                        IsReadOnly = !prop.CanWrite,
                        HasSetter = prop.CanWrite,
                        HasGetter = prop.CanRead,
                        IsCollection = IsCollectionType(prop.PropertyType),
                        IsNullable = IsNullableType(prop.PropertyType),
                        DefaultValue = GetDefaultValue(prop.PropertyType)
                    };
                    properties.Add(propInfo);
                }
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Error inspecting type properties for {TypeName}", type.Name);
            }

            return properties;
        }

        private bool IsCollectionType(Type type)
        {
            // Exclude strings from being treated as collections (even though they implement IEnumerable<char>)
            if (type == typeof(string))
                return false;
                
            return type.IsGenericType || 
                   type.IsArray || 
                   type.Name.Contains("Collection") ||
                   type.Name.Contains("List") ||
                   typeof(System.Collections.IEnumerable).IsAssignableFrom(type);
        }

        private bool IsNullableType(Type type)
        {
            return type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Nullable<>);
        }

        private string GetDefaultValue(Type type)
        {
            try
            {
                if (type.IsValueType && !IsNullableType(type))
                {
                    var defaultValue = Activator.CreateInstance(type);
                    return defaultValue?.ToString() ?? "<default>";
                }
                return "<null>";
            }
            catch
            {
                return "<unknown>";
            }
        }

        private object InspectCollections(Type type, object objectInstance)
        {
            var collections = new Dictionary<string, object>();
            
            try
            {
                Logger.Information("🔍 Dynamic collection discovery for {TypeName}", type.Name);

                var collectionProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => IsCollectionType(p.PropertyType))
                    .ToArray();

                Logger.Information("Found {Count} collection properties on {TypeName}", collectionProperties.Length, type.Name);

                foreach (var collectionProp in collectionProperties)
                {
                    try
                    {
                        Logger.Debug("Inspecting collection property: {PropertyName} of type {PropertyType}", 
                            collectionProp.Name, collectionProp.PropertyType.Name);

                        var itemNames = GetCollectionItemNames(collectionProp, objectInstance);
                        var elementType = GetCollectionElementType(collectionProp.PropertyType);
                        var count = GetCollectionCount(collectionProp, objectInstance);

                        // Structure matches VS 2022 organization: Collections as dictionary with named sections
                        collections[collectionProp.Name] = new
                        {
                            ItemType = elementType,
                            Count = count,
                            Items = itemNames
                        };

                        Logger.Debug("✅ Successfully processed collection: {PropertyName} with {Count} items", 
                            collectionProp.Name, count);
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning(ex, "⚠️ Error processing collection property {PropertyName}", collectionProp.Name);
                        
                        // Add error info but don't fail the entire operation
                        collections[collectionProp.Name] = new
                        {
                            ItemType = GetCollectionElementType(collectionProp.PropertyType),
                            Count = 0,
                            Items = new List<string>(),
                            Error = ex.Message
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "❌ Error during dynamic collection discovery for {TypeName}", type.Name);
            }

            Logger.Information("✅ Dynamic collection discovery complete: found {Count} collections", collections.Count);
            return collections;
        }

        private string GetCollectionElementType(Type collectionType)
        {
            try
            {
                if (collectionType.IsGenericType)
                {
                    var genericArgs = collectionType.GetGenericArguments();
                    return genericArgs.FirstOrDefault()?.Name ?? "Unknown";
                }
                
                if (collectionType.IsArray)
                {
                    return collectionType.GetElementType()?.Name ?? "Unknown";
                }
                
                // For other collection types, try to infer from interfaces
                var enumerableInterface = collectionType.GetInterfaces()
                    .FirstOrDefault(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IEnumerable<>));
                
                if (enumerableInterface != null)
                {
                    return enumerableInterface.GetGenericArguments().FirstOrDefault()?.Name ?? "Unknown";
                }
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Could not determine element type for {CollectionType}", collectionType.Name);
            }
            
            return "Unknown";
        }

        /// <summary>
        /// Helper method to get collection item names with optional limits
        /// </summary>
        /// <param name="collectionProp">The collection property to inspect</param>
        /// <param name="objectInstance">The object instance containing the collection</param>
        /// <param name="maxItems">Maximum number of items to return. If null, no limits are applied.</param>
        /// <returns>List of collection item names</returns>
        private List<string> GetCollectionItemNames(PropertyInfo collectionProp, object objectInstance)
        {
            var itemNames = new List<string>();
            
            try
            {
                if (objectInstance == null || !collectionProp.CanRead)
                    return itemNames;

                var collection = collectionProp.GetValue(objectInstance);
                if (collection == null)
                    return itemNames;

                // Special handling for string properties - they implement IEnumerable<char> but we want the whole string
                if (collection is string stringValue)
                {
                    if (!string.IsNullOrEmpty(stringValue))
                    {
                        itemNames.Add(stringValue);
                    }
                    return itemNames;
                }

                // Iterate through collection items with optional limits
                if (collection is System.Collections.IEnumerable enumerable)
                {
                    var count = 0;
                    foreach (var item in enumerable)
                    {
                        try
                        {
                            // Extract the name/identifier from each collection item
                            var itemName = ExtractItemIdentifier(item);
                            if (!string.IsNullOrEmpty(itemName))
                            {
                                itemNames.Add(itemName);
                            }
                            count++;
                        }
                        catch (Exception ex)
                        {
                            Logger.Debug(ex, "Error extracting name from collection item {Count}", count);
                            itemNames.Add($"<error accessing item {count}>");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Error getting collection item names for {PropertyName}", collectionProp.Name);
                itemNames.Add($"<error: {ex.Message.Substring(0, Math.Min(50, ex.Message.Length))}>");
            }

            return itemNames;
        }

        private string ExtractItemIdentifier(object item)
        {
            if (item == null)
                return "<null>";

            try
            {
                var itemType = item.GetType();
                
                // Try common identifier properties in order of preference
                var identifierProperties = new[] { "Name", "Label", "Title", "Key", "Id", "Description" };
                
                foreach (var propName in identifierProperties)
                {
                    try
                    {
                        var prop = itemType.GetProperty(propName, BindingFlags.Public | BindingFlags.Instance);
                        if (prop != null && prop.CanRead)
                        {
                            var value = prop.GetValue(item);
                            if (value != null)
                            {
                                var stringValue = value.ToString();
                                if (!string.IsNullOrEmpty(stringValue) && stringValue != itemType.Name)
                                {
                                    return stringValue;
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Debug(ex, "Error accessing property {PropertyName} on item of type {ItemType}", propName, itemType.Name);
                    }
                }

                // Fallback: return the type name
                return itemType.Name;
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Error extracting identifier from item");
                return $"<error: {ex.Message.Substring(0, Math.Min(30, ex.Message.Length))}>";
            }
        }

        private bool IsCircularReference(object obj)
        {
            if (obj == null)
                return false;

            return _visitedObjects.Value.Contains(obj) || _recursionDepth.Value > MAX_RECURSION_DEPTH;
        }

        private object ExtractCollectionItemInfoSafely(object item)
        {
            if (item == null)
                return new { Type = "null", Summary = "null item" };

            try
            {
                var itemType = item.GetType();
                var itemInfo = new Dictionary<string, object>
                {
                    ["Type"] = itemType.Name,
                    ["FullType"] = itemType.FullName
                };

                // Try to get common identification properties safely
                var identityProperties = new[] { "Name", "Label", "Description", "Title", "Id" };
                
                foreach (var propName in identityProperties)
                {
                    try
                    {
                        var prop = itemType.GetProperty(propName, BindingFlags.Public | BindingFlags.Instance);
                        if (prop != null && prop.CanRead && prop.PropertyType == typeof(string))
                        {
                            var value = prop.GetValue(item) as string;
                            if (!string.IsNullOrEmpty(value))
                            {
                                itemInfo[propName] = value;
                                if (string.IsNullOrEmpty(itemInfo["Summary"] as string))
                                {
                                    itemInfo["Summary"] = $"{propName}: {value}";
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Debug(ex, "Error accessing property {PropertyName} on collection item", propName);
                    }
                }

                // If no summary was found, use type name
                if (!itemInfo.ContainsKey("Summary"))
                {
                    itemInfo["Summary"] = itemType.Name;
                }

                // Add reference information if this looks like a D365 object
                if (IsD365ObjectReferenceByNamespace(itemType.FullName))
                {
                    itemInfo["IsD365Reference"] = true;
                    itemInfo["Namespace"] = itemType.Namespace;
                }

                return itemInfo;
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Error extracting collection item info safely");
                return new 
                { 
                    Type = item?.GetType().Name ?? "unknown", 
                    Summary = "Error extracting item info: " + ex.Message.Substring(0, Math.Min(30, ex.Message.Length)),
                    Error = true
                };
            }
        }

        private bool IsD365ObjectReferenceByNamespace(string fullTypeName)
        {
            if (string.IsNullOrEmpty(fullTypeName))
                return false;

            // Check for D365 namespaces dynamically
            return fullTypeName.StartsWith("Microsoft.Dynamics.AX", StringComparison.OrdinalIgnoreCase) ||
                   fullTypeName.StartsWith("Microsoft.Dynamics.BusinessPlatform", StringComparison.OrdinalIgnoreCase) ||
                   fullTypeName.ToLowerInvariant().Contains("ax");
        }

        private int GetCollectionCount(PropertyInfo collectionProp, object objectInstance)
        {
            try
            {
                if (objectInstance == null || !collectionProp.CanRead)
                    return 0;

                var collection = collectionProp.GetValue(objectInstance);
                if (collection == null)
                    return 0;

                // Try to get Count property
                var countProperty = collection.GetType().GetProperty("Count");
                if (countProperty != null)
                {
                    var count = countProperty.GetValue(collection);
                    if (count is int intCount)
                        return intCount;
                }

                // Fallback: count by enumeration (with safety limit)
                if (collection is System.Collections.IEnumerable enumerable)
                {
                    var count = 0;
                    foreach (var item in enumerable)
                    {
                        count++;
                        if (count > 1000) // Safety limit
                        {
                            Logger.Warning("Collection {PropertyName} has more than 1000 items, stopping count", collectionProp.Name);
                            return 1000;
                        }
                    }
                    return count;
                }
            }
            catch (Exception ex)
            {
                Logger.Debug(ex, "Could not get count for collection {PropertyName}", collectionProp.Name);
            }

            return 0;
        }

        private object ExtractCollectionItemInfo(object item)
        {
            // Delegate to the safer version with better error handling
            return ExtractCollectionItemInfoSafely(item);
        }

        private List<object> InspectTypeCollections(Type type)
        {
            var collections = new List<object>();
            
            try
            {
                // Look for collection properties that might contain child objects
                var collectionProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => IsCollectionType(p.PropertyType));

                foreach (var prop in collectionProperties)
                {
                    var collectionInfo = new
                    {
                        PropertyName = prop.Name,
                        PropertyType = prop.PropertyType.Name,
                        FullType = prop.PropertyType.FullName,
                        IsGeneric = prop.PropertyType.IsGenericType,
                        ElementType = prop.PropertyType.IsGenericType ? 
                            prop.PropertyType.GetGenericArguments().FirstOrDefault()?.Name : 
                            prop.PropertyType.GetElementType()?.Name,
                        IsReadOnly = !prop.CanWrite,
                        PotentialChildObjects = true
                    };
                    collections.Add(collectionInfo);
                }
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Error inspecting type collections for {TypeName}", type.Name);
            }

            return collections;
        }

        private object InspectTypeStructure(Type type)
        {
            try
            {
                return new
                {
                    TypeName = type.Name,
                    FullTypeName = type.FullName,
                    Assembly = type.Assembly.GetName().Name,
                    BaseType = type.BaseType?.Name,
                    Interfaces = type.GetInterfaces().Select(i => i.Name).Take(10).ToList(), // Limit interfaces
                    IsAbstract = type.IsAbstract,
                    IsSealed = type.IsSealed,
                    IsPublic = type.IsPublic,
                    IsGeneric = type.IsGenericType,
                    PropertyCount = type.GetProperties(BindingFlags.Public | BindingFlags.Instance).Length,
                    MethodCount = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).Length,
                    FieldCount = type.GetFields(BindingFlags.Public | BindingFlags.Instance).Length,
                    ConstructorCount = type.GetConstructors().Length
                };
            }
            catch (Exception ex)
            {
                return new { Error = ex.Message };
            }
        }

        private object InspectTypeMetadata(Type type, string objectName)
        {
            try
            {
                // Get concise metadata without redundancy
                var metadata = new Dictionary<string, object>();

                // Only include metadata that's NOT already in main properties
                var reflectionMeta = new
                {
                    ObjectName = objectName,
                    TypeName = type.Name,
                    Namespace = type.Namespace,
                    Module = type.Module.Name,
                    AssemblyLocation = type.Assembly.Location,
                    IsD365Type = type.Namespace?.StartsWith("Microsoft.Dynamics") == true,
                    
                    // Summary stats instead of full duplication
                    PropertySummary = new
                    {
                        TotalProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance).Length,
                        ReadWriteProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance).Count(p => p.CanRead && p.CanWrite),
                        ReadOnlyProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance).Count(p => p.CanRead && !p.CanWrite),
                        VirtualProperties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance).Count(p => p.GetMethod?.IsVirtual == true)
                    }
                };

                metadata["ReflectionMetadata"] = reflectionMeta;
                return metadata;
            }
            catch (Exception ex)
            {
                return new { Error = ex.Message };
            }
        }

        /// <summary>
        /// Get both property label and description from pre-fetched cache for optimal performance
        /// Returns tuple with (Label, Description)
        /// </summary>
        private (string Label, string Description) GetPropertyLabelAndDescriptionFromCache(PropertyInfo prop, 
            Dictionary<string, (string Label, string Description)> cache)
        {
            // Try to get from cache first
            if (cache.TryGetValue(prop.Name, out var cachedResult))
            {
                return cachedResult;
            }

            // Fallback to original method if not in cache
            return GetPropertyLabelAndDescription(prop, "Unknown");
        }

        /// <summary>
        /// Get both property label and description with a single VS2022 lookup for efficiency
        /// Returns tuple with (Label, Description)
        /// </summary>
        private (string Label, string Description) GetPropertyLabelAndDescription(PropertyInfo prop, string objectTypeName)
        {
            try
            {
                var declaringTypeName = prop.DeclaringType?.Name;
                var declaringTypeFullName = prop.DeclaringType?.FullName;
                
                Logger.Debug("🔍 Getting label and description for property '{PropertyName}' declared in type '{DeclaringType}' (full: '{FullType}') for object '{ObjectType}'", 
                    prop.Name, declaringTypeName, declaringTypeFullName, objectTypeName);

                // Single VS2022 MetaModel lookup for both label and description
                var propertyDiscovery = _reflectionManager.GetAllPropertiesWithLabelsAndValues(objectTypeName);
                if (propertyDiscovery.Success)
                {
                    var propertyDetail = propertyDiscovery.Properties.FirstOrDefault(p => p.Name == prop.Name);
                    if (propertyDetail != null)
                    {
                        var label = propertyDetail.Label;
                        var description = propertyDetail.Description;

                        Logger.Debug("✅ Found property data for {PropertyName}: Label='{Label}', Description='{Description}'", 
                            prop.Name, label ?? "(null)", description ?? "(null)");

                        // Return both values from single lookup
                        return (label, description);
                    }
                    else
                    {
                        Logger.Debug("❌ No property detail found for {PropertyName} in {ObjectType} (checked {Count} properties)", 
                            prop.Name, objectTypeName, propertyDiscovery.Properties.Count);
                    }
                }
                else
                {
                    Logger.Warning("❌ Property discovery failed for {ObjectType}: {Error}", objectTypeName, propertyDiscovery.Error);
                }

                // Fallback to reflection-based attribute scanning for both label and description
                string fallbackLabel = null;
                string fallbackDescription = null;

                // Check for Description attribute
                var descriptionAttribute = prop.GetCustomAttribute<System.ComponentModel.DescriptionAttribute>();
                if (descriptionAttribute != null && !string.IsNullOrEmpty(descriptionAttribute.Description))
                {
                    fallbackDescription = descriptionAttribute.Description;
                }

                // Check for DisplayName attribute  
                var displayNameAttribute = prop.GetCustomAttribute<System.ComponentModel.DisplayNameAttribute>();
                if (displayNameAttribute != null && !string.IsNullOrEmpty(displayNameAttribute.DisplayName))
                {
                    fallbackLabel = displayNameAttribute.DisplayName;
                    // If no description found, use DisplayName as fallback description too
                    if (string.IsNullOrEmpty(fallbackDescription))
                    {
                        fallbackDescription = displayNameAttribute.DisplayName;
                    }
                }

                // Check for Display attribute (DataAnnotations)
                var displayAttribute = prop.GetCustomAttribute<System.ComponentModel.DataAnnotations.DisplayAttribute>();
                if (displayAttribute != null)
                {
                    if (string.IsNullOrEmpty(fallbackLabel) && !string.IsNullOrEmpty(displayAttribute.Name))
                    {
                        fallbackLabel = displayAttribute.Name;
                    }
                    if (string.IsNullOrEmpty(fallbackDescription) && !string.IsNullOrEmpty(displayAttribute.Description))
                    {
                        fallbackDescription = displayAttribute.Description;
                    }
                    if (string.IsNullOrEmpty(fallbackDescription) && !string.IsNullOrEmpty(displayAttribute.Name))
                    {
                        fallbackDescription = displayAttribute.Name;
                    }
                }

                // Look through all custom attributes for description-like properties as final fallback
                if (string.IsNullOrEmpty(fallbackDescription))
                {
                    var customAttributes = prop.GetCustomAttributes(false);
                    foreach (var attr in customAttributes)
                    {
                        var attrType = attr.GetType();
                        
                        // Check for properties that might contain descriptions
                        foreach (var propName in new[] { "Description", "Summary", "Help", "Tooltip", "Label" })
                        {
                            var descProp = attrType.GetProperty(propName, BindingFlags.Public | BindingFlags.Instance);
                            if (descProp != null && descProp.PropertyType == typeof(string))
                            {
                                var value = descProp.GetValue(attr) as string;
                                if (!string.IsNullOrEmpty(value))
                                {
                                    fallbackDescription = value;
                                    break;
                                }
                            }
                        }
                        if (!string.IsNullOrEmpty(fallbackDescription)) break;
                    }
                }

                return (fallbackLabel, fallbackDescription);
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Error getting label and description for property {PropertyName}", prop.Name);
                return (null, null);
            }
        }

        /// <summary>
        /// Extract enum possible values for any enum property (works for all object types)
        /// This enables agents to get enum values directly without separate inspection calls
        /// </summary>
        private List<string> GetEnumPossibleValues(PropertyInfo prop)
        {
            try
            {
                Logger.Debug("🎯 Checking property {PropertyName} of type {PropertyType} for enum values", 
                    prop.Name, prop.PropertyType.Name);

                // Strategy 1: Direct .NET enum
                if (prop.PropertyType.IsEnum)
                {
                    try
                    {
                        var enumValues = Enum.GetNames(prop.PropertyType).ToList();
                        Logger.Information("✅ Found direct enum values for {PropertyName}: {Count} values", 
                            prop.Name, enumValues.Count);
                        return enumValues;
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning(ex, "Failed to get direct enum values for {PropertyName}", prop.Name);
                    }
                }

                // Strategy 2: Nullable enum
                if (prop.PropertyType.IsGenericType && 
                    prop.PropertyType.GetGenericTypeDefinition() == typeof(Nullable<>) &&
                    prop.PropertyType.GetGenericArguments()[0].IsEnum)
                {
                    try
                    {
                        var enumType = prop.PropertyType.GetGenericArguments()[0];
                        var enumValues = Enum.GetNames(enumType).ToList();
                        Logger.Information("✅ Found nullable enum values for {PropertyName}: {Count} values", 
                            prop.Name, enumValues.Count);
                        return enumValues;
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning(ex, "Failed to get nullable enum values for {PropertyName}", prop.Name);
                    }
                }

                // Strategy 3: D365 enum types (like TableType, RecordCacheLevel, etc.)
                // Try to find corresponding .NET enum in D365 assemblies
                if (IsLikelyD365EnumType(prop.PropertyType))
                {
                    try
                    {
                        var d365Assembly = _reflectionManager.GetD365MetadataAssembly();
                        var enumType = FindCorrespondingD365Enum(prop.PropertyType, d365Assembly);
                        
                        if (enumType != null)
                        {
                            var enumValues = Enum.GetNames(enumType).ToList();
                            Logger.Information("✅ Found D365 enum values for {PropertyName} via {EnumType}: {Count} values", 
                                prop.Name, enumType.Name, enumValues.Count);
                            return enumValues;
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning(ex, "Failed to get D365 enum values for {PropertyName}", prop.Name);
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Error getting enum possible values for property {PropertyName}", prop.Name);
                return null;
            }
        }

        /// <summary>
        /// Check if a property type looks like a D365 enum type
        /// </summary>
        private bool IsLikelyD365EnumType(Type propertyType)
        {
            // D365 enum types are usually in Microsoft.Dynamics.AX.Metadata namespaces
            // and have names like TableType, RecordCacheLevel, etc.
            return propertyType.Namespace?.Contains("Microsoft.Dynamics.AX.Metadata") == true ||
                   propertyType.Name.EndsWith("_ITxt") ||
                   // Common D365 enum names
                   new[] { "TableType", "RecordCacheLevel", "TableGroup", "ConfigurationKeyAccess", 
                          "NoYes", "CompilerVisibility", "AnalysisUsage" }.Contains(propertyType.Name);
        }

        /// <summary>
        /// Find the corresponding .NET enum for a D365 enum type
        /// </summary>
        private Type FindCorrespondingD365Enum(Type propertyType, Assembly d365Assembly)
        {
            // Try exact name match first
            var enumType = d365Assembly.GetTypes()
                .FirstOrDefault(t => t.IsEnum && t.Name == propertyType.Name);
            
            if (enumType != null)
                return enumType;

            // Try without _ITxt suffix
            if (propertyType.Name.EndsWith("_ITxt"))
            {
                var baseName = propertyType.Name.Replace("_ITxt", "");
                enumType = d365Assembly.GetTypes()
                    .FirstOrDefault(t => t.IsEnum && t.Name == baseName);
                
                if (enumType != null)
                    return enumType;
            }

            // Try with common variations
            var variations = new[] { 
                propertyType.Name,
                propertyType.Name + "Enum",
                "Ax" + propertyType.Name
            };

            foreach (var variation in variations)
            {
                enumType = d365Assembly.GetTypes()
                    .FirstOrDefault(t => t.IsEnum && t.Name.Equals(variation, StringComparison.OrdinalIgnoreCase));
                
                if (enumType != null)
                    return enumType;
            }

            return null;
        }

        /// <summary>
        /// Check if a property is a utility/metadata property that shouldn't have enum value extraction
        /// </summary>
        private bool IsUtilityProperty(string propertyName)
        {
            var utilityProperties = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Name", "Label", "Help", "Tags", "ConfigurationKey", "CountryRegionCodes", 
                "HelpText", "Conflicts", "DisplayLength", "EnumValues"
            };
            
            return utilityProperties.Contains(propertyName);
        }

        /// <summary>
        /// Get summary information about an object - counts only, no detailed content
        /// This is the new default inspection mode for better performance
        /// </summary>
        public async Task<object> GetObjectSummaryAsync(string objectName, string objectType)
        {
            try
            {
                Logger.Information("Getting summary for {ObjectType} '{ObjectName}'", objectType, objectName);

                // Get the D365 type from reflection manager
                var axType = _reflectionManager.GetD365Type(objectType);
                if (axType == null)
                {
                    return new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        Found = false,
                        Error = $"Object type '{objectType}' not found"
                    };
                }

                // Load the object instance using existing pattern
                object actualObject = null;
                bool objectLoaded = false;
                D365ObjectFactory objectFactory = null;
                
                try
                {
                    objectFactory = _reflectionManager.GetObjectFactory(_config.D365Config);
                    if (objectFactory != null)
                    {
                        actualObject = objectFactory.GetExistingObject(objectType, objectName);
                        objectLoaded = actualObject != null;
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warning(ex, "Failed to load object instance for summary");
                }

                if (!objectLoaded)
                {
                    return new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        Found = false,
                        Error = $"Object '{objectName}' of type '{objectType}' not found"
                    };
                }

                // Get property counts - separate Properties (non-collections) from Collections
                var allProperties = axType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => p.CanRead)
                    .ToList();

                var nonCollectionProperties = allProperties
                    .Where(p => !IsCollectionType(p.PropertyType))
                    .ToList();

                var collectionProperties = allProperties
                    .Where(p => IsCollectionType(p.PropertyType))
                    .ToList();

                // Get collection summaries with counts
                var collectionSummaries = new Dictionary<string, object>();
                foreach (var collectionProp in collectionProperties)
                {
                    try
                    {
                        var collection = collectionProp.GetValue(actualObject);
                        var count = GetCollectionCount(collection);
                        var itemType = GetCollectionItemTypeName(collection);

                        collectionSummaries[collectionProp.Name] = new
                        {
                            ItemType = itemType,
                            Count = count,
                            Available = count > 0
                        };
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning(ex, "Error getting collection summary for {PropertyName}", collectionProp.Name);
                        collectionSummaries[collectionProp.Name] = new
                        {
                            ItemType = "Unknown",
                            Count = 0,
                            Available = false,
                            Error = ex.Message
                        };
                    }
                }

                return new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    Found = true,
                    ObjectLoaded = objectLoaded,
                    Summary = new
                    {
                        PropertiesCount = nonCollectionProperties.Count,
                        CollectionsCount = collectionProperties.Count,
                        TotalCollectionItems = collectionSummaries.Values
                            .Where(c => ((dynamic)c).Count is int count)
                            .Sum(c => ((dynamic)c).Count)
                    },
                    Properties = new
                    {
                        Count = nonCollectionProperties.Count,
                        Available = true
                    },
                    Collections = collectionSummaries
                };
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting object summary for {ObjectType} '{ObjectName}'", objectType, objectName);
                return new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    Found = false,
                    Error = ex.Message
                };
            }
        }

        /// <summary>
        /// Get only the Properties section for an object - all non-collection properties
        /// </summary>
        public Task<object> GetObjectPropertiesAsync(string objectName, string objectType)
        {
            try
            {
                Logger.Information("Getting properties for {ObjectType} '{ObjectName}'", objectType, objectName);

                // Get the D365 type from reflection manager
                var axType = _reflectionManager.GetD365Type(objectType);
                if (axType == null)
                {
                    return Task.FromResult<object>(new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        Found = false,
                        Error = $"Object type '{objectType}' not found"
                    });
                }

                // Load the object instance using existing pattern
                object actualObject = null;
                bool objectLoaded = false;
                D365ObjectFactory objectFactory = null;
                
                try
                {
                    objectFactory = _reflectionManager.GetObjectFactory(_config.D365Config);
                    if (objectFactory != null)
                    {
                        actualObject = objectFactory.GetExistingObject(objectType, objectName);
                        objectLoaded = actualObject != null;
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warning(ex, "Failed to load object instance for properties");
                }

                if (!objectLoaded)
                {
                    return Task.FromResult<object>(new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        Found = false,
                        Error = $"Object '{objectName}' of type '{objectType}' not found"
                    });
                }

                // Get properties using existing logic from InspectPropertiesWithValues
                var properties = InspectPropertiesWithValues(axType, actualObject, "full");

                return Task.FromResult<object>(new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    Found = true,
                    ObjectLoaded = objectLoaded,
                    Properties = properties
                });
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting properties for {ObjectType} '{ObjectName}'", objectType, objectName);
                return Task.FromResult<object>(new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    Found = false,
                    Error = ex.Message
                });
            }
        }

        /// <summary>
        /// Get a specific collection by name for an object - full details without limits
        /// </summary>
        public Task<object> GetObjectCollectionAsync(string objectName, string objectType, string collectionName)
        {
            try
            {
                Logger.Information("Getting collection '{CollectionName}' for {ObjectType} '{ObjectName}'", collectionName, objectType, objectName);

                // Get the D365 type from reflection manager
                var axType = _reflectionManager.GetD365Type(objectType);
                if (axType == null)
                {
                    return Task.FromResult<object>(new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        CollectionName = collectionName,
                        Found = false,
                        Error = $"Object type '{objectType}' not found"
                    });
                }

                // Load the object instance using existing pattern
                object actualObject = null;
                bool objectLoaded = false;
                D365ObjectFactory objectFactory = null;
                
                try
                {
                    objectFactory = _reflectionManager.GetObjectFactory(_config.D365Config);
                    if (objectFactory != null)
                    {
                        actualObject = objectFactory.GetExistingObject(objectType, objectName);
                        objectLoaded = actualObject != null;
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warning(ex, "Failed to load object instance for collection");
                }

                if (!objectLoaded)
                {
                    return Task.FromResult<object>(new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        CollectionName = collectionName,
                        Found = false,
                        Error = $"Object '{objectName}' of type '{objectType}' not found"
                    });
                }

                // Find the specific collection property
                var collectionProperty = axType.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => p.CanRead && IsCollectionType(p.PropertyType))
                    .FirstOrDefault(p => p.Name.Equals(collectionName, StringComparison.OrdinalIgnoreCase));

                if (collectionProperty == null)
                {
                    return Task.FromResult<object>(new
                    {
                        ObjectName = objectName,
                        ObjectType = objectType,
                        CollectionName = collectionName,
                        Found = false,
                        Error = $"Collection '{collectionName}' not found on object type '{objectType}'"
                    });
                }

                var collection = collectionProperty.GetValue(actualObject);
                var itemType = GetCollectionItemTypeName(collection);
                var itemNames = GetCollectionItemNames(collectionProperty, actualObject);

                return Task.FromResult<object>(new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    CollectionName = collectionProperty.Name,
                    Found = true,
                    Collection = new
                    {
                        ItemType = itemType,
                        Count = itemNames.Count,
                        Items = itemNames
                    }
                });
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting collection '{CollectionName}' for {ObjectType} '{ObjectName}'", collectionName, objectType, objectName);
                return Task.FromResult<object>(new
                {
                    ObjectName = objectName,
                    ObjectType = objectType,
                    CollectionName = collectionName,
                    Found = false,
                    Error = ex.Message
                });
            }
        }

        /// <summary>
        /// Helper method to get collection count
        /// </summary>
        private int GetCollectionCount(object collection)
        {
            if (collection == null) return 0;

            // Handle string specially
            if (collection is string str)
            {
                return string.IsNullOrEmpty(str) ? 0 : 1;
            }

            // Handle ICollection<T>
            if (collection is System.Collections.ICollection genericCollection)
            {
                return genericCollection.Count;
            }

            // Handle IEnumerable by counting
            if (collection is System.Collections.IEnumerable enumerable)
            {
                var count = 0;
                foreach (var item in enumerable)
                {
                    count++;
                }
                return count;
            }

            return 0;
        }

        /// <summary>
        /// Helper method to get collection item type name from the collection instance
        /// </summary>
        private string GetCollectionItemTypeName(object collection)
        {
            if (collection == null)
                return "Unknown";

            // Handle string specially
            if (collection is string)
                return "String";

            try
            {
                var collectionType = collection.GetType();
                
                // Check if it's a generic collection
                if (collectionType.IsGenericType)
                {
                    var genericArgs = collectionType.GetGenericArguments();
                    if (genericArgs.Length > 0)
                    {
                        return genericArgs[0].Name;
                    }
                }

                // For non-generic collections, try to get type from first item
                if (collection is System.Collections.IEnumerable enumerable)
                {
                    foreach (var item in enumerable)
                    {
                        if (item != null)
                        {
                            return item.GetType().Name;
                        }
                        break; // Only check first item
                    }
                }

                // Fallback to collection type name
                return collectionType.Name.Replace("Collection", "").Replace("List", "").Replace("`1", "");
            }
            catch
            {
                return "Unknown";
            }
        }


    }
}
