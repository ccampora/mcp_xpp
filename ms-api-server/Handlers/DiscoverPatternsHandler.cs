using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.IO;
using System.Reflection;
using System.Linq;
using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for discovering available D365 form patterns and their versions
    /// </summary>
    public class DiscoverPatternsHandler : IRequestHandler
    {
        private readonly ILogger _logger;

        public DiscoverPatternsHandler(ILogger logger)
        {
            _logger = logger;
        }

        public string SupportedAction => "discover_patterns";

        public async Task<ServiceResponse> HandleAsync(ServiceRequest request)
        {
            try
            {
                _logger.Information("DiscoverPatternsHandler: Starting pattern discovery");

                var patterns = await DiscoverAvailablePatternsAsync();

                if (patterns?.Any() == true)
                {
                    _logger.Information("✅ Successfully discovered {PatternCount} patterns", patterns.Count);
                    
                    return ServiceResponse.CreateSuccess(new
                    {
                        Success = true,
                        PatternCount = patterns.Count,
                        Patterns = patterns,
                        Message = $"Found {patterns.Count} available D365 form patterns"
                    });
                }
                else
                {
                    _logger.Warning("⚠️ No patterns found or pattern discovery failed");
                    return ServiceResponse.CreateSuccess(new
                    {
                        Success = false,
                        PatternCount = 0,
                        Patterns = new List<object>(),
                        Message = "No patterns found - pattern assembly may not be available"
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "💥 Pattern discovery failed");
                return ServiceResponse.CreateError($"Pattern discovery failed: {ex.Message}");
            }
        }

        private Task<List<object>> DiscoverAvailablePatternsAsync()
        {
            try
            {
                _logger.Information("🔍 Loading D365 Patterns assembly...");

                // Load the Patterns assembly
                var vsExtensionPath = @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions\avm13osb.viu";
                var patternsAssemblyPath = Path.Combine(vsExtensionPath, "Microsoft.Dynamics.AX.Metadata.Patterns.dll");

                if (!File.Exists(patternsAssemblyPath))
                {
                    _logger.Error("Patterns assembly not found at {Path}", patternsAssemblyPath);
                    return null;
                }

                var patternsAssembly = Assembly.LoadFrom(patternsAssemblyPath);
                var patternFactoryType = patternsAssembly.GetType("Microsoft.Dynamics.AX.Metadata.Patterns.PatternFactory");

                if (patternFactoryType == null)
                {
                    _logger.Error("PatternFactory type not found in assembly");
                    return null;
                }

                // Create PatternFactory instance
                var patternFactory = Activator.CreateInstance(patternFactoryType, new object[] { true });
                _logger.Information("✅ PatternFactory created");

                // Get AllPatterns property
                var allPatternsProperty = patternFactoryType.GetProperty("AllPatterns");
                if (allPatternsProperty == null)
                {
                    _logger.Error("AllPatterns property not found");
                    return null;
                }

                var allPatterns = allPatternsProperty.GetValue(patternFactory);
                if (allPatterns == null)
                {
                    _logger.Warning("AllPatterns returned null");
                    return Task.FromResult(new List<object>());
                }

                _logger.Information("🔍 Processing discovered patterns...");

                // Convert to our format
                var patternList = new List<object>();
                var patternCollection = allPatterns as System.Collections.IEnumerable;

                if (patternCollection != null)
                {
                    foreach (var pattern in patternCollection)
                    {
                        try
                        {
                            var patternInfo = ExtractPatternInfo(pattern);
                            if (patternInfo != null)
                            {
                                patternList.Add(patternInfo);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.Warning(ex, "Failed to extract info for pattern");
                        }
                    }
                }

                _logger.Information("✅ Successfully processed {PatternCount} patterns", patternList.Count);
                
                // Sort by name for better usability
                patternList = patternList.OrderBy(p => ((dynamic)p).Name).ToList();

                return Task.FromResult(patternList);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to discover patterns");
                return Task.FromResult<List<object>>(null);
            }
        }

        private object ExtractPatternInfo(object pattern)
        {
            try
            {
                var patternType = pattern.GetType();
                
                // Get pattern properties via reflection
                var nameProp = patternType.GetProperty("Name");
                var versionProp = patternType.GetProperty("Version");
                var activeProp = patternType.GetProperty("Active");
                var friendlyNameProp = patternType.GetProperty("FriendlyName");
                var categoryProp = patternType.GetProperty("Category");

                var name = nameProp?.GetValue(pattern)?.ToString();
                var version = versionProp?.GetValue(pattern)?.ToString();
                var active = activeProp?.GetValue(pattern);
                var friendlyName = friendlyNameProp?.GetValue(pattern)?.ToString();
                var category = categoryProp?.GetValue(pattern)?.ToString();

                // Only include active patterns
                if (active is bool isActive && !isActive)
                {
                    _logger.Debug("Skipping inactive pattern: {PatternName}", name);
                    return null;
                }

                // Filter to only include form patterns by checking if the pattern is applicable to forms
                if (!IsFormPattern(name, category))
                {
                    _logger.Debug("Skipping non-form pattern: {PatternName} (Category: {Category})", name, category);
                    return null;
                }

                return new
                {
                    Name = name,
                    Version = version,
                    FriendlyName = friendlyName ?? name,
                    Category = category ?? "General",
                    Active = active,
                    FullName = $"{name} {version}"
                };
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to extract pattern info");
                return null;
            }
        }

        /// <summary>
        /// Determines if a pattern is applicable to forms based on its name and category
        /// </summary>
        private bool IsFormPattern(string name, string category)
        {
            if (string.IsNullOrEmpty(name))
                return false;

            // Known form pattern names from the Visual Studio attachment
            var knownFormPatterns = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Details Master",
                "DetailsMaster",
                "Details Master w/Standard Tabs",
                "DetailsMasterTabs",
                "Details Transaction",
                "DetailsTransaction",
                "Dialog - Advanced Selection",
                "Dialog - Basic",
                "Dialog",
                "Dialog - Double Tabs",
                "DialogDoubleTabs",
                "Dialog - FastTabs",
                "DialogFastTabs",
                "Dialog - Read Only",
                "DialogReadOnly",
                "Dialog - Tabs",
                "DialogTabs",
                "Drop Dialog",
                "DropDialog",
                "Drop Dialog - Read Only",
                "DropDialogReadOnly",
                "Form Part Factbox Card",
                "FormPartFactboxCard",
                "Form Part Factbox Grid",
                "FormPartFactboxGrid",
                "Form Part Section List",
                "FormPartSectionList",
                "Form Part Section List Double",
                "FormPartSectionListDouble",
                "Hub Part Chart",
                "HubPartChart",
                "List Page",
                "ListPage",
                "Lookup - Basic",
                "Lookup w/ Preview",
                "LookupPreview",
                "Lookup w/ Tabs",
                "LookupTab",
                "Simple Details w/Fast Tabs",
                "SimpleDetails-FastTabsContainer",
                "Simple Details w/Panorama",
                "SimpleDetails-Panorama",
                "Simple Details w/Standard Tabs",
                "SimpleDetails-StandardTabsContainer",
                "Simple Details w/Toolbar and Fields",
                "SimpleDetails-ToolbarFields",
                "Simple List",
                "SimpleList",
                "Simple List and Details - List Grid",
                "SimpleListDetails-Grid",
                "Simple List and Details - Tabular Grid",
                "SimpleListDetails",
                "Simple List and Details - Tree",
                "SimpleListDetails-Tree",
                "Table of Contents",
                "TableOfContents",
                "Task Double",
                "TaskParentChild",
                "Task Single",
                "Task",
                "Wizard",
                "Workspace Operational",
                "WorkspaceOperational",
                "Workspace Operations w/Tabs",
                "WorkspaceOperationalTabs",
                "Workspace Tabbed",
                "TabbedWorkspace"
            };

            // Check if the pattern name matches any known form patterns
            return knownFormPatterns.Contains(name) || 
                   knownFormPatterns.Any(fp => name.IndexOf(fp, StringComparison.OrdinalIgnoreCase) >= 0) ||
                   // Additional check for categories that indicate form patterns
                   (category != null && (category.IndexOf("Form", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        category.IndexOf("Dialog", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        category.IndexOf("List", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                        category.IndexOf("Details", StringComparison.OrdinalIgnoreCase) >= 0));
        }
    }
}