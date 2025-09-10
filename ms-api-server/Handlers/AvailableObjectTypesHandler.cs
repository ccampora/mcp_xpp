using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Dynamics.AX.Metadata.MetaModel;
using Microsoft.Dynamics.Framework.Tools.MetaModel.Core;
using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for retrieving available object types from VS2022 service
    /// REFACTORED: Now uses centralized D365ReflectionManager for consistent, cached reflection operations
    /// </summary>
    public class AvailableObjectTypesHandler : BaseRequestHandler
    {
        private readonly D365ReflectionManager _reflectionManager;

        public AvailableObjectTypesHandler(D365ReflectionManager reflectionManager, ILogger logger) : base(logger)
        {
            _reflectionManager = reflectionManager ?? throw new ArgumentNullException(nameof(reflectionManager));
        }

        public override string SupportedAction => "getAvailableObjectTypes";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            try
            {
                // 🚀 REFACTORED: Use centralized reflection manager instead of scattered logic
                var availableTypes = _reflectionManager.GetSupportedObjectTypes();

                return Task.FromResult(ServiceResponse.CreateSuccess(new
                {
                    ObjectTypes = availableTypes,
                    Count = availableTypes.Length,
                    Statistics = _reflectionManager.GetStatistics()
                }));
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to get available object types");
                return Task.FromResult(ServiceResponse.CreateError(
                    $"Failed to get available object types: {ex.Message}"));
            }
        }
    }
}
