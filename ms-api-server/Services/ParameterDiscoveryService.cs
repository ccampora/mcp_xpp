using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using D365MetadataService.Models;
using Serilog;

#nullable enable

namespace D365MetadataService.Services
{
    /// <summary>
    /// Service for discovering D365 object creation parameters using reflection
    /// Reuses existing D365ReflectionManager infrastructure for property descriptions
    /// </summary>
    public class ParameterDiscoveryService
    {
        private readonly ILogger _logger;
        private readonly D365ReflectionManager _reflectionManager;
        private readonly Dictionary<string, ObjectParameterSchema> _schemaCache;

        public ParameterDiscoveryService(ILogger logger)
        {
            _logger = logger;
            _reflectionManager = D365ReflectionManager.Instance;
            _schemaCache = new Dictionary<string, ObjectParameterSchema>();
        }

        /// <summary>
        /// Discover available parameters for a specific D365 object type
        /// </summary>
        public ParameterDiscoveryResult DiscoverParameters(string objectType)
        {
            var stopwatch = Stopwatch.StartNew();
            var result = new ParameterDiscoveryResult();

            try
            {
                _logger.Information("Starting parameter discovery for object type: {ObjectType}", objectType);

                // Check cache first
                if (_schemaCache.TryGetValue(objectType, out var cachedSchema))
                {
                    _logger.Debug("Using cached schema for {ObjectType}", objectType);
                    result.Success = true;
                    result.Schema = cachedSchema;
                    result.DiscoveryTime = stopwatch.Elapsed;
                    result.ParametersAnalyzed = cachedSchema.ParameterCount;
                    return result;
                }

                // Find the type using reflection
                var type = FindObjectType(objectType);
                if (type == null)
                {
                    result.ErrorMessage = $"Object type '{objectType}' not found in loaded assemblies";
                    _logger.Warning("Object type not found: {ObjectType}", objectType);
                    return result;
                }

                // Analyze the type to build parameter schema
                var schema = AnalyzeObjectType(type);
                
                // Add usage patterns
                AddUsagePatterns(schema);

                // Cache the schema
                _schemaCache[objectType] = schema;

                result.Success = true;
                result.Schema = schema;
                result.ParametersAnalyzed = schema.ParameterCount;

                _logger.Information("Parameter discovery completed for {ObjectType}. Found {ParameterCount} parameters", 
                    objectType, schema.ParameterCount);
            }
            catch (Exception ex)
            {
                result.ErrorMessage = $"Error during parameter discovery: {ex.Message}";
                _logger.Error(ex, "Error discovering parameters for {ObjectType}", objectType);
            }
            finally
            {
                result.DiscoveryTime = stopwatch.Elapsed;
                stopwatch.Stop();
            }

            return result;
        }

        /// <summary>
        /// Find a D365 object type by name using reflection
        /// </summary>
        /// <summary>
        /// Find a D365 object type by name using the shared reflection manager
        /// </summary>
        private Type? FindObjectType(string objectTypeName)
        {
            return _reflectionManager.GetD365Type(objectTypeName);
        }

        /// <summary>
        /// Analyze a type to build its parameter schema
        /// </summary>
        private ObjectParameterSchema AnalyzeObjectType(Type type)
        {
            var schema = new ObjectParameterSchema
            {
                ObjectType = type.Name
            };

            // Get all settable properties and filter to creation-relevant ones only
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.CanWrite)
                .Where(p => IsCreationRelevantProperty(p))
                .OrderBy(p => p.Name);

            foreach (var property in properties)
            {
                var paramDef = AnalyzeProperty(property);
                schema.Parameters[property.Name] = paramDef;

                // Mark commonly used parameters as recommended
                if (IsRecommendedParameter(type.Name, property.Name))
                {
                    paramDef.IsRecommended = true;
                    schema.Recommended.Add(property.Name);
                }

                // Mark required parameters
                if (IsRequiredParameter(type.Name, property.Name))
                {
                    paramDef.IsRequired = true;
                    schema.Required.Add(property.Name);
                }
            }

            return schema;
        }

        /// <summary>
        /// Analyze a single property to create parameter definition
        /// </summary>
        private ObjectParameterDefinition AnalyzeProperty(PropertyInfo property)
        {
            var paramDef = new ObjectParameterDefinition
            {
                Name = property.Name,
                Type = property.PropertyType.Name,
                FullType = property.PropertyType.FullName ?? property.PropertyType.Name,
                CanRead = property.CanRead,
                CanWrite = property.CanWrite,
                Description = GetPropertyDescription(property),
                BusinessContext = GetBusinessContext(property.Name, property.PropertyType)
            };

            // Check if it's an enum
            if (property.PropertyType.IsEnum)
            {
                paramDef.IsEnum = true;
                paramDef.EnumValues = Enum.GetNames(property.PropertyType).ToList();
                
                // Add enum value descriptions
                foreach (var enumValue in paramDef.EnumValues)
                {
                    paramDef.EnumValueDescriptions[enumValue] = GetEnumValueDescription(property.PropertyType, enumValue);
                }

                // Set default value for enums
                var defaultEnumValue = GetDefaultEnumValue(property.PropertyType, property.Name);
                if (defaultEnumValue != null)
                {
                    paramDef.DefaultValue = defaultEnumValue;
                }
            }

            // Check if it's a collection
            var collectionInterface = property.PropertyType.GetInterfaces()
                .FirstOrDefault(i => i.IsGenericType && 
                               i.GetGenericTypeDefinition() == typeof(System.Collections.Generic.ICollection<>));
            
            if (collectionInterface != null)
            {
                paramDef.IsCollection = true;
            }

            // Add examples and common values
            AddParameterExamples(paramDef, property.PropertyType);

            return paramDef;
        }

