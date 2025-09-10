using D365MetadataService.Models;
using Microsoft.Dynamics.AX.Metadata.Storage;
using Newtonsoft.Json;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// COMPREHENSIVE Handler for listing ALL objects by model using D365 metadata DLLs
    /// Enhanced to enumerate ALL object types: AxTable, AxClass, AxForm, AxEnum, AxView, AxDataEntityView, etc.
    /// This fixes the cache indexing issue where only tables were being returned
    /// </summary>
    public class ListObjectsByModelHandler : BaseRequestHandler
    {
        private readonly ServiceConfiguration _config;

        public override string SupportedAction => "list_objects_by_model";

        public ListObjectsByModelHandler(ServiceConfiguration config, ILogger logger) : base(logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            Logger.Information("Starting COMPREHENSIVE list objects by model request");

            try
            {
                // Get target models from request parameters first
                var requestedModel = request.Parameters?.ContainsKey("model") == true ? request.Parameters["model"] as string : null;
                
                // Get metadata path from request or determine based on model
                var metadataPath = request.Parameters?.ContainsKey("metadataPath") == true ? request.Parameters["metadataPath"] as string : null;
                
                // If no explicit path provided, determine the correct path based on the requested model
                if (string.IsNullOrEmpty(metadataPath))
                {
                    // Check if this is a custom model by looking for it in custom metadata path first
                    if (!string.IsNullOrEmpty(requestedModel))
                    {
                        try
                        {
                            // Try custom metadata path first for models like 'cc', 'dd', etc.
                            var customFactory = new MetadataProviderFactory();
                            var customProvider = customFactory.CreateDiskProvider(_config.D365Config.CustomMetadataPath);
                            
                            if (customProvider?.ModelManifest != null)
                            {
                                var customModels = customProvider.ModelManifest.ListModels();
                                if (customModels != null && customModels.Contains(requestedModel))
                                {
                                    metadataPath = _config.D365Config.CustomMetadataPath;
                                    Logger.Information("Using custom metadata path for model {Model}: {Path}", requestedModel, metadataPath);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Logger.Debug("Could not check custom metadata path for model {Model}: {Error}", requestedModel, ex.Message);
                        }
                    }
                    
                    // If not found in custom path, use standard packages path
                    if (string.IsNullOrEmpty(metadataPath))
                    {
                        metadataPath = _config.D365Config.PackagesLocalDirectory;
                        Logger.Information("Using standard packages path for model {Model}: {Path}", requestedModel, metadataPath);
                    }
                }
                
                if (string.IsNullOrEmpty(requestedModel))
                {
                    return new ServiceResponse { Success = false, Error = "Model parameter is required. Please specify which model to enumerate (e.g., 'Foundation', 'ApplicationSuite', etc.)" };
                }

                var targetModels = new[] { requestedModel };

                // Execute the CPU-bound metadata work on a background thread
                var response = await Task.Run(() => PerformMetadataWork(targetModels, metadataPath));

                Logger.Information("Successfully enumerated ALL object types from models");

                return new ServiceResponse { Success = true, Data = response };
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to list objects by model");
                return new ServiceResponse { Success = false, Error = $"Failed to list objects by model: {ex.Message}" };
            }
        }

        private object PerformMetadataWork(string[] targetModels, string metadataPath)
        {
            // ENHANCED: Use the proper D365 metadata APIs to enumerate ALL object types
            var factory = new MetadataProviderFactory();
            var provider = factory.CreateDiskProvider(metadataPath);

            var models = new List<object>();
            var totalObjects = 0;
            var modelsProcessed = 0;

            foreach (var modelName in targetModels)
            {
                try
                {
                    Logger.Information("🔍 Comprehensively processing model: {ModelName}", modelName);
                    
                    var objects = new Dictionary<string, IEnumerable<string>>();
                    var modelObjectCount = 0;

                    // 1. TABLES (AxTable)
                    try
                    {
                        var tables = provider.Tables.ListObjectsForModel(modelName);
                        if (tables != null && tables.Any())
                        {
                            var tableList = tables.ToList();
                            objects["AxTable"] = tableList;
                            modelObjectCount += tableList.Count;
                            Logger.Debug("   📋 Tables: {Count}", tableList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get tables for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 2. CLASSES (AxClass)
                    try
                    {
                        var classes = provider.Classes.ListObjectsForModel(modelName);
                        if (classes != null && classes.Any())
                        {
                            var classList = classes.ToList();
                            objects["AxClass"] = classList;
                            modelObjectCount += classList.Count;
                            Logger.Debug("   📋 Classes: {Count}", classList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get classes for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 3. FORMS (AxForm)
                    try
                    {
                        var forms = provider.Forms.ListObjectsForModel(modelName);
                        if (forms != null && forms.Any())
                        {
                            var formsList = forms.ToList();
                            objects["AxForm"] = formsList;
                            modelObjectCount += formsList.Count;
                            Logger.Debug("   📋 Forms: {Count}", formsList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get forms for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 4. ENUMS (AxEnum)
                    try
                    {
                        var enums = provider.Enums.ListObjectsForModel(modelName);
                        if (enums != null && enums.Any())
                        {
                            var enumsList = enums.ToList();
                            objects["AxEnum"] = enumsList;
                            modelObjectCount += enumsList.Count;
                            Logger.Debug("   📋 Enums: {Count}", enumsList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get enums for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 5. VIEWS (AxView)
                    try
                    {
                        var views = provider.Views.ListObjectsForModel(modelName);
                        if (views != null && views.Any())
                        {
                            var viewsList = views.ToList();
                            objects["AxView"] = viewsList;
                            modelObjectCount += viewsList.Count;
                            Logger.Debug("   📋 Views: {Count}", viewsList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get views for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 6. DATA ENTITIES (AxDataEntityView)
                    try
                    {
                        var dataEntities = provider.DataEntityViews.ListObjectsForModel(modelName);
                        if (dataEntities != null && dataEntities.Any())
                        {
                            var dataEntitiesList = dataEntities.ToList();
                            objects["AxDataEntityView"] = dataEntitiesList;
                            modelObjectCount += dataEntitiesList.Count;
                            Logger.Debug("   📋 Data Entities: {Count}", dataEntitiesList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get data entities for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 7. EXTENDED DATA TYPES (AxEdt)
                    try
                    {
                        var edts = provider.Edts.ListObjectsForModel(modelName);
                        if (edts != null && edts.Any())
                        {
                            var edtsList = edts.ToList();
                            objects["AxEdt"] = edtsList;
                            modelObjectCount += edtsList.Count;
                            Logger.Debug("   📋 EDTs: {Count}", edtsList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get EDTs for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 8. REPORTS (AxReport)
                    try
                    {
                        var reports = provider.Reports.ListObjectsForModel(modelName);
                        if (reports != null && reports.Any())
                        {
                            var reportsList = reports.ToList();
                            objects["AxReport"] = reportsList;
                            modelObjectCount += reportsList.Count;
                            Logger.Debug("   📋 Reports: {Count}", reportsList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get reports for {Model}: {Error}", modelName, ex.Message);
                    }

                    // 9. MENU ITEMS (AxMenuItemDisplay, AxMenuItemOutput, AxMenuItemAction)
                    try
                    {
                        var menuItemsDisplay = provider.MenuItemDisplays.ListObjectsForModel(modelName);
                        if (menuItemsDisplay != null && menuItemsDisplay.Any())
                        {
                            var menuItemsDisplayList = menuItemsDisplay.ToList();
                            objects["AxMenuItemDisplay"] = menuItemsDisplayList;
                            modelObjectCount += menuItemsDisplayList.Count;
                            Logger.Debug("   📋 Menu Items (Display): {Count}", menuItemsDisplayList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get menu items (display) for {Model}: {Error}", modelName, ex.Message);
                    }

                    try
                    {
                        var menuItemsOutput = provider.MenuItemOutputs.ListObjectsForModel(modelName);
                        if (menuItemsOutput != null && menuItemsOutput.Any())
                        {
                            var menuItemsOutputList = menuItemsOutput.ToList();
                            objects["AxMenuItemOutput"] = menuItemsOutputList;
                            modelObjectCount += menuItemsOutputList.Count;
                            Logger.Debug("   📋 Menu Items (Output): {Count}", menuItemsOutputList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get menu items (output) for {Model}: {Error}", modelName, ex.Message);
                    }

                    try
                    {
                        var menuItemsAction = provider.MenuItemActions.ListObjectsForModel(modelName);
                        if (menuItemsAction != null && menuItemsAction.Any())
                        {
                            var menuItemsActionList = menuItemsAction.ToList();
                            objects["AxMenuItemAction"] = menuItemsActionList;
                            modelObjectCount += menuItemsActionList.Count;
                            Logger.Debug("   📋 Menu Items (Action): {Count}", menuItemsActionList.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        Logger.Warning("   ⚠️ Failed to get menu items (action) for {Model}: {Error}", modelName, ex.Message);
                    }

                    // Only add model if we found objects
                    if (modelObjectCount > 0)
                    {
                        var modelData = new
                        {
                            name = modelName,
                            objectCount = modelObjectCount,
                            objects = objects
                        };

                        models.Add(modelData);
                        totalObjects += modelObjectCount;
                        modelsProcessed++;

                        Logger.Information("✅ Found {Count} total objects in model {Model}", modelObjectCount, modelName);
                    }
                    else
                    {
                        Logger.Information("   ⚠️ No objects found in model {Model}", modelName);
                    }
                }
                catch (Exception ex)
                {
                    Logger.Warning("Failed to process model {Model}: {Error}", modelName, ex.Message);
                    // Continue processing other models
                }
            }

            var distinctObjectTypes = models.Cast<dynamic>()
                .SelectMany(m => (IEnumerable<string>)m.objects.Keys)
                .Distinct()
                .Count();

            Logger.Information("🎉 COMPREHENSIVE enumeration complete: {TotalObjects} objects across {ObjectTypes} types", 
                totalObjects, 
                distinctObjectTypes);

            return new
            {
                totalObjects,
                modelsProcessed,
                models,
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            };
        }
    }
}
