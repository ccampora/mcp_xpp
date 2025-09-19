using System.Threading.Tasks;
using D365MetadataService.Models;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Interface for template guidance services
    /// Supports both sync and async implementations
    /// </summary>
    public interface ITemplateGuidanceService
    {
        /// <summary>
        /// Get template guidance for a specific object type
        /// </summary>
        Task<TemplateGuidance> GetTemplateGuidanceAsync(string objectType);
    }
}