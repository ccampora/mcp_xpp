using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for safe object deletion with dependency validation
    /// Supports deletion of D365 F&O objects with safety checks
    /// Phase 1: Basic deletion using D365ObjectFactory.DeleteObjectAsync
    /// Phase 2: Will add comprehensive dependency analysis
    /// </summary>
    public class DeleteObjectHandler : BaseRequestHandler
    {
        private readonly D365ObjectFactory _objectFactory;

        public DeleteObjectHandler(D365ObjectFactory objectFactory, ILogger logger) 
            : base(logger)
        {
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
        }

        public override string SupportedAction => "delete-object";

        protected override async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            try
            {
                // Validate request parameters
                var validationError = ValidateDeleteRequest(request);
                if (validationError != null)
                    return validationError;

                var objectName = request.Parameters["objectName"].ToString();
                var objectType = request.Parameters["objectType"].ToString();
                var cascadeDelete = request.Parameters.ContainsKey("cascadeDelete") && 
                                   Convert.ToBoolean(request.Parameters["cascadeDelete"]);

                Logger.Information("🗑️ Processing delete request: {ObjectName} ({ObjectType}), cascade: {CascadeDelete}",
                    objectName, objectType, cascadeDelete);

                // Phase 1: Basic deletion without comprehensive dependency analysis
                Logger.Information("ℹ️ Phase 1 implementation - performing deletion using D365ObjectFactory");

                // Perform the deletion using the object factory
                var deleteSuccess = await _objectFactory.DeleteObjectAsync(objectType, objectName);

                if (deleteSuccess)
                {
                    Logger.Information("✅ Successfully deleted {ObjectName} ({ObjectType})", objectName, objectType);
                    
                    return ServiceResponse.CreateSuccess(new
                    {
                        ObjectsDeleted = new[] { $"{objectName} ({objectType})" },
                        DependenciesFound = new object[0], // Phase 1: No dependency analysis yet
                        Warnings = new string[0],
                        Errors = new string[0],
                        Message = "Object deleted successfully",
                        Implementation = "Phase 1 - Using D365 metadata provider Delete method"
                    });
                }
                else
                {
                    Logger.Error("❌ Failed to delete {ObjectName} ({ObjectType})", objectName, objectType);
                    return ServiceResponse.CreateError($"Failed to delete object: {objectName} ({objectType}). Check logs for details.");
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "❌ Error in delete object handler");
                return ServiceResponse.CreateError($"Internal error during deletion: {ex.Message}");
            }
        }

        /// <summary>
        /// Validate delete request parameters
        /// </summary>
        private ServiceResponse ValidateDeleteRequest(ServiceRequest request)
        {
            if (request.Parameters == null)
                return ServiceResponse.CreateError("Parameters are required for delete operations");

            if (!request.Parameters.ContainsKey("objectName") || 
                string.IsNullOrWhiteSpace(request.Parameters["objectName"]?.ToString()))
                return ServiceResponse.CreateError("objectName is required");

            if (!request.Parameters.ContainsKey("objectType") || 
                string.IsNullOrWhiteSpace(request.Parameters["objectType"]?.ToString()))
                return ServiceResponse.CreateError("objectType is required");

            return null; // Valid
        }
    }
}