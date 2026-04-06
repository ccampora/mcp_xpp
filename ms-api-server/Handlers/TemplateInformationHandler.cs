// #if FALSE // DISABLED FOR DEMO - Has compilation errors that need to be resolved
// using D365MetadataService.Models;
// using D365MetadataService.Services;
// using Serilog;
// using System;
// using System.Collections.Generic;
// using System.Linq;
// using System.Threading.Tasks;


// namespace D365MetadataService.Handlers
// {
//     /// <summary>
//     /// Dedicated handler for template information extraction and wizard reflection
//     /// Provides detailed information about D365 object templates and their wizard classes
//     /// </summary>
//     public class TemplateInformationHandler : BaseRequestHandler
//     {
//         private readonly FileSystemManager _fileManager;
//         public TemplateInformationHandler(ILogger logger) : base(logger)
//         {
//             _fileManager = FileSystemManager.Instance;
//         }

//         public override string SupportedAction => "get_template_information";

//         protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
//         {
//             await Task.CompletedTask; // Make method async for consistency

//             if (request.Parameters?.ContainsKey("objectType") != true && 
//                 string.IsNullOrEmpty(request.ObjectType))
//             {
//                 return ServiceResponse.CreateError("objectType parameter is required to identify the template");
//             }

//             string objectType = request.Parameters["objectType"]?.ToString();

//             Logger.Information("Handling get_template_information request for {AxObjectType}", objectType);

//             var templatesInfo = GetTemplatesInformationForObjectType(objectType);

//             return ServiceResponse.CreateSuccess(templatesInfo);
//         }

//         public object[] GetTemplatesInformationForObjectType(string objectType)
//         {
//             _fileManager.GetVSTemplateInfo
//             // Logic to retrieve templates information for the specified object type
//             return Array.Empty<object>();
//         }

//         /// <summary>
//         /// Gets detailed information for a specific template with wizard reflection
//         /// templateName is <string>.vstemplate format
//         /// </summary>
//         public object GetTemplatesInformation(string templateName)
//         {
//             try
//             {
//                 if (string.IsNullOrEmpty(templateName))
//                 {
//                     return new { Error = "Template name is required" };
//                 }

//                 // Extract wizard class information using reflection
//                 var wizardInfo = InspectWizardClass(templateName);

//                 var templateInfo = wizardInfo;

//                 Logger.Information("Retrieved template information for {TemplateName} with wizard class {WizardClass}",
//                     templateName, wizardInfo?.WizardClass ?? "None");
//                 return templateInfo;
//             }
//             catch (Exception ex)
//             {
//                 Logger.Error(ex, "Error getting template information for {TemplateName}", templateName);
//                 return new { Error = $"Error retrieving template information: {ex.Message}" };
//             }
//         }

//         /// <summary>
//         /// Uses reflection to inspect wizard classes and extract meaningful information
//         /// </summary>
//         private dynamic InspectWizardClass(string templateName)
//         {
//             try
//             {
//                 // Read the xaml files with WizardClass
//                 wizardClassName = InspectVsTemplate(templateName);

                

//                 // Use reflection to inspect the wizard class
//                 var wizardInfo = ReflectOnWizardClass(wizardClassName);
                
//                 return new
//                 {
//                     DisplayName = templateName.Replace("Item", " Item").Replace("Files", " Files"),
//                     Description = $"D365 template: {templateName}",
//                     WizardClass = wizardClassName,
//                     AssemblyName = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.17.0",
//                     WizardInfo = wizardInfo
//                 };
//             }
//             catch (Exception ex)
//             {
//                 Logger.Warning(ex, "Could not inspect wizard class for template {TemplateName}", templateName);
//                 return new
//                 {
//                     DisplayName = templateName,
//                     Description = $"D365 template: {templateName}",
//                     WizardClass = "Unknown",
//                     AssemblyName = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.17.0",
//                     WizardInfo = new { Type = "Error", HasCustomParameters = false, Error = ex.Message }
//                 };
//             }
//         }

//         /// <summary>
//         /// Reflects on wizard class to extract parameters, properties, and methods
//         /// </summary>
//         private dynamic ReflectOnWizardClass(string wizardClassName)
//         {
//             try
//             {
//                 // Try to load the D365 extension assembly
//                 var assembly = LoadD365Assembly();
//                 if (assembly == null)
//                 {
//                     return new { Type = "Unknown", HasCustomParameters = false, Error = "Could not load D365 assembly" };
//                 }

//                 // Get the wizard class type
//                 var wizardType = assembly.GetType(wizardClassName);
//                 if (wizardType == null)
//                 {
//                     return new { Type = "Unknown", HasCustomParameters = false, Error = $"Wizard class {wizardClassName} not found" };
//                 }