        /// <summary>
        /// Determine if a parameter is commonly used/recommended
        /// TODO: Implement dynamic recommendation logic later
        /// </summary>
        private bool IsRecommendedParameter(string objectType, string parameterName)
        {
            // For now, no parameters are marked as recommended
            // This will be implemented with proper discovery logic later
            return false;
        }

        /// <summary>
        /// Determine if a parameter is required
        /// </summary>
        private bool IsRequiredParameter(string objectType, string parameterName)
        {
            // For most D365 objects, only Name is truly required
            return parameterName == "Name";
        }

        /// <summary>
        /// Get property description using the shared reflection manager
        /// Reuses existing infrastructure instead of duplicating description logic
        /// </summary>
        private string GetPropertyDescription(PropertyInfo property)
        {
            try
            {
                var result = _reflectionManager.GetAllPropertiesWithLabelsAndValues(
                    property.DeclaringType?.Name ?? "", null);
                
                if (result.Success)
                {
                    var propDetail = result.Properties.FirstOrDefault(p => p.Name == property.Name);
                    if (propDetail != null && !string.IsNullOrEmpty(propDetail.Description))
                    {
                        return propDetail.Description;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Debug(ex, "Could not get description for property {PropertyName}", property.Name);
            }

            // Fallback to basic descriptions for common parameters
            return GetBasicParameterDescription(property.Name, property.PropertyType);
        }

        /// <summary>
        /// Get basic description for common parameters - fallback only when reflection manager fails
        /// </summary>
        private string GetBasicParameterDescription(string parameterName, Type parameterType)
        {
            // This should only be called as a last resort when the reflection manager 
            // doesn't have description data available
            return $"Property '{parameterName}' of type {parameterType.Name}";
        }

        /// <summary>
        /// Get business context for when to use a parameter
        /// TODO: Implement dynamic business context discovery later
        /// </summary>
        private string GetBusinessContext(string parameterName, Type parameterType)
        {
            // No hardcoded business context - will be implemented dynamically later
            return string.Empty;
        }

        /// <summary>
        /// Get description for an enum value
        /// TODO: Implement dynamic enum value description discovery later
        /// </summary>
        private string GetEnumValueDescription(Type enumType, string enumValue)
        {
            // No hardcoded enum descriptions - return the enum value itself for now
            // This will be enhanced with attribute-based or dynamic descriptions later
            return enumValue;
        }

        /// <summary>
        /// Get default value for an enum parameter
        /// TODO: Implement dynamic default value discovery later
        /// </summary>
        private object? GetDefaultEnumValue(Type enumType, string parameterName)
        {
            // No hardcoded default values - will be discovered dynamically later
            return null;
        }

        /// <summary>
        /// Add examples and common values for a parameter
        /// TODO: Implement dynamic example discovery later
        /// </summary>
        private void AddParameterExamples(ObjectParameterDefinition paramDef, Type propertyType)
        {
            // No hardcoded examples - will be discovered dynamically later
            // Examples list remains empty for now
        }

        /// <summary>
        /// Add predefined usage patterns for common scenarios
        /// </summary>
        private void AddUsagePatterns(ObjectParameterSchema schema)
        {
            var patterns = GetUsagePatternsForObjectType(schema.ObjectType);
            
            foreach (var pattern in patterns)
            {
                schema.UsagePatterns[pattern.Name] = pattern;
            }
        }

        /// <summary>
        /// Get usage patterns for a specific object type
        /// TODO: Implement dynamic usage pattern discovery later
        /// </summary>
        private List<UsagePattern> GetUsagePatternsForObjectType(string objectType)
        {
            // No hardcoded usage patterns - will be discovered dynamically later
            return new List<UsagePattern>();
        }

        /// <summary>
        /// Determines if a property is relevant for object creation (first-level parameters only)
        /// Excludes collections, complex objects, and internal metadata
        /// </summary>
        private bool IsCreationRelevantProperty(PropertyInfo property)
        {
            var propertyName = property.Name;
            var propertyType = property.PropertyType;

            // EXCLUDE: Internal/metadata properties
            var excludedProperties = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Conflicts", "CompilerMetadata", "SourceCode", "UnparsableSource", 
                "TypeParameters", "Attributes", "Tags", "Help"
            };
            
            if (excludedProperties.Contains(propertyName))
                return false;

            // EXCLUDE: Collections (Methods, Fields, Relations, DataSources, etc.)
            if (IsCollectionType(propertyType))
                return false;

            // EXCLUDE: Complex D365 objects (Design, Parts, etc.)
            var excludedComplexTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "AxFormDesign", "AxFormPropertyCollection", "KeyedObjectCollection",
                "ModelSaveInfo", "AxConflict", "AxAttribute"
            };
            
            if (excludedComplexTypes.Any(excluded => propertyType.Name.Contains(excluded)))
                return false;

            // INCLUDE: Simple value types and enums for basic configuration
            if (propertyType.IsPrimitive || propertyType.IsEnum || propertyType == typeof(string))
                return true;

            // EXCLUDE: Everything else (complex objects)
            return false;
        }

        /// <summary>
        /// Check if a type represents a collection
        /// </summary>
        private bool IsCollectionType(Type type)
        {
            if (type.IsArray)
                return true;
                
            var collectionInterfaces = new[]
            {
                typeof(System.Collections.ICollection),
                typeof(System.Collections.IEnumerable),
                typeof(System.Collections.Generic.ICollection<>),
                typeof(System.Collections.Generic.IEnumerable<>)
            };
            
            return collectionInterfaces.Any(ci => 
                ci.IsAssignableFrom(type) || 
                (ci.IsGenericTypeDefinition && type.GetInterfaces()
                    .Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == ci)));
        }
    }
}