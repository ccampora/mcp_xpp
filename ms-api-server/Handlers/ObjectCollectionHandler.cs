using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for getting a specific collection of an object
    /// Returns full details of a named collection without limits
    /// </summary>
    public class ObjectCollectionHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;
        private readonly InspectObjectHandler _inspectHandler;

        public ObjectCollectionHandler(ServiceConfiguration config, ILogger logger) 
            : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _inspectHandler = new InspectObjectHandler(config, logger);
        }

        public override string SupportedAction => "objectcollection";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return validationError;

            Logger.Information("Handling Object Collection request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Extract parameters
                var objectName = request.Parameters?.ContainsKey("objectName") == true ? request.Parameters["objectName"]?.ToString() : null;
                var objectType = request.Parameters?.ContainsKey("objectType") == true ? request.Parameters["objectType"]?.ToString() : null;
                var collectionName = request.Parameters?.ContainsKey("collectionName") == true ? request.Parameters["collectionName"]?.ToString() : null;
                var filterPattern = request.Parameters?.ContainsKey("filterPattern") == true ? request.Parameters["filterPattern"]?.ToString() : null;

                if (string.IsNullOrEmpty(objectName))
                {
                    return ServiceResponse.CreateError("ObjectName parameter is required");
                }

                if (string.IsNullOrEmpty(objectType))
                {
                    return ServiceResponse.CreateError("ObjectType parameter is required");
                }

                if (string.IsNullOrEmpty(collectionName))
                {
                    return ServiceResponse.CreateError("CollectionName parameter is required");
                }

                // Get the collection using existing method
                var collectionResult = await _inspectHandler.GetObjectCollectionAsync(objectName, objectType, collectionName);
                
                // Apply filtering if filterPattern is provided
                if (!string.IsNullOrEmpty(filterPattern) && collectionResult != null)
                {
                    collectionResult = ApplyFilterToCollectionResult(collectionResult, filterPattern);
                }

                return ServiceResponse.CreateSuccess(collectionResult);
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error getting object collection");
                return ServiceResponse.CreateError($"Failed to get object collection: {ex.Message}");
            }
        }

        /// <summary>
        /// Apply wildcard filtering to collection results
        /// </summary>
        private object ApplyFilterToCollectionResult(object collectionResult, string filterPattern)
        {
            try
            {
                var resultType = collectionResult.GetType();
                
                // Check if this is the expected collection result format with nested Collection
                var collectionProperty = resultType.GetProperty("Collection");
                if (collectionProperty == null)
                {
                    Logger.Warning("Collection result does not have Collection property, cannot apply filter");
                    return collectionResult;
                }

                var collection = collectionProperty.GetValue(collectionResult);
                if (collection == null)
                {
                    Logger.Warning("Collection property is null, cannot apply filter");
                    return collectionResult;
                }

                var itemsProperty = collection.GetType().GetProperty("Items");
                if (itemsProperty == null)
                {
                    Logger.Warning("Collection does not have Items property, cannot apply filter");
                    return collectionResult;
                }

                var items = itemsProperty.GetValue(collection);
                if (items is not System.Collections.IEnumerable enumerable)
                {
                    Logger.Warning("Items property is not enumerable, cannot apply filter");
                    return collectionResult;
                }

                // Apply wildcard filter to string items
                var originalItems = enumerable.Cast<object>().ToList();
                var filteredItems = originalItems.Where(item => 
                {
                    var itemName = item?.ToString();
                    return MatchesWildcardPattern(itemName, filterPattern);
                }).ToList();

                Logger.Information("🔍 Filtered {TotalCount} items to {FilteredCount} using pattern '{FilterPattern}'", 
                    originalItems.Count, filteredItems.Count, filterPattern);

                // Create new result object with filtered collection
                var filteredResult = new
                {
                    ObjectName = GetPropertyValue(collectionResult, "ObjectName"),
                    ObjectType = GetPropertyValue(collectionResult, "ObjectType"),
                    CollectionName = GetPropertyValue(collectionResult, "CollectionName"),
                    Found = GetPropertyValue(collectionResult, "Found"),
                    FilterPattern = filterPattern,
                    Collection = new
                    {
                        ItemType = GetPropertyValue(collection, "ItemType"),
                        Count = filteredItems.Count,
                        Items = filteredItems
                    }
                };

                return filteredResult;
            }
            catch (Exception ex)
            {
                Logger.Warning(ex, "Failed to apply filter to collection result, returning original");
                return collectionResult;
            }
        }

        /// <summary>
        /// Helper to get property value safely
        /// </summary>
        private object GetPropertyValue(object obj, string propertyName)
        {
            return obj?.GetType().GetProperty(propertyName)?.GetValue(obj);
        }

        /// <summary>
        /// Check if a string matches a wildcard pattern
        /// Supports * (any characters) and ? (single character) wildcards
        /// </summary>
        private bool MatchesWildcardPattern(string text, string pattern)
        {
            if (string.IsNullOrEmpty(pattern))
                return true; // No filter means match all
                
            if (string.IsNullOrEmpty(text))
                return false;
                
            // If pattern has no wildcards, do simple case-insensitive contains match
            if (!pattern.Contains('*') && !pattern.Contains('?'))
            {
                return text.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0;
            }
                
            return IsWildcardMatch(text, pattern, 0, 0);
        }

        /// <summary>
        /// Recursive wildcard matching implementation
        /// </summary>
        private bool IsWildcardMatch(string text, string pattern, int textIndex, int patternIndex)
        {
            // End of pattern reached
            if (patternIndex >= pattern.Length)
                return textIndex >= text.Length;
                
            // End of text but more pattern characters
            if (textIndex >= text.Length)
            {
                // Only valid if remaining pattern is all '*'
                for (int i = patternIndex; i < pattern.Length; i++)
                {
                    if (pattern[i] != '*')
                        return false;
                }
                return true;
            }

            char patternChar = pattern[patternIndex];
            char textChar = text[textIndex];

            switch (patternChar)
            {
                case '*':
                    // Try matching zero characters (skip *)
                    if (IsWildcardMatch(text, pattern, textIndex, patternIndex + 1))
                        return true;
                    // Try matching one or more characters
                    return IsWildcardMatch(text, pattern, textIndex + 1, patternIndex);
                    
                case '?':
                    // Match single character
                    return IsWildcardMatch(text, pattern, textIndex + 1, patternIndex + 1);
                    
                default:
                    // Exact character match (case-insensitive)
                    if (char.ToLowerInvariant(textChar) == char.ToLowerInvariant(patternChar))
                        return IsWildcardMatch(text, pattern, textIndex + 1, patternIndex + 1);
                    return false;
            }
        }
    }
}