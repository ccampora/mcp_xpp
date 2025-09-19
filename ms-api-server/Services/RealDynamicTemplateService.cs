using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using D365MetadataService.Models;

namespace D365MetadataService.Services
{
    /// <summary>
    /// REAL dynamic template discovery that reads VS2022 assemblies and .vstemplate files
    /// NO MORE HARDCODING!
    /// </summary>
    public class RealDynamicTemplateService : ITemplateGuidanceService
    {
        private readonly ILogger<RealDynamicTemplateService> _logger;
        private readonly string _vs2022Path;
        private readonly Dictionary<string, List<TemplateOption>> _liveTemplates;
        private bool _discoveryComplete = false;

        public RealDynamicTemplateService(ILogger<RealDynamicTemplateService> logger)
        {
            _logger = logger;
            _liveTemplates = new Dictionary<string, List<TemplateOption>>();
            _vs2022Path = FindVS2022Installation();
            
            // Start background discovery
            _ = Task.Run(PerformRealTimeDiscovery);
        }

        public async Task<TemplateGuidance> GetTemplateGuidanceAsync(string objectType)
        {
            try
            {
                // Ensure discovery has run
                await EnsureDiscoveryComplete();

                if (_liveTemplates.TryGetValue(objectType, out var templates) && templates.Any())
                {
                    return new TemplateGuidance
                    {
                        HasTemplate = true,
                        AvailableTemplates = templates,
                        Recommendation = $"Templates discovered from VS2022 installation at {_vs2022Path}"
                    };
                }

                _logger.LogInformation($"No live templates discovered for {objectType}");
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in real template discovery for {objectType}");
                return null;
            }
        }

        private string FindVS2022Installation()
        {
            var candidates = new[]
            {
                Environment.GetEnvironmentVariable("VS2022InstallDir"),
                @"C:\Program Files\Microsoft Visual Studio\2022\Professional",
                @"C:\Program Files\Microsoft Visual Studio\2022\Enterprise",
                @"C:\Program Files\Microsoft Visual Studio\2022\Community"
            };

            foreach (var path in candidates.Where(p => !string.IsNullOrEmpty(p)))
            {
                if (Directory.Exists(path))
                {
                    _logger.LogInformation($"Found VS2022 at: {path}");
                    return path;
                }
            }

            _logger.LogError("VS2022 installation not found!");
            return null;
        }

        private async Task PerformRealTimeDiscovery()
        {
            if (string.IsNullOrEmpty(_vs2022Path))
            {
                _logger.LogWarning("Cannot perform template discovery - VS2022 path not found");
                _discoveryComplete = true;
                return;
            }

            try
            {
                _logger.LogInformation("Starting REAL template discovery from VS2022...");

                // Find D365 extension
                var extensionPath = await FindD365Extension();
                if (string.IsNullOrEmpty(extensionPath))
                {
                    _logger.LogWarning("D365 extension not found");
                    _discoveryComplete = true;
                    return;
                }

                // Discover templates from assemblies
                await DiscoverFromAssemblies(extensionPath);
                
                // Discover templates from .vstemplate files
                DiscoverFromTemplateFiles(extensionPath);

                _logger.LogInformation($"Template discovery complete. Found {_liveTemplates.Sum(kvp => kvp.Value.Count)} templates across {_liveTemplates.Count} object types");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during real template discovery");
            }
            finally
            {
                _discoveryComplete = true;
            }
        }

        private async Task<string> FindD365Extension()
        {
            var extensionsPath = Path.Combine(_vs2022Path, "Common7", "IDE", "Extensions");
            if (!Directory.Exists(extensionsPath))
                return null;

            var directories = Directory.GetDirectories(extensionsPath);
            foreach (var dir in directories)
            {
                // Look for D365-specific files
                var d365Files = Directory.GetFiles(dir, "*Dynamics*", SearchOption.AllDirectories)
                    .Concat(Directory.GetFiles(dir, "*AX*", SearchOption.AllDirectories))
                    .ToArray();

                if (d365Files.Length > 5) // Arbitrary threshold
                {
                    _logger.LogInformation($"Found D365 extension at: {dir}");
                    return dir;
                }
            }

            return null;
        }