//                 Logger.Information("Successfully loaded wizard class: {WizardClass}", wizardClassName);

//                 // Analyze the wizard class
//                 var constructors = wizardType.GetConstructors();
//                 var properties = wizardType.GetProperties();
//                 var methods = wizardType.GetMethods().Where(m => m.IsPublic && !m.IsSpecialName).ToArray();
                
//                 // Look for wizard-specific patterns
//                 var wizardSteps = methods.Where(m => m.Name.Contains("Step") || m.Name.Contains("Page") || m.Name.Contains("Dialog")).ToArray();
//                 var parameterProperties = properties.Where(p => 
//                     p.Name.Contains("Parameter") || 
//                     p.Name.Contains("Config") || 
//                     p.Name.Contains("Setting") ||
//                     p.Name.Contains("File") ||
//                     p.Name.Contains("Language") ||
//                     p.Name.Contains("Id")).ToArray();
                
//                 // Check for interfaces that indicate wizard functionality
//                 var interfaces = wizardType.GetInterfaces();
//                 var isWizard = interfaces.Any(i => i.Name.Contains("Wizard") || i.Name.Contains("Dialog"));
                
//                 return new
//                 {
//                     Type = wizardType.Name,
//                     IsWizard = isWizard,
//                     HasCustomParameters = parameterProperties.Length > 0 || constructors.Any(c => c.GetParameters().Length > 0),
//                     ConstructorParameters = constructors.SelectMany(c => c.GetParameters().Select(p => new { 
//                         Name = p.Name, 
//                         Type = p.ParameterType.Name,
//                         IsOptional = p.IsOptional,
//                         DefaultValue = p.HasDefaultValue ? p.DefaultValue : null
//                     })).ToArray(),
//                     Properties = parameterProperties.Select(p => new { 
//                         Name = p.Name, 
//                         Type = p.PropertyType.Name,
//                         CanRead = p.CanRead,
//                         CanWrite = p.CanWrite
//                     }).ToArray(),
//                     WizardSteps = wizardSteps.Select(m => new { 
//                         Name = m.Name, 
//                         ReturnType = m.ReturnType.Name,
//                         ParameterCount = m.GetParameters().Length
//                     }).ToArray(),
//                     Interfaces = interfaces.Select(i => i.Name).ToArray(),
//                     BaseType = wizardType.BaseType?.Name
//                 };
//             }
//             catch (Exception ex)
//             {
//                 Logger.Warning(ex, "Error reflecting on wizard class {WizardClass}", wizardClassName);
//                 return new { Type = "Error", HasCustomParameters = false, Error = ex.Message };
//             }
//         }

//         /// <summary>
//         /// Loads the D365 extension assembly for reflection
//         /// </summary>
//         private System.Reflection.Assembly LoadD365Assembly()
//         {
//             try
//             {
//                 // Path to D365 extension assemblies
//                 var extensionPath = @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions";
//                 var d365Extensions = System.IO.Directory.GetDirectories(extensionPath, "*", System.IO.SearchOption.AllDirectories)
//                     .Where(dir => System.IO.File.Exists(System.IO.Path.Combine(dir, "Microsoft.Dynamics.Framework.Tools.ProjectSystem.17.0.dll")))
//                     .FirstOrDefault();

//                 if (string.IsNullOrEmpty(d365Extensions))
//                 {
//                     Logger.Warning("Could not find D365 extension folder");
//                     return null;
//                 }

//                 var assemblyPath = System.IO.Path.Combine(d365Extensions, "Microsoft.Dynamics.Framework.Tools.ProjectSystem.17.0.dll");
//                 if (!System.IO.File.Exists(assemblyPath))
//                 {
//                     Logger.Warning("Could not find D365 assembly at {AssemblyPath}", assemblyPath);
//                     return null;
//                 }

//                 Logger.Information("Loading D365 assembly from {AssemblyPath}", assemblyPath);
//                 return System.Reflection.Assembly.LoadFrom(assemblyPath);
//             }
//             catch (Exception ex)
//             {
//                 Logger.Error(ex, "Error loading D365 assembly");
//                 return null;
//             }
//         }

//         /// <summary>
//         /// Returns known wizard classes for specific templates
//         /// </summary>
//         private string GetKnownWizardClass(string templateName)
//         {
//             // Based on known wizard classes from the documentation
//             var knownWizards = new Dictionary<string, string>
//             {
//                 ["LabelFiles"] = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.LabelFileWizardClass",
//                 ["DataEntityView"] = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.Wizards.DataEntityViewWizard",
//                 ["WorkflowApproval"] = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.Wizards.WorkflowWizard",
//                 ["WorkflowTask"] = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.Wizards.WorkflowWizard",
//                 ["WorkflowTemplate"] = "Microsoft.Dynamics.Framework.Tools.ProjectSystem.Wizards.WorkflowWizard"
//             };

