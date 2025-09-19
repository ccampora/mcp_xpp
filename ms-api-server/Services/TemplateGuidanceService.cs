using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using D365MetadataService.Models;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Service that provides template guidance for D365 object creation
    /// Based on analysis of VS2022 template system and wizard files
    /// </summary>
    public class TemplateGuidanceService : ITemplateGuidanceService
    {
        private static readonly Dictionary<string, List<TemplateOption>> _templateMappings;

        static TemplateGuidanceService()
        {
            _templateMappings = InitializeTemplateMappings();
        }

        /// <summary>
        /// Get template guidance for a specific object type (async interface implementation)
        /// </summary>
        public Task<TemplateGuidance> GetTemplateGuidanceAsync(string objectType)
        {
            return Task.FromResult(GetTemplateGuidance(objectType));
        }

        /// <summary>
        /// Get template guidance for a specific object type
        /// </summary>
        public TemplateGuidance GetTemplateGuidance(string objectType)
        {
            if (string.IsNullOrEmpty(objectType))
                return new TemplateGuidance { HasTemplate = false };

            if (_templateMappings.TryGetValue(objectType, out var templates))
            {
                return new TemplateGuidance
                {
                    HasTemplate = true,
                    AvailableTemplates = templates,
                    Recommendation = GetRecommendationText(objectType, templates)
                };
            }

            return new TemplateGuidance { HasTemplate = false };
        }

        /// <summary>
        /// Check if an object type has any template options
        /// </summary>
        public bool HasTemplateGuidance(string objectType)
        {
            return !string.IsNullOrEmpty(objectType) && _templateMappings.ContainsKey(objectType);
        }

        /// <summary>
        /// Get all available templates for any object type
        /// </summary>
        public Dictionary<string, List<TemplateOption>> GetAllTemplates()
        {
            return new Dictionary<string, List<TemplateOption>>(_templateMappings);
        }

        private static Dictionary<string, List<TemplateOption>> InitializeTemplateMappings()
        {
            var mappings = new Dictionary<string, List<TemplateOption>>();

            // AxClass templates (source code initializers)
            mappings["AxClass"] = new List<TemplateOption>
            {
                new TemplateOption
                {
                    TemplateName = "TestClass",
                    DisplayName = "Test Class",
                    Description = "Complete test class structure with SysTestCase inheritance",
                    Type = TemplateType.SourceCodeInitializer,
                    Benefits = new List<string>
                    {
                        "Pre-configured test methods with proper attributes",
                        "Setup/tearDown lifecycle methods included",
                        "Best practices documentation and comments",
                        "SysTestCase inheritance structure"
                    },
                    OptionalParameters = new List<TemplateParameter>
                    {
                        new TemplateParameter
                        {
                            Name = "testTarget",
                            Type = "string",
                            Description = "Name of class or area being tested (for documentation)",
                            IsRequired = false
                        }
                    },
                    SourceCodeTemplate = @"// Prefer the name of the class or area being tested with the Test suffix.
// The test class must transitively extend the SysTestCase class.
// You can find more information here: https://docs.microsoft.com/en-us/dynamicsax-2012/developer/unit-test-framework
public class {0} extends SysTestCase
{{

    // Test methods must be public, take no parameters and return void.
    // Their names can start with test, or they can be adorned with the SysTestMethod attribute.
    [SysTestMethod, Hookable(false)]
    public void MyTest()
    {{
        // Use the assert* functions to check the outcomes.
        this.assertNotNull(null);
    }}

    // This is a test method because of the test prefix.
    [Hookable(false)]
    public void testSomething()
    {{
        this.assertTrue(false);
    }}

    public void setup()
    {{
        // This method will be called before every test method.
        super();
    }}

    public void tearDown()
    {{
        // This method will be called after each test method
        super();
    }}

    public void setupTestCase()
    {{
        // This method is run before any test method
        super();
    }}

    public void teardownTestCase()
    {{
        // This method is run post all test methods.
        super();
    }}
}}"
                },
                new TemplateOption
                {
                    TemplateName = "RunnableClass",
                    DisplayName = "Runnable Class",
                    Description = "Class with main method for menu item execution",
                    Type = TemplateType.SourceCodeInitializer,
                    Benefits = new List<string>
                    {
                        "Pre-configured main(Args) method",
                        "Proper XML documentation structure",
                        "Ready for menu item assignment"
                    },
                    SourceCodeTemplate = @"internal final class {0}
{{
    /// <summary>
    /// Class entry point. The system will call this method when a designated menu 
    /// is selected or when execution starts and this class is set as the startup class.
    /// </summary>
    /// <param name = ""_args"">The specified arguments.</param>
    public static void main(Args _args)
    {{
    }}
}}"
                },
                new TemplateOption
                {
                    TemplateName = "Class",
                    DisplayName = "Basic Class",
                    Description = "Empty class with basic structure",
                    Type = TemplateType.SourceCodeInitializer,
                    Benefits = new List<string>
                    {
                        "Consistent class structure",
                        "Proper access modifiers"
                    },
                    SourceCodeTemplate = @"internal final class {0}
{{
}}"
                }
            };

            // AxLabelFile templates (wizard parameters)
            mappings["AxLabelFile"] = new List<TemplateOption>
            {
                new TemplateOption
                {
                    TemplateName = "LabelFiles",
                    DisplayName = "Label File",
                    Description = "Label file with language selection and validation",
                    Type = TemplateType.ParameterWizard,
                    Benefits = new List<string>
                    {
                        "Multi-language support configuration",
                        "Proper label file ID validation",
                        "Automatic file structure creation"
                    },
                    RequiredParameters = new List<TemplateParameter>
                    {
                        new TemplateParameter
                        {
                            Name = "labelFileId",
                            Type = "string",
                            Description = "Label file identifier (e.g., 'MCP', 'CUS')",
                            IsRequired = true,
                            ValidationRule = "Must not use reserved names: SYS, SYP, GLS, GLP, FPK, FPP, SLN, SLP, ISV, VAR, VAP, CUS, CUP, USR, USP, FAV, FLM, GBR, GCN, GEE, JKA, JKB, JKC, PDS, PRO, PSA, PSC, REC, RET, SPS, UPG"
                        }
                    },
                    OptionalParameters = new List<TemplateParameter>
                    {
                        new TemplateParameter
                        {
                            Name = "languages",
                            Type = "array<string>",
                            Description = "Languages to create label files for",
                            IsRequired = false,
                            DefaultValue = new[] { "en" },
                            AllowedValues = new List<string> { "en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh", "ru" }
                        }
                    }
                }
            };

            // AxTable templates (basic structure)
            mappings["AxTable"] = new List<TemplateOption>
            {
                new TemplateOption
                {
                    TemplateName = "Table",
                    DisplayName = "Data Table",
                    Description = "Empty table structure - consider adding fields, indexes, and relations",
                    Type = TemplateType.BasicStructure,
                    Benefits = new List<string>
                    {
                        "Consistent table naming",
                        "Basic table metadata structure"
                    }
                }
            };

            // AxForm templates (basic structure)
            mappings["AxForm"] = new List<TemplateOption>
            {
                new TemplateOption
                {
                    TemplateName = "Form",
                    DisplayName = "User Interface Form",
                    Description = "Empty form structure - consider adding datasources, controls, and patterns",
                    Type = TemplateType.BasicStructure,
                    Benefits = new List<string>
                    {
                        "Consistent form naming",
                        "Basic form metadata structure",
                        "Ready for pattern application"
                    }
                }
            };

            // AxEnum templates (basic structure)  
            mappings["AxEnum"] = new List<TemplateOption>
            {
                new TemplateOption
                {
                    TemplateName = "BaseEnum",
                    DisplayName = "Enumeration",
                    Description = "Empty enumeration - consider adding enum values",
                    Type = TemplateType.BasicStructure,
                    Benefits = new List<string>
                    {
                        "Consistent enum naming",
                        "Basic enum metadata structure"
                    }
                }
            };

            return mappings;
        }

        private string GetRecommendationText(string objectType, List<TemplateOption> templates)
        {
            if (templates.Any(t => t.Type == TemplateType.SourceCodeInitializer))
            {
                return $"This {objectType} has template options that provide pre-configured source code. Consider using a template for better structure and best practices.";
            }
            
            if (templates.Any(t => t.Type == TemplateType.ParameterWizard))
            {
                return $"This {objectType} has template options that guide parameter configuration. Using a template ensures proper setup and validation.";
            }
            
            return $"This {objectType} has template guidance available for consistent creation.";
        }
    }
}