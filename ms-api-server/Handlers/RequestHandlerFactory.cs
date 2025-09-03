using D365MetadataService.Models;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Factory for creating and managing request handlers
    /// Follows the Factory Pattern + Registry Pattern
    /// </summary>
    public class RequestHandlerFactory
    {
        private readonly Dictionary<string, IRequestHandler> _handlers;
        private readonly ILogger _logger;

        public RequestHandlerFactory(IEnumerable<IRequestHandler> handlers, ILogger logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            
            // Register all handlers by their supported action
            _handlers = handlers.ToDictionary(h => h.SupportedAction.ToLower(), h => h);
            
            _logger.Information("Registered {HandlerCount} request handlers: {Actions}", 
                _handlers.Count, 
                string.Join(", ", _handlers.Keys));
        }

        /// <summary>
        /// Get a handler for the specified action
        /// </summary>
        public IRequestHandler GetHandler(string action)
        {
            if (string.IsNullOrEmpty(action))
            {
                throw new ArgumentException("Action cannot be null or empty", nameof(action));
            }

            var actionKey = action.ToLower();
            if (_handlers.TryGetValue(actionKey, out var handler))
            {
                return handler;
            }

            throw new NotSupportedException($"No handler registered for action: {action}");
        }

        /// <summary>
        /// Check if a handler exists for the specified action
        /// </summary>
        public bool HasHandler(string action)
        {
            return !string.IsNullOrEmpty(action) && _handlers.ContainsKey(action.ToLower());
        }

        /// <summary>
        /// Get all supported actions
        /// </summary>
        public IEnumerable<string> GetSupportedActions()
        {
            return _handlers.Keys;
        }
    }
}
