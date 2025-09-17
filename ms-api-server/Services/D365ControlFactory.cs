using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Serilog;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Factory specifically for creating D365 form controls
    /// Separate from D365ObjectFactory which handles top-level D365 objects
    /// </summary>
    public class D365ControlFactory
    {
        private readonly ILogger _logger;
        private readonly Dictionary<string, Type> _controlTypeCache;
        private readonly D365ReflectionManager _reflectionManager;

        public D365ControlFactory(D365ReflectionManager reflectionManager, ILogger logger)
        {
            _reflectionManager = reflectionManager;
            _logger = logger;
            _controlTypeCache = new Dictionary<string, Type>();
            InitializeControlTypeCache();
        }

        /// <summary>
        /// Initialize cache with all D365 form control types
        /// </summary>
        private void InitializeControlTypeCache()
        {
            try
            {
                _logger.Information("🎯 Initializing D365 form control type cache...");

                var metaModelAssembly = _reflectionManager.GetD365MetadataAssembly();
                
                // Find all form control types - they typically start with AxForm and inherit from AxFormControl
                var formControlTypes = metaModelAssembly.GetTypes().Where(t =>
                    t.IsClass &&
                    !t.IsAbstract &&
                    t.Namespace == "Microsoft.Dynamics.AX.Metadata.MetaModel" &&
                    (t.Name.StartsWith("AxForm") || IsFormControlType(t))
                ).ToList();

                foreach (var type in formControlTypes)
                {
                    // Cache with both full name and shortened name
                    _controlTypeCache[type.Name] = type;
                    
                    // Also cache without the AxForm prefix for easier lookup
                    if (type.Name.StartsWith("AxForm"))
                    {
                        var shortName = type.Name.Substring(6); // Remove "AxForm"
                        if (!_controlTypeCache.ContainsKey(shortName))
                        {
                            _controlTypeCache[shortName] = type;
                        }
                    }
                }

                _logger.Information("✅ Cached {Count} form control types", _controlTypeCache.Count);
                _logger.Information("📋 Sample control types: {SampleTypes}", 
                    string.Join(", ", _controlTypeCache.Keys.Take(20)));
                    
                // Show specific types that patterns typically need
                var patternControlTypes = new[] { "ActionPane", "Group", "QuickFilterControl", "Grid", "Tab", "TabPage" };
                foreach (var controlType in patternControlTypes)
                {
                    var hasType = _controlTypeCache.ContainsKey(controlType) || _controlTypeCache.ContainsKey($"AxForm{controlType}");
                    _logger.Information("🔍 Control type '{ControlType}': {Status}", controlType, hasType ? "FOUND" : "MISSING");
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Failed to initialize control type cache");
            }
        }

        /// <summary>
        /// Check if a type is a form control by examining its inheritance
        /// </summary>
        private bool IsFormControlType(Type type)
        {
            try
            {
                // Check if it inherits from AxFormControl or similar base classes
                var baseType = type.BaseType;
                while (baseType != null)
                {
                    if (baseType.Name == "AxFormControl" || 
                        baseType.Name == "AxFormElement" ||
                        baseType.Name.Contains("FormControl"))
                    {
                        return true;
                    }
                    baseType = baseType.BaseType;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Create control for FormControlType values - including special cases like QuickFilterControl
        /// </summary>
        public object CreateControlByFormControlType(string formControlTypeName)
        {
            if (string.IsNullOrEmpty(formControlTypeName))
                return null;

            _logger.Information("🔍 Creating control for FormControlType: '{FormControlType}'", formControlTypeName);

            // Special case: QuickFilterControl is a FormControl with Type=Custom + FormControlExtension
            if (formControlTypeName == "QuickFilterControl")
            {
                _logger.Information("🎯 Creating QuickFilterControl as base FormControl with extension");
                
                if (_controlTypeCache.TryGetValue("AxFormControl", out var baseControlType))
                {
                    try
                    {
                        var instance = Activator.CreateInstance(baseControlType);
                        InitializeControl(instance, baseControlType);
                        
                        // Set Type to Custom for QuickFilter
                        var typeProp = baseControlType.GetProperty("Type");
                        if (typeProp != null && typeProp.CanWrite)
                        {
                            // Find FormControlType.Custom enum value
                            var formControlTypeEnum = _reflectionManager.GetD365MetadataAssembly()
                                .GetTypes()
                                .FirstOrDefault(t => t.Name == "FormControlType" && t.IsEnum);
                            
                            if (formControlTypeEnum != null)
                            {
                                var customValue = Enum.Parse(formControlTypeEnum, "Custom");
                                typeProp.SetValue(instance, customValue);
                                _logger.Information("✅ Set QuickFilterControl Type to Custom");
                            }
                        }
                        
                        // CRITICAL: Initialize and set FormControlExtension.Name = "QuickFilterControl" for pattern matching
                        // According to DotPeek analysis, PatternNodeIdentity returns "Custom,QuickFilterControl" 
                        // when FormControlExtension.Name is set, enabling pattern match
                        var extensionProperty = baseControlType.GetProperty("FormControlExtension");
                        if (extensionProperty != null)
                        {
                            var extensionValue = extensionProperty.GetValue(instance);
                            if (extensionValue == null)
                            {
                                // FormControlExtension is null, we need to create it
                                var extensionType = extensionProperty.PropertyType;
                                _logger.Information("🔧 Creating FormControlExtension of type: {ExtensionType}", extensionType.Name);
                                try 
                                {
                                    var newExtension = Activator.CreateInstance(extensionType);
                                    extensionProperty.SetValue(instance, newExtension);
                                    extensionValue = newExtension;
                                    _logger.Information("✅ Created FormControlExtension instance");
                                }
                                catch (Exception extEx)
                                {
                                    _logger.Warning(extEx, "Failed to create FormControlExtension - trying to find parameterized constructor");
                                    
                                    // Try to find a constructor that takes parameters
                                    var constructors = extensionType.GetConstructors();
                                    foreach (var ctor in constructors)
                                    {
                                        var parameters = ctor.GetParameters();
                                        _logger.Information("Constructor found with {ParamCount} parameters: {Params}", 
                                            parameters.Length, 
                                            string.Join(", ", parameters.Select(p => $"{p.ParameterType.Name} {p.Name}")));
                                    }
                                }
                            }
                            
                            if (extensionValue != null)
                            {
                                var nameProperty = extensionValue.GetType().GetProperty("Name");
                                if (nameProperty != null && nameProperty.CanWrite)
                                {
                                    nameProperty.SetValue(extensionValue, "QuickFilterControl");
                                    _logger.Information("✅ Set FormControlExtension.Name = 'QuickFilterControl' for pattern matching");
                                }
                                else
                                {
                                    _logger.Warning("⚠️ FormControlExtension.Name property not found or not writable");
                                }
                            }
                            else
                            {
                                _logger.Warning("⚠️ Could not initialize FormControlExtension - pattern matching may fail");
                            }
                        }
                        
                        // Apply pattern-required properties
                        ApplyPatternRequiredProperties(instance, baseControlType);
                        _logger.Information("✅ Successfully created QuickFilterControl with extension");
                        return instance;
                    }
                    catch (Exception ex)
                    {
                        _logger.Warning(ex, "Failed to create QuickFilterControl with extension");
                    }
                }
            }

            // Skip truly virtual pattern types that have no control representation  
            var virtualPatternTypes = new[] { 
                "FormDesign", 
                "$Field",           // Virtual field placeholder used in patterns
                "$Group",           // Virtual group placeholder  
                "$Control",         // Generic virtual control placeholder
                "$Container",       // Virtual container placeholder
                "$DataSource",      // Virtual datasource placeholder
                "$Reference"        // Virtual reference placeholder
            };
            if (virtualPatternTypes.Contains(formControlTypeName))
            {
                _logger.Information("⏭️ Skipping virtual pattern type: '{PatternType}' (no concrete control needed)", formControlTypeName);
                return null;
            }

            // For actual FormControlType enum values, use direct instantiation
            var concreteTypeName = $"AxForm{formControlTypeName}Control";
            
            if (_controlTypeCache.TryGetValue(concreteTypeName, out var controlType))
            {
                _logger.Information("✅ Found concrete type: {TypeName} for FormControlType: {FormControlType}", 
                    controlType.Name, formControlTypeName);
                
                try
                {
                    var instance = Activator.CreateInstance(controlType);
                    InitializeControl(instance, controlType);
                    
                    _logger.Information("✅ Successfully created {TypeName}", controlType.Name);
                    return instance;
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Failed to create instance of {ControlType}", controlType.Name);
                    return null;
                }
            }

            _logger.Information("ℹ️ No concrete class found for '{FormControlType}' - may be virtual pattern type or extension", formControlTypeName);
            return null;
        }

        /// <summary>
        /// Get a form control type by name with EXACT matching only - no more smart mapping!
        /// </summary>
        public Type GetControlType(string controlTypeName)
        {
            if (string.IsNullOrEmpty(controlTypeName))
                return null;

            _logger.Information("🔍 Looking for EXACT control type: '{ControlTypeName}'", controlTypeName);

            // Try EXACT match only - no more guessing!
            if (_controlTypeCache.TryGetValue(controlTypeName, out var type))
            {
                _logger.Information("✅ Found EXACT match: {TypeName}", type.Name);
                return type;
            }

            // Try with AxForm prefix (common case)
            var axFormName = $"AxForm{controlTypeName}";
            if (_controlTypeCache.TryGetValue(axFormName, out var axFormType))
            {
                _logger.Information("✅ Found with AxForm prefix: {TypeName}", axFormType.Name);
                return axFormType;
            }

            // List what we actually have for debugging
            _logger.Warning("❌ Control type '{ControlTypeName}' does NOT exist in D365 metadata", controlTypeName);
            
            var possibleMatches = _controlTypeCache.Keys
                .Where(k => k.ToLowerInvariant().Contains(controlTypeName.ToLowerInvariant()))
                .Take(5)
                .ToArray();
                
            if (possibleMatches.Any())
            {
                _logger.Information("📋 Possible similar types: {SimilarTypes}", string.Join(", ", possibleMatches));
            }
            else
            {
                _logger.Warning("📋 NO similar types found for '{ControlTypeName}'", controlTypeName);
                _logger.Information("📋 Available control types sample: {AvailableTypes}", 
                    string.Join(", ", _controlTypeCache.Keys.Take(10)));
            }

            return null;
        }

        /// <summary>
        /// Create a form control instance with proper initialization  
        /// </summary>
        public object CreateControl(string controlTypeName)
        {
            try
            {
                var controlType = GetControlType(controlTypeName);
                if (controlType == null)
                {
                    return null;
                }

                _logger.Information("🎛️ Creating control: {ControlType}", controlType.Name);

                // Create instance
                var instance = Activator.CreateInstance(controlType);
                if (instance == null)
                {
                    _logger.Warning("❌ Failed to create instance of {ControlType}", controlType.Name);
                    return null;
                }

                // Initialize the control properly (like D365 constructors do)
                InitializeControl(instance, controlType);

                _logger.Information("✅ Successfully created and initialized {ControlType}", controlType.Name);
                return instance;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error creating control {ControlTypeName}", controlTypeName);
                return null;
            }
        }

        /// <summary>
        /// Initialize a control instance by calling SetDefaultValues and InitializeNullCollections
        /// </summary>
        private void InitializeControl(object control, Type controlType)
        {
            try
            {
                // Call SetDefaultValues() to initialize essential properties
                var setDefaultValuesMethod = controlType.GetMethod("SetDefaultValues", 
                    BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public, 
                    null, Type.EmptyTypes, null);
                    
                if (setDefaultValuesMethod != null)
                {
                    setDefaultValuesMethod.Invoke(control, null);
                    _logger.Debug("✅ Called SetDefaultValues() for {ControlType}", controlType.Name);
                    
                    // DIAGNOSTIC: Check if Type property was set correctly by SetDefaultValues
                    var typeProperty = controlType.GetProperty("Type");
                    if (typeProperty != null)
                    {
                        var typeValue = typeProperty.GetValue(control);
                        _logger.Information("🔍 DIAGNOSTIC: {ControlType} Type property = {TypeValue} ({TypeType})", 
                            controlType.Name, typeValue?.ToString() ?? "null", typeValue?.GetType().Name ?? "null");
                    }
                    else
                    {
                        _logger.Warning("⚠️ DIAGNOSTIC: {ControlType} has no Type property!", controlType.Name);
                    }
                    
                    // Apply pattern-specific property requirements
                    ApplyPatternRequiredProperties(control, controlType);
                }

                // Call InitializeNullCollections() to initialize collection properties
                var initCollectionsMethod = controlType.GetMethod("InitializeNullCollections", 
                    BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public, 
                    null, Type.EmptyTypes, null);
                    
                if (initCollectionsMethod != null)
                {
                    initCollectionsMethod.Invoke(control, null);
                    _logger.Debug("✅ Called InitializeNullCollections() for {ControlType}", controlType.Name);
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error initializing control {ControlType}", controlType.Name);
            }
        }

        /// <summary>
        /// Set the Name property on a control
        /// </summary>
        public void SetControlName(object control, string name)
        {
            try
            {
                if (control == null || string.IsNullOrEmpty(name))
                    return;

                var controlType = control.GetType();
                var nameProperty = controlType.GetProperty("Name");
                
                if (nameProperty != null && nameProperty.CanWrite)
                {
                    nameProperty.SetValue(control, name);
                    _logger.Debug("🏷️ Set control name: {Name}", name);
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Failed to set control name to {Name}", name);
            }
        }

        /// <summary>
        /// Get all available control type names
        /// </summary>
        public IEnumerable<string> GetAvailableControlTypes()
        {
            return _controlTypeCache.Keys.OrderBy(k => k);
        }

        /// <summary>
        /// Check if a control type is available
        /// </summary>
        public bool HasControlType(string controlTypeName)
        {
            return GetControlType(controlTypeName) != null;
        }

        /// <summary>
        /// Get statistics about cached control types
        /// </summary>
        public object GetCacheStatistics()
        {
            var axFormTypes = _controlTypeCache.Keys.Count(k => k.StartsWith("AxForm"));
            var shortNameTypes = _controlTypeCache.Keys.Count(k => !k.StartsWith("AxForm"));
            
            return new
            {
                TotalTypes = _controlTypeCache.Count,
                AxFormTypes = axFormTypes,
                ShortNameTypes = shortNameTypes,
                SampleTypes = _controlTypeCache.Keys.Take(20).ToArray()
            };
        }

        /// <summary>
        /// Apply pattern-specific property requirements based on SimpleListDetails pattern XML
        /// </summary>
        private void ApplyPatternRequiredProperties(object control, Type controlType)
        {
            try
            {
                var controlTypeName = controlType.Name;
                
                // Apply properties based on the SimpleListDetails pattern requirements
                switch (controlTypeName)
                {
                    case "AxFormActionPaneControl":
                        SetPropertyIfExists(control, controlType, "Style", "Standard");
                        _logger.Information("🔧 Applied ActionPane pattern properties");
                        break;
                        
                    case "AxFormGroupControl":
                        // Different groups have different requirements in the pattern
                        // For now, apply common group properties
                        SetPropertyIfExists(control, controlType, "FrameType", "None");
                        SetPropertyIfExists(control, controlType, "Caption", "");
                        _logger.Information("🔧 Applied Group pattern properties");
                        break;
                        
                    case "AxFormGridControl":
                        SetPropertyIfExists(control, controlType, "Style", "List");
                        SetPropertyIfExists(control, controlType, "ShowRowLabels", false);
                        SetPropertyIfExists(control, controlType, "MultiSelect", false);
                        SetPropertyIfExists(control, controlType, "AllowEdit", false);
                        SetPropertyIfExists(control, controlType, "WidthMode", "SizeToContent");
                        SetPropertyIfExists(control, controlType, "Width", -1);
                        SetPropertyIfExists(control, controlType, "HeightMode", "SizeToAvailable");
                        SetPropertyIfExists(control, controlType, "Height", -1);
                        _logger.Information("🔧 Applied Grid pattern properties");
                        break;
                        
                    case "AxFormTabControl":
                        SetPropertyIfExists(control, controlType, "Style", "FastTabs");
                        SetPropertyIfExists(control, controlType, "WidthMode", "SizeToAvailable");
                        SetPropertyIfExists(control, controlType, "Width", -1);
                        SetPropertyIfExists(control, controlType, "HeightMode", "SizeToAvailable");
                        SetPropertyIfExists(control, controlType, "Height", -1);
                        _logger.Information("🔧 Applied Tab pattern properties");
                        break;
                        
                    case "AxFormTabPageControl":
                        SetPropertyIfExists(control, controlType, "PanelStyle", "Auto");
                        _logger.Information("🔧 Applied TabPage pattern properties");
                        break;
                        
                    case "AxFormControl": // QuickFilterControl
                        SetPropertyIfExists(control, controlType, "WidthMode", "SizeToAvailable");
                        _logger.Information("🔧 Applied QuickFilterControl pattern properties");
                        break;
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to apply pattern properties for {ControlType}", controlType.Name);
            }
        }

        /// <summary>
        /// Helper method to set a property if it exists on the control
        /// </summary>
        private void SetPropertyIfExists(object control, Type controlType, string propertyName, object value)
        {
            try
            {
                var property = controlType.GetProperty(propertyName);
                if (property != null && property.CanWrite)
                {
                    // Convert string values to appropriate enum types if needed
                    object convertedValue = ConvertValueForProperty(value, property.PropertyType);
                    property.SetValue(control, convertedValue);
                    _logger.Debug("✅ Set {PropertyName} = {Value} on {ControlType}", propertyName, convertedValue, controlType.Name);
                }
                else
                {
                    _logger.Debug("⚠️ Property {PropertyName} not found or not writable on {ControlType}", propertyName, controlType.Name);
                }
            }
            catch (Exception ex)
            {
                _logger.Debug(ex, "Failed to set property {PropertyName} on {ControlType}", propertyName, controlType.Name);
            }
        }

        /// <summary>
        /// Convert values to appropriate types for properties (especially enums)
        /// </summary>
        private object ConvertValueForProperty(object value, Type targetType)
        {
            if (value == null) return null;
            
            // If types match, return as-is
            if (targetType.IsAssignableFrom(value.GetType()))
                return value;
            
            // Handle enum conversions
            if (targetType.IsEnum && value is string stringValue)
            {
                try
                {
                    return Enum.Parse(targetType, stringValue, true);
                }
                catch
                {
                    _logger.Debug("Failed to parse enum {EnumType} from value {Value}", targetType.Name, stringValue);
                    return value;
                }
            }
            
            // Handle boolean conversions
            if (targetType == typeof(bool) && value is string boolString)
            {
                if (bool.TryParse(boolString, out bool boolValue))
                    return boolValue;
            }
            
            // Handle int conversions
            if (targetType == typeof(int) && value is string intString)
            {
                if (int.TryParse(intString, out int intValue))
                    return intValue;
            }
            
            return value;
        }
    }
}