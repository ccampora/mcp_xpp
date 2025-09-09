using System;
using System.Collections.Generic;

namespace D365MetadataService.Models
{
    /// <summary>
    /// Represents the discovered capabilities of a D365 object type
    /// </summary>
    public class ObjectCapabilities
    {
        public string ObjectType { get; set; }
        public string TypeFullName { get; set; }
        public bool Success { get; set; }
        public string Error { get; set; }
        public List<MethodCapability> ModificationMethods { get; set; } = new List<MethodCapability>();
        
        // Alias for backward compatibility with tests
        public List<MethodCapability> Methods => ModificationMethods;
        
        public List<PropertyCapability> WritableProperties { get; set; } = new List<PropertyCapability>();
        public List<TypeInfo> RelatedTypeConstructors { get; set; } = new List<TypeInfo>();
        public DateTime DiscoveredAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Represents a modification method discovered through reflection
    /// </summary>
    public class MethodCapability
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string ReturnType { get; set; }
        public List<ParameterInfo> Parameters { get; set; } = new List<ParameterInfo>();
        public bool IsStatic { get; set; }
        public bool IsPublic { get; set; } = true;
    }

    /// <summary>
    /// Represents a writable property/collection discovered through reflection
    /// </summary>
    public class PropertyCapability
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string TypeFullName { get; set; }
        public bool CanRead { get; set; }
        public bool CanWrite { get; set; }
        public bool IsCollection { get; set; }
        public List<string> CollectionMethods { get; set; } = new List<string>();
    }

    /// <summary>
    /// Parameter information for methods and constructors
    /// </summary>
    public class ParameterInfo
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string TypeFullName { get; set; }
        public bool IsOptional { get; set; }
        public string DefaultValue { get; set; }
        public bool IsOut { get; set; }
        public bool IsRef { get; set; }
        public string Description { get; set; }
    }

    /// <summary>
    /// Type information including constructors
    /// </summary>
    public class TypeInfo
    {
        public string Name { get; set; }
        public string FullName { get; set; }
        public string Description { get; set; }
        public List<ConstructorInfo> Constructors { get; set; } = new List<ConstructorInfo>();
        public bool IsAbstract { get; set; }
        public string BaseType { get; set; }
    }

    /// <summary>
    /// Constructor information
    /// </summary>
    public class ConstructorInfo
    {
        public List<ParameterInfo> Parameters { get; set; } = new List<ParameterInfo>();
        public bool IsPublic { get; set; } = true;
    }

    /// <summary>
    /// Request for dynamic method invocation
    /// </summary>
    public class DynamicMethodCall
    {
        public string ObjectType { get; set; }  // "AxTable", "AxClass", etc.
        public string ObjectName { get; set; }  // "CustTable", "CustTableForm", etc.
        public string MethodName { get; set; }  // "AddField", "AddMethod", etc.
        public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();
        public string ProjectPath { get; set; }
    }

    /// <summary>
    /// Result of dynamic method execution
    /// </summary>
    public class DynamicExecutionResult
    {
        public bool Success { get; set; }
        public string Error { get; set; }
        public string Message { get; set; }
        public string MethodName { get; set; }
        public string ObjectName { get; set; }
        public object ReturnValue { get; set; }
        public string ReturnType { get; set; }
        public DateTime StartTime { get; set; }
        public TimeSpan ExecutionTime { get; set; }
        public Dictionary<string, object> UpdatedObjectInfo { get; set; } = new Dictionary<string, object>();
        public List<string> Warnings { get; set; } = new List<string>();
    }

    /// <summary>
    /// Result of dynamic instance creation
    /// </summary>
    public class DynamicCreationResult
    {
        public bool Success { get; set; }
        public string Error { get; set; }
        public string Message { get; set; }
        public string TypeName { get; set; }
        public object Instance { get; set; }
        public DateTime StartTime { get; set; }
        public TimeSpan ExecutionTime { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
    }

    /// <summary>
    /// Request for capability discovery
    /// </summary>
    public class CapabilityDiscoveryRequest
    {
        public string ObjectType { get; set; }  // "AxTable", "AxClass", etc.
        public bool IncludeRelatedTypes { get; set; } = true;
        public bool IncludeExamples { get; set; } = false;
        public List<string> FilterMethods { get; set; } = new List<string>(); // Filter to specific method patterns
    }

    /// <summary>
    /// Simplified method execution request for agents
    /// </summary>
    public class AgentMethodRequest
    {
        public string Action { get; set; }  // "discover", "execute", "create"
        public string ObjectType { get; set; }
        public string ObjectName { get; set; }
        public string MethodName { get; set; }
        public Dictionary<string, object> Parameters { get; set; } = new Dictionary<string, object>();
    }

    /// <summary>
    /// Agent-friendly response with discovered capabilities
    /// </summary>
    public class AgentCapabilityResponse
    {
        public bool Success { get; set; }
        public string ObjectType { get; set; }
        public string Summary { get; set; }
        public List<AgentMethodInfo> AvailableMethods { get; set; } = new List<AgentMethodInfo>();
        public List<AgentPropertyInfo> ModifiableProperties { get; set; } = new List<AgentPropertyInfo>();
        public List<AgentTypeInfo> CreatableTypes { get; set; } = new List<AgentTypeInfo>();
        public string Error { get; set; }
    }

    /// <summary>
    /// Simplified method info for agents
    /// </summary>
    public class AgentMethodInfo
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string Usage { get; set; }  // Example usage
        public List<AgentParameterInfo> RequiredParameters { get; set; } = new List<AgentParameterInfo>();
        public List<AgentParameterInfo> OptionalParameters { get; set; } = new List<AgentParameterInfo>();
        public string ReturnType { get; set; }
    }

    /// <summary>
    /// Simplified property info for agents
    /// </summary>
    public class AgentPropertyInfo
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string Description { get; set; }
        public bool IsCollection { get; set; }
        public List<string> AvailableOperations { get; set; } = new List<string>();
    }

    /// <summary>
    /// Simplified parameter info for agents
    /// </summary>
    public class AgentParameterInfo
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string Description { get; set; }
        public string ExampleValue { get; set; }
        public bool IsRequired { get; set; }
    }

    /// <summary>
    /// Simplified type info for agents
    /// </summary>
    public class AgentTypeInfo
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string Purpose { get; set; }  // "Field for string data", "Method for validation", etc.
        public List<AgentParameterInfo> ConstructorParameters { get; set; } = new List<AgentParameterInfo>();
        public string ExampleUsage { get; set; }
    }

    /// <summary>
    /// Result of executing a modification method on a D365 object
    /// </summary>
    public class ObjectModificationResult
    {
        public string ObjectType { get; set; }
        public string ObjectName { get; set; }
        public string MethodName { get; set; }
        public bool Success { get; set; }
        public string Error { get; set; }
        public string Message { get; set; }
        public string ReturnValue { get; set; }
        public string ReturnType { get; set; }
        public DateTime StartTime { get; set; } = DateTime.UtcNow;
        public TimeSpan ExecutionTime { get; set; }
    }
}
