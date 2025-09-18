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

                // Load the required assemblies
                var vsExtensionPath = @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions\avm13osb.viu";
                var patternsAssemblyPath = Path.Combine(vsExtensionPath, "Microsoft.Dynamics.AX.Metadata.Patterns.dll");
                var metadataAssemblyPath = Path.Combine(vsExtensionPath, "Microsoft.Dynamics.AX.Metadata.dll");

                if (!File.Exists(patternsAssemblyPath))
                {
                    _logger.Error("Patterns assembly not found at {Path}", patternsAssemblyPath);
                    return null;
                }

                if (!File.Exists(metadataAssemblyPath))
                {
                    _logger.Error("Metadata assembly not found at {Path}", metadataAssemblyPath);
                    return null;
                }

                var patternsAssembly = Assembly.LoadFrom(patternsAssemblyPath);
                var metadataAssembly = Assembly.LoadFrom(metadataAssemblyPath);
                
                var patternFactoryType = patternsAssembly.GetType("Microsoft.Dynamics.AX.Metadata.Patterns.PatternFactory");
                var axFormDesignType = metadataAssembly.GetType("Microsoft.Dynamics.AX.Metadata.MetaModel.AxFormDesign");

                if (patternFactoryType == null)
                {
                    _logger.Error("PatternFactory type not found in assembly");
                    return null;
                }

                if (axFormDesignType == null)
                {
                    _logger.Error("AxFormDesign type not found in metadata assembly");
                    return null;
                }

                // Create PatternFactory instance
                var patternFactory = Activator.CreateInstance(patternFactoryType, new object[] { true });
                _logger.Information("✅ PatternFactory created");

                // Create a dummy AxFormDesign instance to test pattern applicability
                var dummyFormDesign = Activator.CreateInstance(axFormDesignType);
                _logger.Information("✅ Dummy AxFormDesign created for pattern matching");

                // Get patterns applicable to forms using GetPatternsForTarget
                var getPatternsForTargetMethod = patternFactoryType.GetMethod("GetPatternsForTarget");
                if (getPatternsForTargetMethod == null)
                {
                    _logger.Error("GetPatternsForTarget method not found");
                    return null;
                }

                var applicablePatterns = getPatternsForTargetMethod.Invoke(patternFactory, new object[] { dummyFormDesign });
                if (applicablePatterns == null)
                {
                    _logger.Warning("GetPatternsForTarget returned null");
                    return Task.FromResult(new List<object>());
                }

                _logger.Information("🔍 Processing applicable form patterns...");

                // Convert to our format
                var patternList = new List<object>();
                var patternCollection = applicablePatterns as System.Collections.IEnumerable;

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

                _logger.Information("✅ Successfully processed {PatternCount} applicable form patterns", patternList.Count);
                
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

                // Since we used GetPatternsForTarget with AxFormDesign, all patterns returned are applicable to forms
                _logger.Debug("Including applicable form pattern: {PatternName} (Category: {Category})", name, category);

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
    }
}