        private async Task DiscoverFromAssemblies(string extensionPath)
        {
            try
            {
                var assemblyFiles = Directory.GetFiles(extensionPath, "*.dll", SearchOption.AllDirectories)
                    .Where(f => f.Contains("Dynamics") || f.Contains("Template") || f.Contains("Wizard"))
                    .ToArray();

                _logger.LogInformation($"Scanning {assemblyFiles.Length} assemblies for templates...");

                foreach (var assemblyFile in assemblyFiles)
                {
                    try
                    {
                        await ScanAssemblyForTemplates(assemblyFile);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug($"Could not scan {Path.GetFileName(assemblyFile)}: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error discovering from assemblies");
            }
        }

        private async Task ScanAssemblyForTemplates(string assemblyPath)
        {
            try
            {
                var assembly = Assembly.LoadFrom(assemblyPath);
                var types = assembly.GetTypes();

                foreach (var type in types)
                {
                    // Look for template mapping fields/properties
                    var templateMappings = ExtractTemplateMappings(type);
                    if (templateMappings.Any())
                    {
                        ProcessDiscoveredMappings(templateMappings);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug($"Error scanning assembly {Path.GetFileName(assemblyPath)}: {ex.Message}");
            }
        }

        private Dictionary<string, string> ExtractTemplateMappings(Type type)
        {
            var mappings = new Dictionary<string, string>();

            try
            {
                // Look for static dictionaries containing template mappings
                var fields = type.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                    .Where(f => f.FieldType == typeof(Dictionary<string, string>) || 
                               f.Name.Contains("Template") || f.Name.Contains("Map"))
                    .ToArray();

                foreach (var field in fields)
                {
                    try
                    {
                        var value = field.GetValue(null);
                        if (value is Dictionary<string, string> dict)
                        {
                            foreach (var kvp in dict.Where(kvp => kvp.Key.EndsWith(".vstemplate")))
                            {
                                mappings[kvp.Key] = kvp.Value;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug($"Could not read field {field.Name}: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug($"Error extracting template mappings from {type.Name}: {ex.Message}");
            }

            return mappings;
        }

        private void ProcessDiscoveredMappings(Dictionary<string, string> mappings)
        {
            foreach (var kvp in mappings)
            {
                var templateName = kvp.Key.Replace(".vstemplate", "");
                var objectType = kvp.Value;

                if (!_liveTemplates.ContainsKey(objectType))
                {
                    _liveTemplates[objectType] = new List<TemplateOption>();
                }

                // Create basic template option (will be enhanced by .vstemplate file discovery)
                var template = new TemplateOption
                {
                    TemplateName = templateName,
                    DisplayName = FormatDisplayName(templateName),
                    Description = $"Template discovered from VS2022 assembly",
                    Type = DetermineTemplateType(templateName),
                    RequiredParameters = new List<TemplateParameter>(),
                    OptionalParameters = new List<TemplateParameter>(),
                    Benefits = new List<string> { "Discovered from VS2022 installation" },
                    SourceCodeTemplate = null
                };

                _liveTemplates[objectType].Add(template);
                _logger.LogDebug($"Discovered template mapping: {templateName} -> {objectType}");
            }
        }

        private void DiscoverFromTemplateFiles(string extensionPath)
        {
            try
            {
                var templateFiles = Directory.GetFiles(extensionPath, "*.vstemplate", SearchOption.AllDirectories);
                _logger.LogInformation($"Scanning {templateFiles.Length} .vstemplate files...");

                foreach (var templateFile in templateFiles)
                {
                    ProcessVSTemplateFile(templateFile);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error discovering from template files");
            }
        }

        private void ProcessVSTemplateFile(string templatePath)
        {
            try
            {
                var content = File.ReadAllText(templatePath);
                var doc = XDocument.Parse(content);

                var templateData = doc.Root?.Element("TemplateData");
                if (templateData == null) return;

                var name = templateData.Element("Name")?.Value;
                var description = templateData.Element("Description")?.Value;
                
                if (!string.IsNullOrEmpty(name))
                {
                    // Try to match with discovered templates and enhance them
                    EnhanceTemplateWithVSTemplateData(name, description, doc);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug($"Error processing template file {Path.GetFileName(templatePath)}: {ex.Message}");
            }
        }

        private void EnhanceTemplateWithVSTemplateData(string templateName, string description, XDocument templateDoc)
        {
            // Find existing template and enhance it
            foreach (var objectTemplates in _liveTemplates.Values)
            {
                var existingTemplate = objectTemplates.FirstOrDefault(t => 
                    t.TemplateName.Equals(templateName, StringComparison.OrdinalIgnoreCase));
                
                if (existingTemplate != null)
                {
                    existingTemplate.Description = description ?? existingTemplate.Description;
                    
                    // Try to extract more information from the template
                    ExtractTemplateParameters(existingTemplate, templateDoc);
                    ExtractSourceCodeTemplate(existingTemplate, templateDoc);
                    
                    _logger.LogDebug($"Enhanced template {templateName} with .vstemplate data");
                    break;
                }
            }
        }

        private void ExtractTemplateParameters(TemplateOption template, XDocument templateDoc)
        {
            // TODO: Parse wizard data and custom parameters
            // This would analyze the template XML for parameter definitions
        }

        private void ExtractSourceCodeTemplate(TemplateOption template, XDocument templateDoc)
        {
            // TODO: Extract source code templates from template content
            // This would look for template content files and source code patterns
        }

        private string FormatDisplayName(string templateName)
        {
            return templateName.Replace("Class", " Class")
                              .Replace("Enum", " Enum")
                              .Replace("Table", " Table")
                              .Replace("Form", " Form");
        }

        private TemplateType DetermineTemplateType(string templateName)
        {
            if (templateName.Contains("Class") || templateName.Contains("Test") || templateName.Contains("Runnable"))
                return TemplateType.SourceCodeInitializer;
                
            if (templateName.Contains("Label") || templateName.Contains("Config"))
                return TemplateType.ParameterWizard;
                
            return TemplateType.BasicStructure;
        }

        private async Task EnsureDiscoveryComplete()
        {
            var timeout = TimeSpan.FromSeconds(30);
            var start = DateTime.UtcNow;
            
            while (!_discoveryComplete && DateTime.UtcNow - start < timeout)
            {
                await Task.Delay(100);
            }

            if (!_discoveryComplete)
            {
                _logger.LogWarning("Template discovery did not complete within timeout");
            }
        }
    }
}