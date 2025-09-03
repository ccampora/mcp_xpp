using D365MetadataService.Models;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Interface for handling specific types of service requests
    /// </summary>
    public interface IRequestHandler
    {
        /// <summary>
        /// The action type this handler supports (e.g., "create", "models", "health")
        /// </summary>
        string SupportedAction { get; }

        /// <summary>
        /// Handle the service request and return a response
        /// </summary>
        /// <param name="request">The service request to handle</param>
        /// <returns>Service response</returns>
        Task<ServiceResponse> HandleAsync(ServiceRequest request);
    }
}
