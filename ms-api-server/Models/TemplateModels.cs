using System.Collections.Generic;

namespace D365MetadataService.Models
{
    /// <summary>
    /// Represents template guidance information for D365 object types
    /// </summary>
    public class TemplateGuidance
    {
        public bool HasTemplate { get; set; }
        public List<TemplateOption> AvailableTemplates { get; set; } = new List<TemplateOption>();
        public string Recommendation { get; set; }
    }

    /// <summary>
    /// Information about a specific template option
    /// </summary>
    public class TemplateOption
    {
        public string TemplateName { get; set; }
        public string DisplayName { get; set; }
        public string Description { get; set; }
        public TemplateType Type { get; set; }
        public List<TemplateParameter> RequiredParameters { get; set; } = new List<TemplateParameter>();
        public List<TemplateParameter> OptionalParameters { get; set; } = new List<TemplateParameter>();
        public List<string> Benefits { get; set; } = new List<string>();
        public string SourceCodeTemplate { get; set; }
    }

    /// <summary>
    /// Template parameter definition
    /// </summary>
    public class TemplateParameter
    {
        public string Name { get; set; }
        public string Type { get; set; }
        public string Description { get; set; }
        public bool IsRequired { get; set; }
        public List<string> AllowedValues { get; set; } = new List<string>();
        public string ValidationRule { get; set; }
        public object DefaultValue { get; set; }
    }

    /// <summary>
    /// Types of template guidance
    /// </summary>
    public enum TemplateType
    {
        SourceCodeInitializer,
        ParameterWizard,
        PropertyConfiguration,
        BasicStructure
    }

    /// <summary>
    /// Enhanced creation response that includes template guidance
    /// </summary>
    public class CreateObjectResponseWithGuidance
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public string ObjectName { get; set; }
        public string ObjectType { get; set; }
        public TemplateGuidance TemplateGuidance { get; set; }
        public string Error { get; set; }
    }

    /// <summary>
    /// Request for template guidance on a specific object type
    /// </summary>
    public class TemplateGuidanceRequest
    {
        public string ObjectType { get; set; }
        public string ObjectName { get; set; }
        public bool IncludeParameterDetails { get; set; } = true;
    }

    /// <summary>
    /// Response with template guidance information
    /// </summary>
    public class TemplateGuidanceResponse
    {
        public bool Success { get; set; }
        public string ObjectType { get; set; }
        public TemplateGuidance Guidance { get; set; }
        public string Error { get; set; }
    }
}