//             return knownWizards.ContainsKey(templateName) ? knownWizards[templateName] : "Microsoft.Dynamics.Framework.Tools.ProjectSystem.ItemCreationWizard";
//         }

//         /// <summary>
//         /// Maps D365 metadata types to their corresponding AxObject types
//         /// Based on VS2022 ItemCreationWizard.TemplateToTypeMap analysis
//         /// </summary>
//         private Dictionary<string, string> GetDomainClassIdMappings(string objectType)
//         {
//             return new Dictionary<string, string>
//             {
//                 // Based on DotPeek analysis of ItemCreationWizard.TemplateToTypeMap
//                 // Format: DomainClassId → AxObjectType
//                 ["ClassItem.DomainClassId"] = "AxClass",
//                 ["Table.DomainClassId"] = "AxTable",
//                 ["Form.DomainClassId"] = "AxForm",
//                 ["Enum.DomainClassId"] = "AxEnum",
//                 ["View.DomainClassId"] = "AxView",
//                 ["Query.DomainClassId"] = "AxQuery",
//                 ["Report.DomainClassId"] = "AxReport",
//                 ["Menu.DomainClassId"] = "AxMenu",
//                 ["MenuItemAction.DomainClassId"] = "AxMenuItemAction",
//                 ["MenuItemDisplay.DomainClassId"] = "AxMenuItemDisplay",
//                 ["MenuItemOutput.DomainClassId"] = "AxMenuItemOutput",
//                 ["DataEntityView.DomainClassId"] = "AxDataEntityView",
//                 ["CompositeDataEntityView.DomainClassId"] = "AxCompositeDataEntityView",
//                 ["AggregateDataEntity.DomainClassId"] = "AxAggregateDataEntity",
//                 ["SecurityDuty.DomainClassId"] = "AxSecurityDuty",
//                 ["SecurityRole.DomainClassId"] = "AxSecurityRole",
//                 ["SecurityPrivilege.DomainClassId"] = "AxSecurityPrivilege",
//                 ["SecurityPolicy.DomainClassId"] = "AxSecurityPolicy",
//                 ["WorkflowCategory.DomainClassId"] = "AxWorkflowCategory",
//                 ["WorkflowApproval.DomainClassId"] = "AxWorkflowApproval",
//                 ["WorkflowTask.DomainClassId"] = "AxWorkflowTask",
//                 ["WorkflowTemplate.DomainClassId"] = "AxWorkflowTemplate",
//                 ["EdtString.DomainClassId"] = "AxEdtString",
//                 ["EdtInt.DomainClassId"] = "AxEdtInt",
//                 ["EdtReal.DomainClassId"] = "AxEdtReal",
//                 ["EdtDate.DomainClassId"] = "AxEdtDate",
//                 ["EdtEnum.DomainClassId"] = "AxEdtEnum",
//                 ["EdtGuid.DomainClassId"] = "AxEdtGuid",
//                 ["EdtContainer.DomainClassId"] = "AxEdtContainer",
//                 ["EdtTime.DomainClassId"] = "AxEdtTime",
//                 ["EdtUtcDateTime.DomainClassId"] = "AxEdtUtcDateTime",
//                 ["ConfigurationKey.DomainClassId"] = "AxConfigurationKey",
//                 ["ConfigurationKeyGroup.DomainClassId"] = "AxConfigurationKeyGroup",
//                 ["LicenseCode.DomainClassId"] = "AxLicenseCode",
//                 ["Service.DomainClassId"] = "AxService",
//                 ["ServiceGroup.DomainClassId"] = "AxServiceGroup",
//                 ["Map.DomainClassId"] = "AxMap",
//                 ["Resource.DomainClassId"] = "AxResource",
//                 ["KPI.DomainClassId"] = "AxKPI",
//                 ["Tile.DomainClassId"] = "AxTile",
//                 ["AggregateMeasurement.DomainClassId"] = "AxAggregateMeasurement",
//                 ["AggregateDimension.DomainClassId"] = "AxAggregateDimension",
//                 ["AggregateCalculatedMeasureTemplate.DomainClassId"] = "AxAggregateCalculatedMeasureTemplate",
//                 ["LabelFiles.DomainClassId"] = "AxLabelFile"
//             }.Where(kv => string.IsNullOrEmpty(objectType) || kv.Value.Equals(objectType, StringComparison.OrdinalIgnoreCase))
//              .ToDictionary(kv => kv.Key, kv => kv.Value);
//         }
//     }
// }
// #endif // DISABLED FOR DEMO