using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Xml;
using D365MetadataService.Models;
using Microsoft.Extensions.Logging;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Dynamic template discovery service that loads templates from VS2022 assemblies
    /// Replaces hardcoded template mappings with real-time discovery
    /// </summary>
    public class DynamicTemplateGuidanceService
    {
        private readonly ILogger _logger;
        private readonly Dictionary<string, List<TemplateOption>> _discoveredTemplates;
        private readonly string _vs2022ExtensionPath;
        private bool _initialized = false;

        public DynamicTemplateGuidanceService(ILogger logger)
        {
            _logger = logger;
            _discoveredTemplates = new Dictionary<string, List<TemplateOption>>();
            _vs2022ExtensionPath = DiscoverVS2022ExtensionPath();
        }

        /// <summary>
        /// Get template guidance for a specific object type using dynamic discovery
        /// </summary>
        public TemplateGuidance GetTemplateGuidance(string objectType)
        {
            EnsureInitialized();

            if (string.IsNullOrEmpty(objectType))
                return new TemplateGuidance { HasTemplate = false };

            if (_discoveredTemplates.TryGetValue(objectType, out var templates))
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
            EnsureInitialized();
            return !string.IsNullOrEmpty(objectType) && _discoveredTemplates.ContainsKey(objectType);
        }

        /// <summary>
        /// Initialize template discovery by loading from VS2022 assemblies
        /// </summary>
        private void EnsureInitialized()
        {
            if (_initialized) return;

            try
            {
                _logger.LogInformation("Starting dynamic template discovery from VS2022 assemblies...");
                
                if (string.IsNullOrEmpty(_vs2022ExtensionPath))
                {
                    _logger.LogWarning("VS2022 extension path not found, falling back to basic templates");
                    LoadFallbackTemplates();
                }
                else
                {
                    LoadTemplatesFromVS2022();
                }

                _initialized = true;
                _logger.LogInformation($"Template discovery completed. Found templates for {_discoveredTemplates.Count} object types.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to initialize template discovery");
                LoadFallbackTemplates();
                _initialized = true;
            }
        }

        /// <summary>
        /// Discover VS2022 extension installation path
        /// </summary>
        private string DiscoverVS2022ExtensionPath()
        {
            try
            {
                // Common VS2022 extension paths
                var possiblePaths = new[]
                {
                    @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\Extensions",
                    @"C:\Program Files (x86)\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions",
                    @"C:\Program Files (x86)\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\Extensions",
                    @"C:\Program Files (x86)\Microsoft Visual Studio\2022\Community\Common7\IDE\Extensions"
                };

                foreach (var basePath in possiblePaths)
                {
                    if (Directory.Exists(basePath))
                    {
                        // Look for D365 extension directory
                        var extensionDirs = Directory.GetDirectories(basePath, "*", SearchOption.AllDirectories)
                            .Where(d => d.Contains("Microsoft.Dynamics") || d.Contains("D365") || d.Contains("Dynamics"))
                            .ToList();

                        foreach (var extensionDir in extensionDirs)
                        {
                            // Look for assembly files that might contain templates
                            var templateAssemblies = Directory.GetFiles(extensionDir, "*.dll", SearchOption.AllDirectories)
                                .Where(f => Path.GetFileName(f).Contains("Template") || 
                                           Path.GetFileName(f).Contains("Wizard") ||
                                           Path.GetFileName(f).Contains("ItemCreation"))
                                .ToList();

                            if (templateAssemblies.Any())
                            {
                                _logger.LogInformation($"Found VS2022 D365 extension at: {extensionDir}");
                                return extensionDir;
                            }
                        }
                    }
                }

                _logger.LogWarning("VS2022 D365 extension path not found");
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error discovering VS2022 extension path");
                return null;
            }
        }

        /// <summary>
        /// Load templates from actual VS2022 assemblies using reflection
        /// </summary>
        private void LoadTemplatesFromVS2022()
        {
            try
            {
                _logger.LogInformation($"Loading templates from VS2022 path: {_vs2022ExtensionPath}");

                // Find template-related assemblies
                var templateAssemblies = Directory.GetFiles(_vs2022ExtensionPath, "*.dll", SearchOption.AllDirectories)
                    .Where(f => 
                    {
                        var fileName = Path.GetFileName(f).ToLower();
                        return fileName.Contains("template") || 
                               fileName.Contains("wizard") ||
                               fileName.Contains("itemcreation") ||
                               fileName.Contains("dynamics");
                    })
                    .ToList();

                _logger.LogInformation($"Found {templateAssemblies.Count} potential template assemblies");

                foreach (var assemblyPath in templateAssemblies)
                {
                    try
                    {
                        LoadTemplatesFromAssembly(assemblyPath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, $"Could not load templates from {Path.GetFileName(assemblyPath)}");
                    }
                }

                // Also look for .vstemplate files
                LoadTemplatesFromVSTemplateFiles();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load templates from VS2022 assemblies");
                throw;
            }
        }

        /// <summary>
        /// Load templates from a specific assembly using reflection
        /// </summary>
        private void LoadTemplatesFromAssembly(string assemblyPath)
        {
            try
            {
                var assembly = Assembly.LoadFrom(assemblyPath);
                
                // Look for ItemCreationWizard.TemplateToTypeMap or similar
                var types = assembly.GetTypes();
                
                foreach (var type in types)
                {
                    if (type.Name.Contains("TemplateToTypeMap") || 
                        type.Name.Contains("ItemCreationWizard") ||
                        type.Name.Contains("TemplateMapping"))
                    {
                        LoadTemplateMapFromType(type);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, $"Could not load assembly {Path.GetFileName(assemblyPath)}");
            }
        }

        /// <summary>
        /// Extract template mappings from a type using reflection
        /// </summary>
        private void LoadTemplateMapFromType(Type type)
        {
            try
            {
                // Look for static fields/properties that contain template mappings
                var fields = type.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                var properties = type.GetProperties(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);

                foreach (var field in fields)
                {
                    if (field.FieldType.IsGenericType && 
                        field.FieldType.GetGenericTypeDefinition() == typeof(Dictionary<,>))
                    {
                        var value = field.GetValue(null);
                        if (value is System.Collections.IDictionary dict)
                        {
                            ProcessTemplateDictionary(dict, $"{type.Name}.{field.Name}");
                        }
                    }
                }

                foreach (var property in properties)
                {
                    if (property.PropertyType.IsGenericType && 
                        property.PropertyType.GetGenericTypeDefinition() == typeof(Dictionary<,>) &&
                        property.CanRead)
                    {
                        var value = property.GetValue(null);
                        if (value is System.Collections.IDictionary dict)
                        {
                            ProcessTemplateDictionary(dict, $"{type.Name}.{property.Name}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, $"Could not load template map from type {type.Name}");
            }
        }

        /// <summary>
        /// Process a dictionary that might contain template mappings
        /// </summary>
        private void ProcessTemplateDictionary(System.Collections.IDictionary dict, string source)
        {
            try
            {
                _logger.LogDebug($"Processing template dictionary from {source} with {dict.Count} entries");

                foreach (System.Collections.DictionaryEntry entry in dict)
                {
                    var templateKey = entry.Key?.ToString();
                    var objectType = entry.Value?.ToString();

                    if (!string.IsNullOrEmpty(templateKey) && !string.IsNullOrEmpty(objectType))
                    {
                        // Convert template key to template name (remove .vstemplate extension)
                        var templateName = templateKey.Replace(".vstemplate", "");
                        
                        AddDiscoveredTemplate(objectType, templateName, source);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Error processing template dictionary from {source}");
            }
        }

        /// <summary>
        /// Look for .vstemplate files and parse them directly
        /// </summary>
        private void LoadTemplatesFromVSTemplateFiles()
        {
            try
            {
                var templateFiles = Directory.GetFiles(_vs2022ExtensionPath, "*.vstemplate", SearchOption.AllDirectories);
                
                _logger.LogInformation($"Found {templateFiles.Length} .vstemplate files");

                foreach (var templateFile in templateFiles)
                {
                    try
                    {
                        ParseVSTemplateFile(templateFile);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, $"Could not parse template file {Path.GetFileName(templateFile)}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Could not load .vstemplate files");
            }
        }

        /// <summary>
        /// Parse a .vstemplate file to extract template information
        /// </summary>
        private void ParseVSTemplateFile(string templateFilePath)
        {
            try
            {
                var doc = new XmlDocument();
                doc.Load(templateFilePath);

                var templateNode = doc.SelectSingleNode("//VSTemplate");
                if (templateNode != null)
                {
                    var typeAttr = templateNode.Attributes?["Type"]?.Value;
                    var nameNode = doc.SelectSingleNode("//Name");
                    var descriptionNode = doc.SelectSingleNode("//Description");

                    if (nameNode != null)
                    {
                        var templateName = nameNode.InnerText;
                        var fileName = Path.GetFileNameWithoutExtension(templateFilePath);
                        
                        // Try to map to object type based on file name
                        var objectType = MapTemplateFileToObjectType(fileName);
                        if (!string.IsNullOrEmpty(objectType))
                        {
                            AddDiscoveredTemplate(objectType, templateName, templateFilePath);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, $"Could not parse .vstemplate file {templateFilePath}");
            }
        }

        /// <summary>
        /// Map template file name to D365 object type
        /// </summary>
        private string MapTemplateFileToObjectType(string templateFileName)
        {
            var mappings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["Class"] = "AxClass",
                ["TestClass"] = "AxClass",
                ["RunnableClass"] = "AxClass",
                ["Interface"] = "AxClass",
                ["Table"] = "AxTable",
                ["Form"] = "AxForm",
                ["BaseEnum"] = "AxEnum",
                ["LabelFiles"] = "AxLabelFile",
                ["Query"] = "AxQuerySimple",
                ["View"] = "AxView",
                ["Map"] = "AxMap",
                ["Report"] = "AxReport"
            };

            return mappings.TryGetValue(templateFileName, out var objectType) ? objectType : null;
        }

        /// <summary>
        /// Add a discovered template to the collections
        /// </summary>
        private void AddDiscoveredTemplate(string objectType, string templateName, string source)
        {
            if (!_discoveredTemplates.ContainsKey(objectType))
            {
                _discoveredTemplates[objectType] = new List<TemplateOption>();
            }

            // Check if we already have this template
            if (_discoveredTemplates[objectType].Any(t => t.TemplateName.Equals(templateName, StringComparison.OrdinalIgnoreCase)))
            {
                return;
            }

            var templateOption = CreateTemplateOption(templateName, objectType, source);
            _discoveredTemplates[objectType].Add(templateOption);

            _logger.LogDebug($"Discovered template: {templateName} for {objectType} from {Path.GetFileName(source)}");
        }

        /// <summary>
        /// Create a template option from discovered information
        /// </summary>
        private TemplateOption CreateTemplateOption(string templateName, string objectType, string source)
        {
            // Determine template type and properties based on template name and object type
            var templateType = DetermineTemplateType(templateName, objectType);
            var description = GenerateTemplateDescription(templateName, objectType);
            var benefits = GenerateTemplateBenefits(templateName, objectType);

            var option = new TemplateOption
            {
                TemplateName = templateName,
                DisplayName = FormatDisplayName(templateName),
                Description = description,
                Type = templateType,
                RequiredParameters = GetRequiredParameters(templateName, objectType),
                OptionalParameters = GetOptionalParameters(templateName, objectType),
                Benefits = benefits
            };

            // Add source code template if applicable
            if (templateType == TemplateType.SourceCodeInitializer)
            {
                option.SourceCodeTemplate = GetSourceCodeTemplate(templateName);
            }

            return option;
        }

        /// <summary>
        /// Load fallback templates when VS2022 discovery fails
        /// </summary>
        private void LoadFallbackTemplates()
        {
            _logger.LogInformation("Loading fallback template definitions");

            // Basic fallback templates for core object types
            var fallbackMappings = new Dictionary<string, List<string>>
            {
                ["AxClass"] = new List<string> { "Class", "TestClass", "RunnableClass" },
                ["AxTable"] = new List<string> { "Table" },
                ["AxForm"] = new List<string> { "Form" },
                ["AxEnum"] = new List<string> { "BaseEnum" },
                ["AxLabelFile"] = new List<string> { "LabelFiles" },
                ["AxQuery"] = new List<string> { "Query" }
            };

            foreach (var mapping in fallbackMappings)
            {
                var objectType = mapping.Key;
                var templates = mapping.Value;

                _discoveredTemplates[objectType] = new List<TemplateOption>();

                foreach (var templateName in templates)
                {
                    var templateOption = CreateTemplateOption(templateName, objectType, "Fallback");
                    _discoveredTemplates[objectType].Add(templateOption);
                }
            }
        }

        // Helper methods for template creation...
        
        private TemplateType DetermineTemplateType(string templateName, string objectType)
        {
            // Source code templates
            if (templateName.Contains("Class") || templateName.Equals("TestClass") || templateName.Equals("RunnableClass"))
                return TemplateType.SourceCodeInitializer;
                
            // Parameter wizards
            if (templateName.Equals("LabelFiles", StringComparison.OrdinalIgnoreCase))
                return TemplateType.ParameterWizard;
                
            return TemplateType.BasicStructure;
        }

        private string GenerateTemplateDescription(string templateName, string objectType)
        {
            return templateName switch
            {
                "TestClass" => "Complete test class structure with SysTestCase inheritance",
                "RunnableClass" => "Class with main method for menu item execution", 
                "Class" => "Empty class with basic structure",
                "LabelFiles" => "Label file with language selection and validation",
                "Table" => "Basic table structure with standard fields",
                "Form" => "Basic form structure with design pattern",
                "BaseEnum" => "Enumeration with standard structure",
                _ => $"{templateName} template for {objectType}"
            };
        }

        private List<string> GenerateTemplateBenefits(string templateName, string objectType)
        {
            return templateName switch
            {
                "TestClass" => new List<string> 
                { 
                    "Pre-configured test methods with proper attributes",
                    "Setup/tearDown lifecycle methods included", 
                    "Best practices documentation and comments",
                    "SysTestCase inheritance structure"
                },
                "RunnableClass" => new List<string>
                {
                    "Pre-configured main(Args) method",
                    "Proper XML documentation structure",
                    "Ready for menu item assignment"
                },
                "LabelFiles" => new List<string>
                {
                    "Multi-language support configuration",
                    "Proper label file ID validation",
                    "Automatic file structure creation"
                },
                _ => new List<string> { $"Consistent {objectType} structure", "Best practices implementation" }
            };
        }

        private List<TemplateParameter> GetRequiredParameters(string templateName, string objectType)
        {
            if (templateName.Equals("LabelFiles", StringComparison.OrdinalIgnoreCase))
            {
                return new List<TemplateParameter>
                {
                    new TemplateParameter
                    {
                        Name = "labelFileId",
                        Type = "string",
                        Description = "Label file identifier (e.g., 'MCP', 'CUS')",
                        IsRequired = true,
                        ValidationRule = "Must not use reserved names: SYS, SYP, GLS, GLP, FPK, FPP, SLN, SLP, ISV, VAR, VAP, CUS, CUP, USR, USP, FAV, FLM, GBR, GCN, GEE, JKA, JKB, JKC, PDS, PRO, PSA, PSC, REC, RET, SPS, UPG"
                    }
                };
            }

            return new List<TemplateParameter>();
        }

        private List<TemplateParameter> GetOptionalParameters(string templateName, string objectType)
        {
            var parameters = new List<TemplateParameter>();

            if (templateName.Equals("TestClass", StringComparison.OrdinalIgnoreCase))
            {
                parameters.Add(new TemplateParameter
                {
                    Name = "testTarget",
                    Type = "string",
                    Description = "Name of class or area being tested (for documentation)",
                    IsRequired = false
                });
            }
            else if (templateName.Equals("LabelFiles", StringComparison.OrdinalIgnoreCase))
            {
                parameters.Add(new TemplateParameter
                {
                    Name = "languages",
                    Type = "array<string>",
                    Description = "Languages to create label files for",
                    IsRequired = false,
                    AllowedValues = new List<string> { "en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh", "ru" },
                    DefaultValue = new List<string> { "en" }
                });
            }

            return parameters;
        }

        private string GetSourceCodeTemplate(string templateName)
        {
            return templateName switch
            {
                "TestClass" => @"// Prefer the name of the class or area being tested with the Test suffix.
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
}}",
                "RunnableClass" => @"internal final class {0}
{{
    /// <summary>
    /// Class entry point. The system will call this method when a designated menu 
    /// is selected or when execution starts and this class is set as the startup class.
    /// </summary>
    /// <param name = ""_args"">The specified arguments.</param>
    public static void main(Args _args)
    {{
    }}
}}",
                "Class" => @"internal final class {0}
{{
}}",
                _ => null
            };
        }

        private string FormatDisplayName(string templateName)
        {
            return templateName switch
            {
                "TestClass" => "Test Class",
                "RunnableClass" => "Runnable Class",
                "Class" => "Basic Class",
                "LabelFiles" => "Label File",
                "BaseEnum" => "Base Enum",
                _ => templateName
            };
        }

        private string GetRecommendationText(string objectType, List<TemplateOption> templates)
        {
            if (templates.Any(t => t.Type == TemplateType.SourceCodeInitializer))
            {
                return $"This {objectType} has template options that provide pre-configured source code. Consider using a template for better structure and best practices.";
            }
            else if (templates.Any(t => t.Type == TemplateType.ParameterWizard))
            {
                return $"This {objectType} has template options that guide parameter configuration. Using a template ensures proper setup and validation.";
            }
            else
            {
                return $"This {objectType} has template options available for consistent structure and best practices.";
            }
        }
    }
}