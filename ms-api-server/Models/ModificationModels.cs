using System;
using System.Collections.Generic;

namespace D365MetadataService.Models
{
    // Enumerations
    // NOTE: This enum should ideally be generated from reflection rather than hardcoded
    // TODO: Replace with dynamic object type discovery from D365 metadata assemblies
    public enum ObjectType
    {
        AxTable,
        AxClass,
        AxForm,
        AxTableExtension,
        AxClassExtension,
        AxFormExtension,
        AxEnum,
        AxView,
        AxQuery
    }

    public enum ModificationOperation
    {
        AddField,
        AddMethod,
        AddRelation,
        AddIndex,
        AddFieldGroup,
        AddControl,
        AddDataSource,
        AddMember,
        AddImplements,
        AddAttribute
    }

    public enum MethodAccessLevel
    {
        Public,
        Protected,
        Private
    }

    public enum FieldType
    {
        String,
        Integer,
        Real,
        Date,
        DateTime,
        Boolean,
        Enum,
        RecId,
        Container
    }

    // Request Models
    public class ObjectModificationRequest
    {
        public string ObjectName { get; set; }
        public ObjectType ObjectType { get; set; }
        public ModificationOperation Operation { get; set; }
        public Dictionary<string, object> Parameters { get; set; }
        public string ProjectPath { get; set; }
    }

    // Field Models
    public class FieldProperties
    {
        public string Name { get; set; }
        public string Label { get; set; }
        public string HelpText { get; set; }
        public bool Mandatory { get; set; }
        public int StringLength { get; set; } = 255; // For string fields
        public bool AllowEdit { get; set; } = true;
        public string ExtendedDataType { get; set; }
        public bool AllowEditOnCreate { get; set; } = true;
        public string ConfigurationKey { get; set; }
        public bool Visible { get; set; } = true;
    }

    public class FieldDefinition
    {
        public string Name { get; set; }
        public FieldType FieldType { get; set; }
        public FieldProperties Properties { get; set; }
    }

    // Method Models
    public class ParameterDefinition
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public bool IsOptional { get; set; }
        public string DefaultValue { get; set; }
    }

    public class MethodDefinition
    {
        public string Name { get; set; }
        public MethodAccessLevel AccessLevel { get; set; }
        public string ReturnType { get; set; } = "void";
        public List<ParameterDefinition> Parameters { get; set; } = new List<ParameterDefinition>();
        public string MethodBody { get; set; }
        public bool IsStatic { get; set; }
        public string Documentation { get; set; }
        public bool IsAbstract { get; set; }
        public bool IsVirtual { get; set; }
        public bool IsOverride { get; set; }
    }

    // Relation Models  
    public class RelationDefinition
    {
        public string Name { get; set; }
        public string RelatedTable { get; set; }
        public List<RelationConstraint> Constraints { get; set; } = new List<RelationConstraint>();
        public bool IsNavigationProperty { get; set; }
        public string RelationType { get; set; } = "Normal";
    }

    public class RelationConstraint
    {
        public string Field { get; set; }
        public string RelatedField { get; set; }
    }

    // Index Models
    public class IndexDefinition
    {
        public string Name { get; set; }
        public List<string> Fields { get; set; } = new List<string>();
        public bool IsUnique { get; set; }
        public bool IsClustered { get; set; }
        public string ConfigurationKey { get; set; }
    }

    // Field Group Models
    public class FieldGroupDefinition
    {
        public string Name { get; set; }
        public string Label { get; set; }
        public List<string> Fields { get; set; } = new List<string>();
    }

    // Member Models (for classes)
    public class MemberDefinition
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public MethodAccessLevel AccessLevel { get; set; }
        public bool IsStatic { get; set; }
        public string InitialValue { get; set; }
    }

    // Extension Models
    public class TableExtensionDefinition
    {
        public string Name { get; set; }
        public string ExtendedTable { get; set; }
        public string Publisher { get; set; }
        public string Version { get; set; } = "1.0.0.0";
        public List<string> Dependencies { get; set; } = GetDefaultDependencies();
        
        /// <summary>
        /// NO HARDCODING: Get default dependencies dynamically or return minimal set
        /// </summary>
        private static List<string> GetDefaultDependencies()
        {
            // TODO: Could be made dynamic by analyzing common dependencies in existing models
            // For now, return the most minimal essential dependencies
            return new List<string> { "ApplicationPlatform" };
        }
    }

    public class ClassExtensionDefinition
    {
        public string Name { get; set; }
        public string ExtendedClass { get; set; }
        public string Publisher { get; set; }
        public string Version { get; set; } = "1.0.0.0";
        public List<string> Dependencies { get; set; } = GetDefaultDependencies();
        
        /// <summary>
        /// NO HARDCODING: Get default dependencies dynamically or return minimal set
        /// </summary>
        private static List<string> GetDefaultDependencies()
        {
            // TODO: Could be made dynamic by analyzing common dependencies in existing models
            // For now, return the most minimal essential dependencies
            return new List<string> { "ApplicationPlatform" };
        }
    }

    // Result Models
    public class ModificationResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
        public string ObjectPath { get; set; }
        public TimeSpan ExecutionTime { get; set; }
        public object Result { get; set; }
    }

    public class FieldAdditionResult : ModificationResult
    {
        public string FieldName { get; set; }
        public FieldType FieldType { get; set; }
        public int TotalFields { get; set; }
    }

    public class MethodAdditionResult : ModificationResult
    {
        public string MethodName { get; set; }
        public MethodAccessLevel AccessLevel { get; set; }
        public int TotalMethods { get; set; }
    }

    public class RelationAdditionResult : ModificationResult
    {
        public string RelationName { get; set; }
        public string RelatedTable { get; set; }
        public int TotalRelations { get; set; }
    }

    public class IndexAdditionResult : ModificationResult
    {
        public string IndexName { get; set; }
        public bool IsUnique { get; set; }
        public int TotalIndexes { get; set; }
    }

    public class FieldGroupAdditionResult : ModificationResult
    {
        public string FieldGroupName { get; set; }
        public int FieldCount { get; set; }
        public int TotalFieldGroups { get; set; }
    }

    public class MemberAdditionResult : ModificationResult
    {
        public string MemberName { get; set; }
        public string MemberType { get; set; }
        public int TotalMembers { get; set; }
    }

    public class ExtensionCreationResult : ModificationResult
    {
        public string ExtensionName { get; set; }
        public string ExtendedObject { get; set; }
        public ObjectType ExtensionType { get; set; }
    }

    public class ValidationResult
    {
        public bool IsValid { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
    }

    public class CompilationResult
    {
        public bool Success { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
        public TimeSpan CompilationTime { get; set; }
    }

    // Error Models
    public class ErrorDetails
    {
        public string ErrorCode { get; set; }
        public string ErrorMessage { get; set; }
        public string Context { get; set; }
        public string Suggestion { get; set; }
        public Dictionary<string, object> AdditionalInfo { get; set; } = new Dictionary<string, object>();
    }
}
