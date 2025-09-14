using System;
using System.Collections.Generic;
using System.ComponentModel;

#nullable enable

namespace D365MetadataService.Models
{
    /// <summary>
    /// Defines a single parameter for D365 object creation
    /// </summary>
    public class ObjectParameterDefinition
    {
        /// <summary>
        /// Parameter name (property name)
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Parameter type (String, Boolean, NoYes, etc.)
        /// </summary>
        public string Type { get; set; } = string.Empty;

        /// <summary>
        /// Full .NET type name for the parameter
        /// </summary>
        public string FullType { get; set; } = string.Empty;

        /// <summary>
        /// Human-readable description of the parameter
        /// </summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Whether this parameter is an enumeration
        /// </summary>
        public bool IsEnum { get; set; }

        /// <summary>
        /// Available enum values if IsEnum is true
        /// </summary>
        public List<string> EnumValues { get; set; } = new List<string>();

        /// <summary>
        /// Descriptions for each enum value
        /// </summary>
        public Dictionary<string, string> EnumValueDescriptions { get; set; } = new Dictionary<string, string>();

        /// <summary>
        /// Whether this parameter is a collection type
        /// </summary>
        public bool IsCollection { get; set; }

        /// <summary>
        /// Whether this parameter can be read
        /// </summary>
        public bool CanRead { get; set; } = true;

        /// <summary>
        /// Whether this parameter can be written to
        /// </summary>
        public bool CanWrite { get; set; } = true;

        /// <summary>
        /// Whether this parameter is required for object creation
        /// </summary>
        public bool IsRequired { get; set; }

        /// <summary>
        /// Whether this parameter is commonly used/recommended
        /// </summary>
        public bool IsRecommended { get; set; }

        /// <summary>
        /// Default value for this parameter
        /// </summary>
        public object? DefaultValue { get; set; }

        /// <summary>
        /// Usage examples for this parameter
        /// </summary>
        public List<string> Examples { get; set; } = new List<string>();

        /// <summary>
        /// Business context - when to use this parameter
        /// </summary>
        public string BusinessContext { get; set; } = string.Empty;

        /// <summary>
        /// Common values frequently used for this parameter
        /// </summary>
        public List<string> CommonValues { get; set; } = new List<string>();
    }

    /// <summary>
    /// Complete parameter schema for a specific D365 object type
    /// </summary>
    public class ObjectParameterSchema
    {
        /// <summary>
        /// D365 object type name (e.g., AxTable, AxClass)
        /// </summary>
        public string ObjectType { get; set; } = string.Empty;

        /// <summary>
        /// All available parameters for this object type
        /// </summary>
        public Dictionary<string, ObjectParameterDefinition> Parameters { get; set; } = new Dictionary<string, ObjectParameterDefinition>();

        /// <summary>
        /// Parameters that are commonly used/recommended
        /// </summary>
        public List<string> Recommended { get; set; } = new List<string>();

        /// <summary>
        /// Parameters that are required for proper object creation
        /// </summary>
        public List<string> Required { get; set; } = new List<string>();

        /// <summary>
        /// Pre-defined usage patterns for common scenarios
        /// </summary>
        public Dictionary<string, UsagePattern> UsagePatterns { get; set; } = new Dictionary<string, UsagePattern>();

        /// <summary>
        /// Total count of available parameters
        /// </summary>
        public int ParameterCount => Parameters.Count;

        /// <summary>
        /// Count of recommended parameters
        /// </summary>
        public int RecommendedCount => Recommended.Count;
    }

    /// <summary>
    /// Represents a common usage pattern for object creation
    /// </summary>
    public class UsagePattern
    {
        /// <summary>
        /// Pattern name (e.g., "MasterDataTable", "TransactionTable")
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Description of when to use this pattern
        /// </summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Parameter values for this pattern
        /// </summary>
        public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();

        /// <summary>
        /// Business scenarios where this pattern applies
        /// </summary>
        public List<string> Scenarios { get; set; } = new List<string>();
    }

    /// <summary>
    /// Result of parameter discovery operation
    /// </summary>
    public class ParameterDiscoveryResult
    {
        /// <summary>
        /// Whether the discovery was successful
        /// </summary>
        public bool Success { get; set; }

        /// <summary>
        /// Error message if discovery failed
        /// </summary>
        public string ErrorMessage { get; set; } = string.Empty;

        /// <summary>
        /// Discovered parameter schema
        /// </summary>
        public ObjectParameterSchema? Schema { get; set; }

        /// <summary>
        /// Time taken for discovery operation
        /// </summary>
        public TimeSpan DiscoveryTime { get; set; }

        /// <summary>
        /// Number of parameters analyzed
        /// </summary>
        public int ParametersAnalyzed { get; set; }
    }

    /// <summary>
    /// Enhanced object creation request with parameter discovery support
    /// </summary>
    public class EnhancedObjectCreationRequest
    {
        /// <summary>
        /// D365 object type to create
        /// </summary>
        public string ObjectType { get; set; } = string.Empty;

        /// <summary>
        /// Name of the object to create
        /// </summary>
        public string ObjectName { get; set; } = string.Empty;

        /// <summary>
        /// Output path for the created object
        /// </summary>
        public string OutputPath { get; set; } = "Models";

        /// <summary>
        /// D365 layer for the object
        /// </summary>
        public string Layer { get; set; } = "usr";

        /// <summary>
        /// Model dependencies
        /// </summary>
        public List<string> Dependencies { get; set; } = new List<string> { "ApplicationPlatform", "ApplicationFoundation" };

        /// <summary>
        /// Publisher information
        /// </summary>
        public string Publisher { get; set; } = "YourCompany";

        /// <summary>
        /// Version information
        /// </summary>
        public string Version { get; set; } = "1.0.0.0";

        /// <summary>
        /// Object-specific creation parameters
        /// </summary>
        public Dictionary<string, object> ObjectParameters { get; set; } = new Dictionary<string, object>();

        /// <summary>
        /// Whether to discover available parameters instead of creating object
        /// </summary>
        public bool DiscoverParameters { get; set; }

        /// <summary>
        /// Whether to validate parameters without creating object
        /// </summary>
        public bool ValidateOnly { get; set; }
    }
}