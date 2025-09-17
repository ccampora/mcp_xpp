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
    /// Handler for D365 form creation with pattern support
    /// Cleanly separated from CreateObjectHandler to handle form-specific logic
    /// </summary>
    public class CreateFormHandler : IRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;
        private readonly D365ControlFactory _controlFactory;
        private readonly ILogger _logger;

        public CreateFormHandler(D365ObjectFactory objectFactory, D365ControlFactory controlFactory, ParameterDiscoveryService parameterDiscoveryService, ILogger logger) 
        {
            _objectFactory = objectFactory;
            _controlFactory = controlFactory;
            _logger = logger;
        }

        public string SupportedAction => "create_form";

        public async Task<ServiceResponse> HandleAsync(ServiceRequest request)
        {
            try
            {
                _logger.Information("CreateFormHandler: Starting enhanced form creation with pattern support");
                
                var parameters = request.Parameters ?? new Dictionary<string, object>();
                
                // Debug parameters
                _logger.Information("📝 Form creation parameters received:");
                foreach (var param in parameters)
                {
                    _logger.Information("  {Key} = {Value} ({Type})", param.Key, param.Value, param.Value?.GetType().Name ?? "null");
                }

                // Extract form parameters
                var formName = ExtractFormName(parameters);
                var patternName = ExtractParameter(parameters, new[] { "patternName", "Pattern" }, "SimpleListDetails");
                var patternVersion = ExtractParameter(parameters, new[] { "patternVersion", "version" }, "UX7 1.0");
                var modelName = ExtractParameter(parameters, new[] { "modelName", "model" }, "ApplicationSuite");
                var dataSources = ExtractDataSources(parameters);

                _logger.Information("📝 Extracted parameters - FormName: '{FormName}', Pattern: '{Pattern}', Version: '{Version}', Model: '{Model}', DataSources: [{DataSources}]", 
                    formName, patternName, patternVersion, modelName, dataSources != null ? string.Join(", ", dataSources) : "none");

                if (string.IsNullOrEmpty(formName))
                {
                    return ServiceResponse.CreateError("Form name is required for form creation");
                }

                // Create form with pattern and datasources
                var result = await CreateFormWithPatternAsync(formName, patternName, patternVersion, modelName, dataSources, parameters);

                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Exception in CreateFormHandler");
                return ServiceResponse.CreateError($"Form creation failed: {ex.Message}");
            }
        }

        private string ExtractFormName(Dictionary<string, object> parameters)
        {
            var formNameKeys = new[] { "formName", "objectName", "name", "Name" };
            foreach (var key in formNameKeys)
            {
                if (parameters.TryGetValue(key, out var value) && value != null)
                {
                    return value.ToString();
                }
            }
            return null;
        }

        private string[] ExtractDataSources(Dictionary<string, object> parameters)
        {
            var dataSourceKeys = new[] { "dataSources", "dataSource", "datasources", "datasource", "DataSources", "DataSource" };
            foreach (var key in dataSourceKeys)
            {
                if (parameters.TryGetValue(key, out var value) && value != null)
                {
                    // Handle array/list of datasources
                    if (value is System.Collections.IEnumerable enumerable && !(value is string))
                    {
                        var dataSourceList = new List<string>();
                        foreach (var item in enumerable)
                        {
                            if (item != null)
                            {
                                dataSourceList.Add(item.ToString());
                            }
                        }
                        return dataSourceList.ToArray();
                    }
                    // Handle comma-separated string first
                    else if (value.ToString().Contains(","))
                    {
                        return value.ToString().Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                                   .Select(ds => ds.Trim())
                                   .Where(ds => !string.IsNullOrWhiteSpace(ds))
                                   .ToArray();
                    }
                    // Handle single datasource as string
                    else if (value is string singleDataSource && !string.IsNullOrWhiteSpace(singleDataSource))
                    {
                        return new[] { singleDataSource };
                    }
                }
            }
            return null; // No datasources specified
        }

        private string ExtractParameter(Dictionary<string, object> parameters, string[] keys, string defaultValue)
        {
            foreach (var key in keys)
            {
                if (parameters.TryGetValue(key, out var value) && value != null)
                {
                    return value.ToString();
                }
            }
            return defaultValue;
        }

        private async Task<object> CreateFormWithPatternAsync(string formName, string patternName, string patternVersion, string modelName, string[] dataSources, Dictionary<string, object> parameters)
        {
            try
            {
                _logger.Information("🔧 Creating form '{FormName}' with pattern '{Pattern}' version '{Version}'", formName, patternName, patternVersion);

                // Create the form object
                var formParameters = new Dictionary<string, object>(parameters)
                {
                    ["Name"] = formName
                };

                var formCreationResult = await _objectFactory.CreateObjectDynamicallyAsync("AxForm", formParameters);
                
                if (!formCreationResult.Success)
                {
                    _logger.Error("Form creation failed: {Error}", formCreationResult.ErrorMessage);
                    throw new Exception($"Form creation failed: {formCreationResult.ErrorMessage}");
                }
                
                _logger.Information("✅ Form creation result received successfully");

                // Get the actual AxForm instance from the factory
                var formInstance = _objectFactory.GetExistingObject("AxForm", formName);
                if (formInstance == null)
                {
                    _logger.Error("Could not retrieve created form instance from factory");
                    throw new Exception("Could not retrieve created form instance from factory");
                }

                _logger.Information("✅ Retrieved actual AxForm instance: {FormType}", formInstance.GetType().FullName);

                // Add datasources if specified
                int dataSourcesAdded = 0;
                if (dataSources != null && dataSources.Length > 0)
                {
                    _logger.Information("🗄️ Adding {Count} datasource(s) to form: [{DataSources}]", dataSources.Length, string.Join(", ", dataSources));
                    dataSourcesAdded = await AddDataSourcesToFormAsync(formInstance, dataSources);
                    _logger.Information("DataSources addition result: {Count} added successfully", dataSourcesAdded);
                }

                // Apply pattern if requested
                bool patternApplied = false;
                if (!string.IsNullOrEmpty(patternName) && patternName != "None")
                {
                    // For patterns that require field controls, add them before applying the pattern
                    if (RequiresFieldControls(patternName) && dataSources != null && dataSources.Length > 0)
                    {
                        _logger.Information("🎛️ Pattern '{PatternName}' requires field controls - adding fields from datasources", patternName);
                        await AddFieldControlsFromDataSourcesAsync(formInstance, dataSources);
                    }

                    patternApplied = await ApplyPatternToFormAsync(formInstance, patternName, patternVersion);
                    _logger.Information("Pattern application result: {Result}", patternApplied ? "Success" : "Failed");
                    
                    // CRITICAL: Save the form after pattern application to persist changes
                    if (patternApplied)
                    {
                        var saveSuccess = await _objectFactory.SaveObjectAsync("AxForm", formName, formInstance);
                        if (saveSuccess)
                        {
                            _logger.Information("✅ Form successfully saved to metadata store after pattern application");
                        }
                        else
                        {
                            _logger.Warning("⚠️ Pattern applied but failed to save form to metadata store");
                        }
                    }
                }

                return new
                {
                    Success = true,
                    FormName = formName,
                    Model = modelName,
                    Pattern = patternName,
                    PatternVersion = patternVersion,
                    PatternApplied = patternApplied,
                    DataSources = dataSources,
                    DataSourcesAdded = dataSourcesAdded,
                    Message = BuildSuccessMessage(formName, patternName, patternVersion, patternApplied, dataSourcesAdded, dataSources?.Length ?? 0)
                };
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Exception in CreateFormWithPatternAsync");
                return new
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    FormName = formName,
                    Pattern = patternName
                };
            }
        }

        private async Task<bool> ApplyPatternToFormAsync(object formInstance, string patternName, string patternVersion)
        {
            try
            {
                _logger.Information("🎯 Applying pattern '{Pattern}' version '{Version}' to form", patternName, patternVersion);

                // Get or create the form design
                var formDesign = GetOrCreateFormDesign(formInstance);
                if (formDesign == null)
                {
                    _logger.Error("Unable to get or create form design");
                    return false;
                }

                _logger.Information("✅ Form design obtained successfully");

                // Load patterns assembly and apply pattern
                return await ApplyPatternToDesignAsync(formDesign, patternName, patternVersion);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Exception applying pattern to form");
                return false;
            }
        }

        private object GetOrCreateFormDesign(object formInstance)
        {
            try
            {
                var formType = formInstance.GetType();
                _logger.Information("🔍 Form instance type: {FormType}", formType.FullName);

                // List all properties to debug
                var properties = formType.GetProperties(BindingFlags.Public | BindingFlags.Instance);
                _logger.Information("Available properties: {Properties}", 
                    string.Join(", ", properties.Select(p => p.Name)));

                // Try different ways to access the form design
                // Option 1: Direct Design property
                var designProperty = formType.GetProperty("Design");
                if (designProperty != null)
                {
                    _logger.Information("✅ Found Design property directly");
                    var design = designProperty.GetValue(formInstance);
                    if (design != null)
                    {
                        return design;
                    }
                    _logger.Information("Design property exists but is null, creating new design");
                }
                else
                {
                    _logger.Information("Design property not found directly, trying alternative approaches");
                }

                // Option 2: Try to get Designs collection (forms can have multiple designs)
                var designsProperty = formType.GetProperty("Designs");
                if (designsProperty != null)
                {
                    _logger.Information("✅ Found Designs collection property");
                    var designs = designsProperty.GetValue(formInstance);
                    if (designs != null)
                    {
                        // Check if it's a collection
                        var designsType = designs.GetType();
                        _logger.Information("Designs collection type: {Type}", designsType.FullName);
                        
                        // Try to get the first design or create one
                        var countProperty = designsType.GetProperty("Count");
                        if (countProperty != null)
                        {
                            var count = (int)countProperty.GetValue(designs);
                            _logger.Information("Designs collection count: {Count}", count);
                            
                            if (count > 0)
                            {
                                // Get the first design
                                var itemProperty = designsType.GetProperty("Item");
                                if (itemProperty != null)
                                {
                                    var firstDesign = itemProperty.GetValue(designs, new object[] { 0 });
                                    _logger.Information("✅ Retrieved first design from collection");
                                    return firstDesign;
                                }
                            }
                        }
                        
                        // Try to add a new design to the collection
                        var addMethod = designsType.GetMethod("Add");
                        if (addMethod != null)
                        {
                            var designType = typeof(Microsoft.Dynamics.AX.Metadata.MetaModel.AxFormDesign);
                            var newDesign = Activator.CreateInstance(designType);
                            addMethod.Invoke(designs, new[] { newDesign });
                            _logger.Information("✅ Created and added new design to collection");
                            return newDesign;
                        }
                    }
                }

                // Option 3: Create a new design manually
                _logger.Information("Creating new standalone form design");
                var standaloneDesignType = typeof(Microsoft.Dynamics.AX.Metadata.MetaModel.AxFormDesign);
                var standaloneDesign = Activator.CreateInstance(standaloneDesignType);
                _logger.Information("✅ Created standalone form design");
                return standaloneDesign;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Exception getting or creating form design");
                return null;
            }
        }

        private async Task<bool> ApplyPatternToDesignAsync(object formDesign, string patternName, string patternVersion)
        {
            try
            {
                _logger.Information("🔍 Loading pattern assembly and discovering pattern");

                // Load the Patterns assembly
                var vsExtensionPath = @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions\avm13osb.viu";
                var patternsAssemblyPath = Path.Combine(vsExtensionPath, "Microsoft.Dynamics.AX.Metadata.Patterns.dll");

                if (!File.Exists(patternsAssemblyPath))
                {
                    _logger.Error("Patterns assembly not found at {Path}", patternsAssemblyPath);
                    return false;
                }

                var patternsAssembly = Assembly.LoadFrom(patternsAssemblyPath);
                var patternFactoryType = patternsAssembly.GetType("Microsoft.Dynamics.AX.Metadata.Patterns.PatternFactory");
                var extensionsType = patternsAssembly.GetType("Microsoft.Dynamics.AX.Metadata.Patterns.Extensions");

                if (patternFactoryType == null || extensionsType == null)
                {
                    _logger.Error("Required pattern types not found in assembly");
                    return false;
                }

                // Create PatternFactory instance
                var patternFactory = Activator.CreateInstance(patternFactoryType, new object[] { true });
                _logger.Information("✅ PatternFactory created");

                // Get the pattern - First discover available versions dynamically
                var getPatternsByNameMethod = patternFactoryType.GetMethod("GetPatternsByName", new[] { typeof(string), typeof(bool) });
                var getPatternMethod = patternFactoryType.GetMethod("GetPatternByName", new[] { typeof(string), typeof(string), typeof(bool) });
                
                if (getPatternsByNameMethod == null || getPatternMethod == null)
                {
                    _logger.Error("Pattern discovery methods not found");
                    return false;
                }

                object pattern = null;
                string actualPatternVersion = patternVersion;

                // Try with specified version first
                try
                {
                    pattern = getPatternMethod.Invoke(patternFactory, new object[] { patternName, patternVersion, false });
                    if (pattern != null)
                    {
                        _logger.Information("✅ Pattern found with specified version: {PatternName} {Version}", patternName, patternVersion);
                    }
                }
                catch (Exception ex)
                {
                    _logger.Debug(ex, "Failed to get pattern with specified version {Version}", patternVersion);
                }

                // If not found with specified version, discover available versions
                if (pattern == null)
                {
                    _logger.Information("🔍 Pattern '{PatternName}' not found with version '{Version}', discovering available versions...", patternName, patternVersion);
                    
                    try
                    {
                        var availablePatterns = getPatternsByNameMethod.Invoke(patternFactory, new object[] { patternName, false });
                        
                        if (availablePatterns != null)
                        {
                            // Get IList<Pattern> from result
                            var patternsList = availablePatterns as System.Collections.IList;
                            if (patternsList != null && patternsList.Count > 0)
                            {
                                _logger.Information("📋 Found {Count} version(s) of pattern '{PatternName}':", patternsList.Count, patternName);
                                
                                // List all available versions
                                for (int i = 0; i < patternsList.Count; i++)
                                {
                                    var availablePattern = patternsList[i];
                                    var versionProp = availablePattern.GetType().GetProperty("Version");
                                    var nameProp = availablePattern.GetType().GetProperty("Name");
                                    
                                    if (versionProp != null && nameProp != null)
                                    {
                                        var availableVersion = versionProp.GetValue(availablePattern)?.ToString();
                                        var availableName = nameProp.GetValue(availablePattern)?.ToString();
                                        _logger.Information("   📌 {Name} version {Version}", availableName, availableVersion);
                                    }
                                }
                                
                                // Use the first available pattern (could be enhanced to prefer latest version)
                                pattern = patternsList[0];
                                var firstVersionProp = pattern.GetType().GetProperty("Version");
                                if (firstVersionProp != null)
                                {
                                    actualPatternVersion = firstVersionProp.GetValue(pattern)?.ToString() ?? patternVersion;
                                    _logger.Information("✅ Using pattern version: {Version}", actualPatternVersion);
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "Failed to discover pattern versions for {PatternName}", patternName);
                    }
                }

                if (pattern == null)
                {
                    _logger.Warning("❌ Pattern '{PatternName}' not found with any version. Available patterns may not include this name.", patternName);
                    return false;
                }

                _logger.Information("✅ Pattern found: {PatternName} {Version}", patternName, actualPatternVersion);

                // INSPECT THE PATTERN STRUCTURE TO GET ACTUAL CONTROL TYPE REQUIREMENTS
                _logger.Information("🔍 Inspecting pattern structure for actual control types...");
                InspectPatternStructure(pattern);

                // CRITICAL: Build required structure BEFORE applying pattern
                // Pattern validation expects the controls to already exist!
                _logger.Information("🏗️ Building required structure before pattern application (pattern expects existing controls)");
                await BuildStructureFromPattern(formDesign, pattern);
                
                // Validate what was built
                _logger.Information("🔍 VALIDATION: Checking what was built before pattern application");
                ValidateBuiltStructure(formDesign);

                // Apply the pattern (validates existing structure and applies property fixes)
                var applyPatternMethod = extensionsType.GetMethod("ApplyPattern", BindingFlags.Public | BindingFlags.Static);
                if (applyPatternMethod == null)
                {
                    _logger.Error("ApplyPattern method not found");
                    return false;
                }

                _logger.Information("🔍 ApplyPattern method found: {MethodInfo}", applyPatternMethod);
                _logger.Information("🔍 Method parameters: {Parameters}", 
                    string.Join(", ", applyPatternMethod.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}")));

                // Debug form design state before pattern application
                _logger.Information("🔍 Form design type: {DesignType}", formDesign.GetType().FullName);
                
                // Check if formDesign implements IPatternable
                var iPatternableType = typeof(Microsoft.Dynamics.AX.Metadata.MetaModel.IPatternable);
                bool implementsIPatternable = iPatternableType.IsAssignableFrom(formDesign.GetType());
                _logger.Information("🔍 FormDesign implements IPatternable: {ImplementsIPatternable}", implementsIPatternable);
                
                // Check parameter types match exactly
                var methodParams = applyPatternMethod.GetParameters();
                if (methodParams.Length >= 2)
                {
                    _logger.Debug("Expected parameter types:");
                    _logger.Debug("  [0] {ParamType} (formDesign is: {ActualType})", methodParams[0].ParameterType.FullName, formDesign.GetType().FullName);
                    _logger.Debug("  [1] {ParamType} (pattern is: {ActualType})", methodParams[1].ParameterType.FullName, pattern.GetType().FullName);
                    
                    // Check type compatibility
                    bool param0Compatible = methodParams[0].ParameterType.IsAssignableFrom(formDesign.GetType());
                    bool param1Compatible = methodParams[1].ParameterType.IsAssignableFrom(pattern.GetType());
                    _logger.Debug("Parameter compatibility: param0={Param0Compatible}, param1={Param1Compatible}", param0Compatible, param1Compatible);
                }
                
                // Check for existing pattern
                var designType = formDesign.GetType();
                var existingPatternProp = designType.GetProperty("Pattern");
                if (existingPatternProp != null)
                {
                    var existingPattern = existingPatternProp.GetValue(formDesign);
                    _logger.Debug("Existing pattern on design: {ExistingPattern}", existingPattern ?? "null");
                }

                // Check pattern type
                var patternType = pattern.GetType();
                _logger.Debug("Pattern object type: {PatternType}", patternType.FullName);
                
                // Get pattern details
                try
                {
                    var patternNameProp = patternType.GetProperty("Name");
                    var patternVersionProp = patternType.GetProperty("Version");
                    var patternInfo = new
                    {
                        Name = patternNameProp?.GetValue(pattern),
                        Version = patternVersionProp?.GetValue(pattern)
                    };
                    _logger.Debug("Pattern object details: {PatternInfo}", patternInfo);
                }
                catch (Exception patternEx)
                {
                    _logger.Warning(patternEx, "Could not get pattern object details");
                }

                _logger.Information("Attempting to apply pattern...");
                var result = applyPatternMethod.Invoke(null, new object[] { formDesign, pattern });
                
                _logger.Debug("ApplyPattern returned: {Result} (Type: {ResultType})", 
                    result, result?.GetType().FullName ?? "null");

                var success = result != null && (bool)result;

                if (success)
                {
                    _logger.Information("✅ Pattern applied successfully");
                    
                    // Set pattern properties on the design
                    await SetPatternPropertiesAsync(formDesign, patternName, patternVersion);
                }
                else
                {
                    _logger.Warning("❌ Pattern application returned false - checking why...");
                    
                    // Additional debugging for failure
                    var postPatternProp = designType.GetProperty("Pattern");
                    if (postPatternProp != null)
                    {
                        var postPattern = postPatternProp.GetValue(formDesign);
                        _logger.Warning("🔍 Design pattern after failed application: {PostPattern}", postPattern ?? "null");
                    }
                }

                return success;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Exception applying pattern to design");
                return false;
            }
        }

        private Task SetPatternPropertiesAsync(object formDesign, string patternName, string patternVersion)
        {
            try
            {
                var designType = formDesign.GetType();

                // Set Pattern property
                var patternProperty = designType.GetProperty("Pattern");
                if (patternProperty != null && patternProperty.CanWrite)
                {
                    patternProperty.SetValue(formDesign, patternName);
                    _logger.Information("✅ Set Design.Pattern = {Pattern}", patternName);
                }

                // Set PatternVersion property
                var patternVersionProperty = designType.GetProperty("PatternVersion");
                if (patternVersionProperty != null && patternVersionProperty.CanWrite)
                {
                    patternVersionProperty.SetValue(formDesign, patternVersion);
                    _logger.Information("✅ Set Design.PatternVersion = {Version}", patternVersion);
                }
                
                return Task.CompletedTask;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to set pattern properties on design");
                return Task.CompletedTask;
            }
        }

        /// <summary>
        /// Validate what structure was actually built in the form
        /// </summary>
        private void ValidateBuiltStructure(object formDesign)
        {
            try
            {
                _logger.Information("🔍 STRUCTURE VALIDATION START");
                
                var designType = formDesign.GetType();
                var controlsProperty = designType.GetProperty("Controls");
                
                if (controlsProperty != null)
                {
                    var controlsCollection = controlsProperty.GetValue(formDesign);
                    if (controlsCollection != null)
                    {
                        var collectionType = controlsCollection.GetType();
                        var countProperty = collectionType.GetProperty("Count");
                        var count = countProperty?.GetValue(controlsCollection);
                        
                        _logger.Information("📊 Form Design has {Count} top-level controls", count);
                        
                        // Try to enumerate the controls
                        if (controlsCollection is System.Collections.IEnumerable enumerable)
                        {
                            int index = 0;
                            foreach (var control in enumerable)
                            {
                                var controlType = control.GetType();
                                var nameProperty = controlType.GetProperty("Name");
                                var name = nameProperty?.GetValue(control)?.ToString() ?? "unnamed";
                                
                                _logger.Information("  [{Index}] {ControlType} - Name: '{Name}'", index, controlType.Name, name);
                                
                                // Check if this control has child controls
                                var childControlsProperty = controlType.GetProperty("Controls");
                                if (childControlsProperty != null)
                                {
                                    var childControls = childControlsProperty.GetValue(control);
                                    if (childControls != null)
                                    {
                                        var childCountProperty = childControls.GetType().GetProperty("Count");
                                        var childCount = childCountProperty?.GetValue(childControls);
                                        if (childCount != null && (int)childCount > 0)
                                        {
                                            _logger.Information("    └─ Has {ChildCount} child controls", childCount);
                                        }
                                    }
                                }
                                index++;
                            }
                        }
                    }
                    else
                    {
                        _logger.Warning("⚠️ FormDesign.Controls is null");
                    }
                }
                else
                {
                    _logger.Warning("⚠️ FormDesign does not have Controls property");
                }
                
                _logger.Information("🔍 STRUCTURE VALIDATION END");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to validate built structure");
            }
        }

        /// <summary>
        /// Build form structure recursively from pattern definition
        /// This extracts the Root node from pattern and builds the complete hierarchy
        /// </summary>
        private async Task BuildStructureFromPattern(object formDesign, object pattern)
        {
            try
            {
                _logger.Information("🏗️ Building structure from pattern definition recursively");

                // Extract root node from pattern
                var patternType = pattern.GetType();
                var rootProperty = patternType.GetProperty("Root");
                
                if (rootProperty == null)
                {
                    _logger.Warning("Pattern does not have Root property - cannot build recursive structure");
                    return;
                }

                var rootNode = rootProperty.GetValue(pattern);
                if (rootNode == null)
                {
                    _logger.Warning("Pattern Root is null - cannot build recursive structure");
                    return;
                }

                _logger.Information("✅ Pattern root node found: {RootNodeType}", rootNode.GetType().Name);

                // Use the recursive building method directly with root node
                await BuildFormStructureRecursively(formDesign, formDesign, rootNode, pattern.GetType().Name);

                // VALIDATE what was actually created
                _logger.Information("🔍 VALIDATION: Checking what was actually built in the form");
                ValidateBuiltStructure(formDesign);

                _logger.Information("✅ Recursive structure building from pattern completed");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to build structure from pattern");
            }
        }



        /// <summary>
        /// Build form structure recursively from pattern node hierarchy
        /// This is TRUE RECURSION - all nodes (root and children) are treated identically
        /// </summary>
        private async Task BuildFormStructureRecursively(object formInstance, object formDesign, object rootNode, string patternName)
        {
            try
            {
                _logger.Information("🏗️ Building form structure RECURSIVELY for pattern '{Pattern}'", patternName);

                if (rootNode == null)
                {
                    _logger.Warning("No RootNode available for recursive building");
                    return;
                }

                // Get form design controls collection
                var designType = formDesign.GetType();
                var controlsProperty = designType.GetProperty("Controls");
                if (controlsProperty == null)
                {
                    _logger.Error("FormDesign does not have Controls property");
                    return;
                }

                var controlsCollection = controlsProperty.GetValue(formDesign);
                if (controlsCollection == null)
                {
                    _logger.Error("FormDesign.Controls is null");
                    return;
                }

                // Start recursive building from the root node
                await BuildPatternNodeRecursively(rootNode, formInstance, controlsCollection, 0);

                _logger.Information("✅ Recursive form structure building completed");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to build form structure recursively");
                throw;
            }
        }

        /// <summary>
        /// Recursively build form controls from pattern node
        /// This method treats ALL nodes (root, subnodes) identically - TRUE RECURSION
        /// </summary>
        private async Task BuildPatternNodeRecursively(object patternNode, object formInstance, object parentControlsCollection, int depth)
        {
            try
            {
                if (patternNode == null || depth > 10) // Prevent infinite recursion
                    return;

                var indent = new string(' ', depth * 2);
                var nodeType = patternNode.GetType();
                _logger.Information("{Indent}🔨 Building node: {NodeType}", indent, nodeType.Name);

                // Extract node information
                var nodeInfo = ExtractPatternNodeInfo(patternNode);
                _logger.Information("{Indent}   Type: {Type}, RequireOne: {RequireOne}", indent, nodeInfo.Type, nodeInfo.RequireOne);

                // Create control based on node type
                object createdControl = null;
                if (!string.IsNullOrEmpty(nodeInfo.Type))
                {
                    _logger.Information("{Indent}🔍 About to create control - parentCollection type: {CollectionType}", indent, parentControlsCollection?.GetType().Name ?? "null");
                    createdControl = await CreateControlForNodeType(nodeInfo.Type, parentControlsCollection, formInstance, depth);
                    
                    if (createdControl != null)
                    {
                        _logger.Information("{Indent}✅ Created control result: {ControlResult}", indent, createdControl.GetType().Name);
                    }
                    else if (nodeInfo.Type.ToLowerInvariant() == "formdesign")
                    {
                        _logger.Information("{Indent}✅ FormDesign node processed (no new control needed)", indent);
                    }
                    else
                    {
                        _logger.Warning("{Indent}⚠️ Control creation failed for {NodeType}, but continuing with pattern building", indent, nodeInfo.Type);
                    }
                }

                // Process PropertyRestrictions (set properties on parent or created control)
                if (nodeInfo.PropertyRestrictions != null && nodeInfo.PropertyRestrictions.Count > 0)
                {
                    var targetControl = createdControl ?? parentControlsCollection; // Apply to control or parent
                    foreach (var propRestriction in nodeInfo.PropertyRestrictions)
                    {
                        ApplyPropertyRestriction(propRestriction, targetControl, depth);
                    }
                }

                // RECURSIVELY process SubNodes - this is the key to true recursion
                if (nodeInfo.SubNodes != null && nodeInfo.SubNodes.Count > 0)
                {
                    var childCollection = createdControl != null ? GetControlsCollection(createdControl) : parentControlsCollection;
                    
                    _logger.Information("{Indent}   Processing {Count} child nodes", indent, nodeInfo.SubNodes.Count);
                    foreach (var subNode in nodeInfo.SubNodes)
                    {
                        await BuildPatternNodeRecursively(subNode, formInstance, childCollection, depth + 1);
                    }
                }

                _logger.Information("{Indent}✅ Node building complete", indent);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to build pattern node at depth {Depth}", depth);
            }
        }

        /// <summary>
        /// Extract all information from a pattern node for recursive processing
        /// </summary>
        private (string Type, bool RequireOne, List<object> PropertyRestrictions, List<object> SubNodes) ExtractPatternNodeInfo(object patternNode)
        {
            var nodeType = patternNode.GetType();
            
            // Extract Type
            var typeProperty = nodeType.GetProperty("Type");
            string type = typeProperty?.GetValue(patternNode)?.ToString();
            
            // Extract RequireOne
            var requireOneProperty = nodeType.GetProperty("RequireOne");
            bool requireOne = requireOneProperty?.GetValue(patternNode) as bool? ?? false;
            
            // Extract PropertyRestrictions
            var propRestrictionsProperty = nodeType.GetProperty("PropertyRestrictions");
            var propRestrictions = new List<object>();
            if (propRestrictionsProperty != null)
            {
                var restrictionsCollection = propRestrictionsProperty.GetValue(patternNode);
                if (restrictionsCollection is System.Collections.IEnumerable enumerable)
                {
                    foreach (var item in enumerable)
                    {
                        propRestrictions.Add(item);
                    }
                }
            }
            
            // Extract SubNodes
            var subNodesProperty = nodeType.GetProperty("SubNodes");
            var subNodes = new List<object>();
            if (subNodesProperty != null)
            {
                var subNodesCollection = subNodesProperty.GetValue(patternNode);
                if (subNodesCollection is System.Collections.IEnumerable enumerable)
                {
                    foreach (var item in enumerable)
                    {
                        subNodes.Add(item);
                    }
                }
            }
            
            return (type, requireOne, propRestrictions, subNodes);
        }

        /// <summary>
        /// Create appropriate control for the given node type using dynamic type discovery
        /// </summary>
        private Task<object> CreateControlForNodeType(string nodeType, object parentControlsCollection, object formInstance, int depth)
        {
            try
            {
                var indent = new string(' ', depth * 2);
                _logger.Information("{Indent}🎛️ Creating control for type: {NodeType}", indent, nodeType);
                
                // FormDesign is special - it's the design itself, not a new control
                if (nodeType.ToLowerInvariant() == "formdesign")
                {
                    _logger.Information("{Indent}📐 FormDesign node - applying properties to design itself", indent);
                    return Task.FromResult<object>(null);
                }
                
                // Use dynamic type discovery for all control types
                var result = CreateControlDynamically(nodeType, parentControlsCollection, depth);
                return Task.FromResult(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to create control for node type {NodeType}", nodeType);
                return Task.FromResult<object>(null);
            }
        }

        /// <summary>
        /// Create D365 form controls using proper metadata type creation
        /// Form controls are NOT created through ObjectFactory but through direct instantiation
        /// </summary>
        private object CreateD365FormControl(string controlTypeName, object parentControlsCollection, int depth)
        {
            try
            {
                var indent = new string(' ', depth * 2);
                _logger.Information("{Indent}🎯 Creating D365 form control for type: {ControlTypeName}", indent, controlTypeName);
                
                // Create the actual D365 control using direct instantiation  
                var controlInstance = _controlFactory.CreateControlByFormControlType(controlTypeName);
                if (controlInstance == null)
                {
                    _logger.Warning("{Indent}⚠️ Control type '{ControlTypeName}' could not be created - this may be expected for some pattern types", indent, controlTypeName);
                    _logger.Information("{Indent}ℹ️ Continuing pattern building without this control", indent);
                    return null;
                }
                
                _logger.Information("{Indent}✅ Created control instance: {ControlInstance}", indent, controlInstance.GetType().Name);
                
                // Set a unique name for the control - first 2 characters of GUID
                var uniqueName = $"{controlInstance.GetType().Name}_{Guid.NewGuid().ToString("N").Substring(0, 2)}";
                _controlFactory.SetControlName(controlInstance, uniqueName);
                
                // Add to the parent collection using the proper D365 method
                if (parentControlsCollection != null)
                {
                    AddControlToD365Collection(parentControlsCollection, controlInstance, uniqueName, depth);
                }
                
                return controlInstance;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error creating D365 form control for {ControlTypeName}", controlTypeName);
                return null;
            }
        }

        /// <summary>
        /// Add control to D365 collection using the proper AxFormDesign.AddControl method
        /// </summary>
        private void AddControlToD365Collection(object controlsCollection, object control, string controlName, int depth)
        {
            try
            {
                var indent = new string(' ', depth * 2);
                
                if (controlsCollection == null || control == null) 
                {
                    _logger.Warning("{Indent}Cannot add control - controlsCollection or control is null", indent);
                    return;
                }

                var collectionType = controlsCollection.GetType();
                _logger.Information("{Indent}🔍 Collection type: {CollectionType}", indent, collectionType.Name);
                
                // Try the Add method for KeyedObjectCollection<AxFormControl>
                var addMethod = collectionType.GetMethod("Add", new[] { control.GetType() });
                if (addMethod == null)
                {
                    // Try generic Add method
                    addMethod = collectionType.GetMethod("Add");
                }
                
                if (addMethod != null)
                {
                    _logger.Information("{Indent}🎯 Using Add method for collection", indent);
                    addMethod.Invoke(controlsCollection, new[] { control });
                    _logger.Information("{Indent}✅ Added {ControlName} ({ControlType}) to collection", indent, controlName, control.GetType().Name);
                    
                    // Check collection count after adding
                    var countProperty = collectionType.GetProperty("Count");
                    if (countProperty != null)
                    {
                        var count = countProperty.GetValue(controlsCollection);
                        _logger.Information("{Indent}📊 Collection now has {Count} items", indent, count);
                    }
                }
                else
                {
                    _logger.Error("{Indent}❌ No suitable Add method found for {ControlType}", indent, control.GetType().Name);
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to add control {ControlName} to D365 collection", controlName);
            }
        }

        /// <summary>
        /// Create form controls using the proper D365 ObjectFactory approach
        /// </summary>
        private object CreateControlDynamically(string controlTypeName, object parentControlsCollection, int depth)
        {
            try
            {
                var indent = new string(' ', depth * 2);
                _logger.Information("{Indent}🎛️ Creating control for type: {ControlTypeName}", indent, controlTypeName);
                
                // FormDesign is special - it's the design itself, not a new control
                if (controlTypeName.ToLowerInvariant() == "formdesign")
                {
                    _logger.Information("{Indent}📐 FormDesign node - applying properties to design itself", indent);
                    return null;
                }
                
                // Use the new D365-based control creation approach
                return CreateD365FormControl(controlTypeName, parentControlsCollection, depth);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to create control for node type {NodeType}", controlTypeName);
                return null;
            }
        }

        /// <summary>
        /// Get the controls collection from a control (for adding child controls)
        /// </summary>
        private object GetControlsCollection(object control)
        {
            try
            {
                var controlType = control.GetType();
                var controlsProperty = controlType.GetProperty("Controls");
                return controlsProperty?.GetValue(control);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to get controls collection from control");
                return null;
            }
        }

        /// <summary>
        /// Apply property restriction to a control
        /// </summary>
        private void ApplyPropertyRestriction(object propertyRestriction, object targetControl, int depth)
        {
            try
            {
                var indent = new string(' ', depth * 2);
                var restrictionType = propertyRestriction.GetType();
                
                // Extract property name and value from PropertyRestriction
                var propertyProperty = restrictionType.GetProperty("Property");
                var valueProperty = restrictionType.GetProperty("Value");
                
                if (propertyProperty != null && valueProperty != null)
                {
                    var propertyName = propertyProperty.GetValue(propertyRestriction)?.ToString();
                    var value = valueProperty.GetValue(propertyRestriction);
                    
                    _logger.Information("{Indent}🎯 Applying property: {Property} = {Value}", indent, propertyName, value);
                    
                    if (!string.IsNullOrEmpty(propertyName) && targetControl != null)
                    {
                        try
                        {
                            var controlType = targetControl.GetType();
                            var property = controlType.GetProperty(propertyName);
                            
                            if (property != null && property.CanWrite)
                            {
                                // Handle enum properties
                                if (property.PropertyType.IsEnum && value is string stringValue)
                                {
                                    var enumValue = Enum.Parse(property.PropertyType, stringValue);
                                    property.SetValue(targetControl, enumValue);
                                }
                                else
                                {
                                    property.SetValue(targetControl, value);
                                }
                                _logger.Information("{Indent}✅ Set {Control}.{Property} = {Value}", indent, targetControl.GetType().Name, propertyName, value);
                            }
                            else
                            {
                                _logger.Warning("{Indent}Property {Property} not found on {Control}", indent, propertyName, targetControl.GetType().Name);
                            }
                        }
                        catch (Exception propEx)
                        {
                            _logger.Warning(propEx, "{Indent}Failed to set control property {Property}", indent, propertyName);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to apply property restriction");
            }
        }

        /// <summary>
        /// Inspect the pattern structure to determine what actual control types are required
        /// </summary>
        private void InspectPatternStructure(object pattern)
        {
            try
            {
                _logger.Information("🔍 PATTERN STRUCTURE INSPECTION START");
                var patternType = pattern.GetType();
                _logger.Information("Pattern type: {PatternType}", patternType.FullName);
                
                // Look for properties that contain the pattern structure
                var properties = patternType.GetProperties();
                foreach (var prop in properties)
                {
                    _logger.Information("Pattern property: {PropertyName} ({PropertyType})", prop.Name, prop.PropertyType.Name);
                    
                    if (prop.Name.Contains("Root") || prop.Name.Contains("Node") || prop.Name.Contains("Structure"))
                    {
                        try
                        {
                            var value = prop.GetValue(pattern);
                            if (value != null)
                            {
                                _logger.Information("🎯 Examining pattern property: {PropertyName}", prop.Name);
                                InspectPatternNode(value, 0);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.Warning(ex, "Failed to inspect pattern property {PropertyName}", prop.Name);
                        }
                    }
                }
                
                _logger.Information("🔍 PATTERN STRUCTURE INSPECTION END");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to inspect pattern structure");
            }
        }

        /// <summary>
        /// Recursively inspect pattern nodes to find actual control type requirements
        /// </summary>
        private void InspectPatternNode(object node, int depth)
        {
            try
            {
                var indent = new string(' ', depth * 2);
                var nodeType = node.GetType();
                
                // Only log essential pattern node information
                var properties = nodeType.GetProperties();
                
                // Look for the Type property specifically
                var typeProp = properties.FirstOrDefault(p => p.Name == "Type");
                if (typeProp != null)
                {
                    try
                    {
                        var typeValue = typeProp.GetValue(node)?.ToString();
                        if (!string.IsNullOrEmpty(typeValue))
                        {
                            _logger.Information("{Indent}Pattern Node: {NodeType} -> Type: {PatternType}", 
                                indent, nodeType.Name, typeValue);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Debug(ex, "{Indent}Failed to get Type property", indent);
                    }
                }
                
                // Look for child nodes
                foreach (var prop in properties)
                {
                    if (prop.Name.Contains("Child") || prop.Name.Contains("Node") || prop.Name.Contains("Element"))
                    {
                        try
                        {
                            var value = prop.GetValue(node);
                            if (value != null)
                            {
                                // Handle collections
                                if (value is System.Collections.IEnumerable enumerable && !(value is string))
                                {
                                    foreach (var item in enumerable)
                                    {
                                        if (item != null)
                                        {
                                            InspectPatternNode(item, depth + 1);
                                        }
                                    }
                                }
                                // Handle single objects
                                else if (value.GetType().Name.Contains("Node"))
                                {
                                    InspectPatternNode(value, depth + 1);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.Debug(ex, "{Indent}Failed to inspect child property {PropertyName}", indent, prop.Name);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to inspect pattern node at depth {Depth}", depth);
            }
        }

        /// <summary>
        /// Build success message including pattern and datasource information
        /// </summary>
        private string BuildSuccessMessage(string formName, string patternName, string patternVersion, bool patternApplied, int dataSourcesAdded, int totalDataSources)
        {
            var parts = new List<string>();
            parts.Add($"Form '{formName}' created successfully");
            
            if (!string.IsNullOrEmpty(patternName) && patternName != "None")
            {
                if (patternApplied)
                {
                    parts.Add($"with '{patternName} {patternVersion}' pattern applied");
                }
                else
                {
                    parts.Add($"but pattern '{patternName}' application failed");
                }
            }
            
            if (totalDataSources > 0)
            {
                parts.Add($"and {dataSourcesAdded} of {totalDataSources} datasources added");
            }
            
            return string.Join(" ", parts);
        }

        /// <summary>
        /// Add datasources to a form using the D365 AddDataSource method
        /// </summary>
        private Task<int> AddDataSourcesToFormAsync(object formInstance, string[] dataSourceNames)
        {
            try
            {
                _logger.Information("🗄️ Adding {Count} datasource(s) to form", dataSourceNames.Length);
                
                int addedCount = 0;
                
                foreach (var dataSourceName in dataSourceNames)
                {
                    if (string.IsNullOrWhiteSpace(dataSourceName))
                    {
                        _logger.Warning("Skipping empty datasource name");
                        continue;
                    }
                    
                    _logger.Information("📊 Creating datasource: {DataSourceName}", dataSourceName);
                    
                    try
                    {
                        // Create AxFormDataSourceRoot instance 
                        var dataSource = Activator.CreateInstance(typeof(Microsoft.Dynamics.AX.Metadata.MetaModel.AxFormDataSourceRoot));
                        
                        // Set datasource properties
                        var dataSourceType = dataSource.GetType();
                        
                        _logger.Information("🔍 Available datasource properties: {Properties}", 
                            string.Join(", ", dataSourceType.GetProperties().Select(p => p.Name)));
                        
                        // Set Name property (this is the datasource name in the form)
                        var nameProperty = dataSourceType.GetProperty("Name");
                        if (nameProperty != null && nameProperty.CanWrite)
                        {
                            nameProperty.SetValue(dataSource, dataSourceName);
                            _logger.Information("✅ Set datasource Name = {DataSourceName}", dataSourceName);
                        }
                        
                        // Set Table property (this should be the table name that the datasource references)
                        var tableProperty = dataSourceType.GetProperty("Table");
                        if (tableProperty != null && tableProperty.CanWrite)
                        {
                            tableProperty.SetValue(dataSource, dataSourceName);
                            _logger.Information("✅ Set datasource Table = {DataSourceName}", dataSourceName);
                        }
                        
                        // Check for other critical properties that might be required
                        var metadataProperty = dataSourceType.GetProperty("Metadata");
                        if (metadataProperty != null)
                        {
                            var metadataValue = metadataProperty.GetValue(dataSource);
                            _logger.Information("🔍 Datasource Metadata property value: {MetadataValue}", metadataValue?.ToString() ?? "null");
                        }
                        
                        // Check for ID property
                        var idProperty = dataSourceType.GetProperty("Id");
                        if (idProperty != null && idProperty.CanWrite)
                        {
                            // Set a unique ID for the datasource
                            idProperty.SetValue(dataSource, addedCount + 1);
                            _logger.Information("✅ Set datasource Id = {Id}", addedCount + 1);
                        }
                        
                        // Add the datasource to the form using AddDataSource method
                        var formType = formInstance.GetType();
                        var addDataSourceMethod = formType.GetMethod("AddDataSource");
                        
                        if (addDataSourceMethod != null)
                        {
                            addDataSourceMethod.Invoke(formInstance, new[] { dataSource });
                            addedCount++;
                            _logger.Information("✅ Added datasource {DataSourceName} to form", dataSourceName);
                        }
                        else
                        {
                            _logger.Error("❌ AddDataSource method not found on form type {FormType}", formType.Name);
                        }
                    }
                    catch (Exception dsEx)
                    {
                        _logger.Error(dsEx, "Failed to add datasource {DataSourceName}", dataSourceName);
                    }
                }
                
                _logger.Information("🎯 Successfully added {AddedCount} of {TotalCount} datasources", addedCount, dataSourceNames.Length);
                return Task.FromResult(addedCount);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Exception adding datasources to form");
                return Task.FromResult(0);
            }
        }

        /// <summary>
        /// Check if a pattern requires field controls to be present for validation
        /// </summary>
        private bool RequiresFieldControls(string patternName)
        {
            var patternsRequiringFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "DetailsMaster",
                "Details Master",
                "DetailsFormMaster",
                "SimpleList",
                "SimpleListDetails", 
                "List Page",
                "ListPage"
            };
            
            return patternsRequiringFields.Contains(patternName);
        }

        /// <summary>
        /// Add field controls to form design based on datasource fields
        /// This is needed for patterns like DetailsMaster that expect $Field controls
        /// </summary>
        private async Task AddFieldControlsFromDataSourcesAsync(object formInstance, string[] dataSourceNames)
        {
            try
            {
                _logger.Information("🎛️ Adding field controls from {Count} datasource(s)", dataSourceNames.Length);

                // Get form design to add controls to
                var formDesign = GetOrCreateFormDesign(formInstance);
                if (formDesign == null)
                {
                    _logger.Error("Cannot add field controls - no form design available");
                    return;
                }

                // For each datasource, add some basic field controls
                foreach (var dsName in dataSourceNames)
                {
                    await AddBasicFieldControlsForDataSourceAsync(formDesign, dsName);
                }

                _logger.Information("✅ Field controls added successfully");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to add field controls from datasources");
            }
        }

        /// <summary>
        /// Add basic field controls for a specific datasource
        /// </summary>
        private Task AddBasicFieldControlsForDataSourceAsync(object formDesign, string dataSourceName)
        {
            try
            {
                _logger.Information("🔧 Adding field controls for datasource '{DataSource}'", dataSourceName);

                // Create basic field controls that most tables have
                var basicFields = new[]
                {
                    new { Name = $"{dataSourceName}_RecId", Type = "AxFormInt64Control", DataField = "RecId", DataSource = dataSourceName },
                    new { Name = $"{dataSourceName}_Name", Type = "AxFormStringControl", DataField = "Name", DataSource = dataSourceName },
                    new { Name = $"{dataSourceName}_Description", Type = "AxFormStringControl", DataField = "Description", DataSource = dataSourceName },
                    new { Name = $"{dataSourceName}_Code", Type = "AxFormStringControl", DataField = "Code", DataSource = dataSourceName }
                };

                var designType = formDesign.GetType();
                var controlsProperty = designType.GetProperty("Controls");
                
                if (controlsProperty != null)
                {
                    var controls = controlsProperty.GetValue(formDesign);
                    if (controls != null)
                    {
                        var controlsType = controls.GetType();
                        var addMethod = controlsType.GetMethod("Add");

                        if (addMethod != null)
                        {
                            foreach (var fieldInfo in basicFields)
                            {
                                try
                                {
                                    // Create the field control
                                    var controlTypeName = $"Microsoft.Dynamics.AX.Metadata.MetaModel.{fieldInfo.Type}";
                                    var controlType = Type.GetType(controlTypeName);
                                    
                                    if (controlType != null)
                                    {
                                        var control = Activator.CreateInstance(controlType);
                                        
                                        // Set basic properties
                                        var nameProperty = controlType.GetProperty("Name");
                                        if (nameProperty?.CanWrite == true)
                                        {
                                            nameProperty.SetValue(control, fieldInfo.Name);
                                        }

                                        var dataFieldProperty = controlType.GetProperty("DataField");
                                        if (dataFieldProperty?.CanWrite == true)
                                        {
                                            dataFieldProperty.SetValue(control, fieldInfo.DataField);
                                        }

                                        var dataSourceProperty = controlType.GetProperty("DataSource");
                                        if (dataSourceProperty?.CanWrite == true)
                                        {
                                            dataSourceProperty.SetValue(control, fieldInfo.DataSource);
                                        }

                                        // Add control to design
                                        addMethod.Invoke(controls, new[] { control });
                                        _logger.Information("✅ Added {ControlType} control '{Name}' for field '{DataField}'", 
                                            fieldInfo.Type, fieldInfo.Name, fieldInfo.DataField);
                                    }
                                    else
                                    {
                                        _logger.Warning("⚠️ Control type '{ControlType}' not found", controlTypeName);
                                    }
                                }
                                catch (Exception fieldEx)
                                {
                                    _logger.Warning(fieldEx, "Failed to add field control '{FieldName}'", fieldInfo.Name);
                                }
                            }
                        }
                        else
                        {
                            _logger.Error("Add method not found on controls collection");
                        }
                    }
                }
                else
                {
                    _logger.Error("Controls property not found on form design");
                }

                return Task.CompletedTask;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to add basic field controls for datasource '{DataSource}'", dataSourceName);
                return Task.CompletedTask;
            }
        }
    }
}