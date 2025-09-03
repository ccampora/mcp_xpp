using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using D365MetadataService.Models;
using Serilog;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Windows Named Pipe server for high-performance local IPC communication
    /// Replaces TCP socket approach for better Windows integration and performance
    /// </summary>
    public class NamedPipeServer
    {
        private readonly ServiceConfiguration _config;
        private readonly D365ObjectFactory _objectFactory;
        private readonly ILogger _logger;
        private readonly string _pipeName;
        private readonly int _maxConnections; // Store once during initialization
        private readonly CancellationTokenSource _cancellationTokenSource;
        private readonly List<Task> _activePipeHandlers;
        private bool _isRunning;

        public NamedPipeServer(ServiceConfiguration config, D365ObjectFactory objectFactory, ILogger logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _pipeName = "mcp-xpp-d365-service";
            _maxConnections = _config.MaxConnections; // Initialize once
            _cancellationTokenSource = new CancellationTokenSource();
            _activePipeHandlers = new List<Task>();
        }

        public Task StartAsync()
        {
            if (_isRunning)
            {
                _logger.Warning("Named Pipe Server is already running");
                return Task.CompletedTask;
            }

            try
            {
                _isRunning = true;

                _logger.Information("D365 Metadata Service starting on Named Pipe: {PipeName}", _pipeName);
                _logger.Information("Service Configuration: {@Config}", new { 
                    PipeName = _pipeName,
                    MaxConnections = _maxConnections, 
                    _config.D365Config.DefaultModel,
                    AssemblyPath = Path.GetFileName(_config.D365Config.MetadataAssemblyPath) 
                });

                // Start accepting connections using the Microsoft pattern (multiple pipe instances)
                _ = AcceptConnectionsAsync(_cancellationTokenSource.Token);

                _logger.Information("Named Pipe Server is ready to accept connections");
                return Task.CompletedTask;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to start Named Pipe Server");
                throw;
            }
        }

        public async Task StopAsync()
        {
            if (!_isRunning)
                return;

            _logger.Information("Stopping Named Pipe Server - signaling {ThreadCount} server threads to stop...", _activePipeHandlers.Count);

            _isRunning = false;
            _cancellationTokenSource?.Cancel();

            // Wait for all pipe handlers to complete
            try
            {
                await Task.WhenAll(_activePipeHandlers.ToArray());
                _logger.Information("All {ThreadCount} server threads have stopped gracefully", _activePipeHandlers.Count);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Error waiting for pipe handlers to complete during shutdown");
            }

            _activePipeHandlers.Clear();

            _logger.Information("Named Pipe Server stopped successfully");
        }

        private async Task AcceptConnectionsAsync(CancellationToken cancellationToken)
        {
            try
            {
                _logger.Information("Starting connection acceptance - creating {MaxConnections} persistent server threads", _maxConnections);

                // Create the fixed number of persistent server threads (Microsoft pattern)
                for (int i = 0; i < _maxConnections; i++)
                {
                    var serverTask = Task.Run(async () =>
                    {
                        var threadId = $"Thread-{i}";
                        _logger.Debug("Starting persistent server thread: {ThreadId}", threadId);

                        // Each thread continuously accepts connections until cancellation
                        while (!cancellationToken.IsCancellationRequested)
                        {
                            try
                            {
                                // Each connection gets its own pipe instance
                                using var pipeServer = CreatePipeServerInstance();
                                var connectionId = Guid.NewGuid().ToString();
                                
                                _logger.Debug("Server thread {ThreadId} waiting for connection: {ConnectionId}", threadId, connectionId);
                                await pipeServer.WaitForConnectionAsync(cancellationToken);
                                _logger.Debug("Client connected to {ThreadId}: {ConnectionId}", threadId, connectionId);

                                // Handle the client with this dedicated pipe instance
                                await HandleClientAsync(pipeServer, connectionId, cancellationToken);
                                _logger.Debug("Client {ConnectionId} handling completed on {ThreadId}", connectionId, threadId);
                                
                                // After handling this client, loop back to accept another connection
                            }
                            catch (OperationCanceledException)
                            {
                                // Expected during shutdown - break out of the loop
                                _logger.Debug("Server thread {ThreadId} cancelled", threadId);
                                break;
                            }
                            catch (Exception ex)
                            {
                                _logger.Error(ex, "Error in server thread {ThreadId}, will retry", threadId);
                                // Don't break - continue accepting new connections
                                await Task.Delay(1000, cancellationToken); // Brief delay before retry
                            }
                        }

                        _logger.Debug("Server thread {ThreadId} exiting", threadId);
                    }, cancellationToken);

                    _activePipeHandlers.Add(serverTask);
                }

                _logger.Information("Created {ThreadCount} persistent server threads, continuously accepting connections", _maxConnections);

                // Wait for all server threads to complete (only happens during shutdown)
                await Task.WhenAll(_activePipeHandlers.ToArray());
                
                _logger.Information("All server threads completed - server shutdown");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Fatal error in connection acceptance");
            }
        }

        private NamedPipeServerStream CreatePipeServerInstance()
        {
            _logger.Debug("Creating Named Pipe Server instance");
            return new NamedPipeServerStream(
                _pipeName,
                PipeDirection.InOut,
                _maxConnections, // Use configured max connections to prevent UnauthorizedAccessException
                PipeTransmissionMode.Message,
                PipeOptions.Asynchronous
            );
        }

        private void CleanupCompletedHandlers()
        {
            for (int i = _activePipeHandlers.Count - 1; i >= 0; i--)
            {
                if (_activePipeHandlers[i].IsCompleted)
                {
                    _activePipeHandlers.RemoveAt(i);
                }
            }
        }

        private async Task HandleClientAsync(NamedPipeServerStream pipeServer, string connectionId, CancellationToken cancellationToken)
        {
            try
            {
                _logger.Debug("Handling client connection: {ConnectionId}", connectionId);

                var buffer = new byte[4096];
                var messageBuilder = new StringBuilder();

                while (!cancellationToken.IsCancellationRequested && pipeServer.IsConnected)
                {
                    try
                    {
                        var bytesRead = await pipeServer.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
                        
                        if (bytesRead == 0)
                        {
                            // Client disconnected
                            _logger.Debug("Client disconnected: {ConnectionId}", connectionId);
                            break;
                        }

                        var data = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        messageBuilder.Append(data);

                        // Check for complete messages (assuming messages end with newline)
                        string completeMessage;
                        while ((completeMessage = ExtractCompleteMessage(messageBuilder)) != null)
                        {
                            await ProcessMessageAsync(pipeServer, completeMessage, connectionId);
                        }
                    }
                    catch (IOException ex) when (ex.Message.Contains("pipe has been ended"))
                    {
                        // Client disconnected gracefully
                        _logger.Debug("Client disconnected gracefully: {ConnectionId}", connectionId);
                        break;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Expected during shutdown
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error handling client connection: {ConnectionId}", connectionId);
            }
        }

        private string ExtractCompleteMessage(StringBuilder messageBuilder)
        {
            var content = messageBuilder.ToString();
            var newlineIndex = content.IndexOf('\n');
            
            if (newlineIndex >= 0)
            {
                var message = content.Substring(0, newlineIndex);
                messageBuilder.Remove(0, newlineIndex + 1);
                return message.Trim();
            }
            
            return null; // No complete message yet
        }

        private async Task ProcessMessageAsync(NamedPipeServerStream pipeServer, string message, string connectionId)
        {
            var startTime = DateTime.UtcNow;
            ServiceResponse response;
            string requestId = null;

            try
            {
                _logger.Debug("Processing message from {ConnectionId}: {Message}", connectionId, message);

                var request = JsonConvert.DeserializeObject<ServiceRequest>(message);
                if (request == null)
                {
                    response = ServiceResponse.CreateError("Invalid JSON request");
                }
                else
                {
                    requestId = request.Id; // Capture the request ID
                    response = await HandleRequestAsync(request);
                }
            }
            catch (JsonException ex)
            {
                _logger.Warning(ex, "Invalid JSON received from client {ConnectionId}", connectionId);
                response = ServiceResponse.CreateError($"Invalid JSON: {ex.Message}");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error processing request from client {ConnectionId}", connectionId);
                response = ServiceResponse.CreateError($"Internal server error: {ex.Message}");
            }

            // Set the response ID to match the request ID
            response.Id = requestId;
            
            // Add performance timing
            response.ProcessingTimeMs = (DateTime.UtcNow - startTime).TotalMilliseconds;

            await SendResponseAsync(pipeServer, response, connectionId);
        }

        private async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            _logger.Information("Processing request: {Action} for {ObjectType}", request.Action, request.ObjectType);

            try
            {
                switch (request.Action?.ToLower())
                {
                    case "create":
                        return await HandleCreateRequestAsync(request);
                    
                    case "associate":
                        return await HandleAssociateAsync(request);
                    
                    case "schemas":
                        return HandleParameterSchemasAsync(request);
                    
                    case "validate":
                        return HandleParameterValidationAsync(request);
                    
                    case "health":
                        return await HandleHealthCheckAsync(request);
                    
                    case "ping":
                        return ServiceResponse.CreateSuccess(new { Status = "Pong", Timestamp = DateTime.UtcNow });
                    
                    case "models":
                        return HandleGetModelsAsync(request);
                    
                    case "setup":
                        return HandleSetupInfoAsync(request);
                    
                    case "aotstructure":
                        return await HandleAOTStructureAsync(request);
                    
                    default:
                        return ServiceResponse.CreateError($"Unknown action: {request.Action}");
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error handling request {Action} for {ObjectType}", request.Action, request.ObjectType);
                return ServiceResponse.CreateError($"Request handling failed: {ex.Message}");
            }
        }

        private async Task<ServiceResponse> HandleCreateRequestAsync(ServiceRequest request)
        {
            if (string.IsNullOrEmpty(request.ObjectType))
            {
                return ServiceResponse.CreateError("ObjectType is required for create operations");
            }

            ObjectCreationResult result;

            switch (request.ObjectType.ToLower())
            {
                case "axclass":
                    result = await _objectFactory.CreateAxClassAsync(request.Parameters ?? new Dictionary<string, object>());
                    break;

                case "axenum":
                    result = await _objectFactory.CreateAxEnumAsync(request.Parameters ?? new Dictionary<string, object>());
                    break;

                case "axproject":
                    result = await _objectFactory.CreateAxProjectAsync(request.Parameters ?? new Dictionary<string, object>());
                    break;

                case "vs2022project":
                    result = await _objectFactory.CreateVS2022ProjectAsync(request.Parameters ?? new Dictionary<string, object>());
                    break;

                default:
                    return ServiceResponse.CreateError($"Unsupported object type: {request.ObjectType}");
            }

            return ServiceResponse.CreateSuccess(result);
        }

        private ServiceResponse HandleParameterSchemasAsync(ServiceRequest request)
        {
            try
            {
                var result = _objectFactory.GetParameterSchemas();
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error getting parameter schemas");
                return ServiceResponse.CreateError($"Failed to get parameter schemas: {ex.Message}");
            }
        }

        private ServiceResponse HandleParameterValidationAsync(ServiceRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.ObjectType))
                {
                    return ServiceResponse.CreateError("ObjectType is required for validation");
                }

                var result = _objectFactory.ValidateParameters(request.ObjectType, request.Parameters ?? new Dictionary<string, object>());
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error validating parameters for {ObjectType}", request.ObjectType);
                return ServiceResponse.CreateError($"Parameter validation failed: {ex.Message}");
            }
        }

        private async Task<ServiceResponse> HandleAssociateAsync(ServiceRequest request)
        {
            _logger.Information("Handling Associate request: {@Request}", new { request.Action, request.Parameters });

            try
            {
                var result = await _objectFactory.AssociateObjectToProjectAsync(request.Parameters ?? new Dictionary<string, object>());
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to process associate request");
                return ServiceResponse.CreateError($"Associate operation failed: {ex.Message}");
            }
        }

        private ServiceResponse HandleGetModelsAsync(ServiceRequest request)
        {
            _logger.Information("Handling Models request: {@Request}", new { request.Action, request.Id });

            try
            {
                var result = _objectFactory.GetAllModelsInformation();
                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to process models request");
                return ServiceResponse.CreateError($"Models operation failed: {ex.Message}");
            }
        }

        private async Task<ServiceResponse> HandleAOTStructureAsync(ServiceRequest request)
        {
            _logger.Information("Handling AOT Structure request: {@Request}", new { request.Action, request.Id });

            try
            {
                // Load the D365 Metadata assembly
                string assemblyPath = null;
                if (!string.IsNullOrEmpty(_config.D365Config.MetadataAssemblyPath))
                {
                    assemblyPath = _config.D365Config.MetadataAssemblyPath;
                }
                else
                {
                    // Try to find it in VS2022 extension directory
                    var extensionPath = GetVS2022ExtensionPath();
                    if (extensionPath != null)
                    {
                        assemblyPath = Path.Combine(extensionPath, "Microsoft.Dynamics.AX.Metadata.dll");
                    }
                }

                if (string.IsNullOrEmpty(assemblyPath) || !File.Exists(assemblyPath))
                {
                    return ServiceResponse.CreateError("Microsoft.Dynamics.AX.Metadata.dll not found");
                }

                // Load assembly and get types using reflection
                var result = await Task.Run(() =>
                {
                    var assembly = System.Reflection.Assembly.LoadFrom(assemblyPath);
                    var types = assembly.GetTypes()
                        .Where(t => t.IsPublic && t.IsClass && !t.IsAbstract && t.Name.StartsWith("Ax"))
                        .Select(t => new
                        {
                            Name = t.Name,
                            FullName = t.FullName,
                            Namespace = t.Namespace,
                            BaseType = t.BaseType?.Name,
                            Properties = t.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance)
                                .Select(p => new
                                {
                                    Name = p.Name,
                                    Type = p.PropertyType.Name,
                                    CanRead = p.CanRead,
                                    CanWrite = p.CanWrite
                                }).ToArray()
                        })
                        .OrderBy(t => t.Name)
                        .ToList();

                    _logger.Information("Found {TypeCount} types from metadata assembly", types.Count);

                    return new
                    {
                        totalTypes = types.Count,
                        assemblyPath = assemblyPath,
                        types = types,
                        generatedAt = DateTime.UtcNow
                    };
                });

                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to process AOT structure request");
                return ServiceResponse.CreateError($"AOT structure operation failed: {ex.Message}");
            }
        }

        private ServiceResponse HandleSetupInfoAsync(ServiceRequest request)
        {
            try
            {
                _logger.Information("Handling Setup request: {@Request}", new { request.Action, request.Id });

                var setupInfo = new
                {
                    PackagesLocalDirectory = _config.D365Config.PackagesLocalDirectory,
                    CustomMetadataPath = _config.D365Config.CustomMetadataPath,
                    DefaultModel = _config.D365Config.DefaultModel,
                    MetadataAssemblyPath = _config.D365Config.MetadataAssemblyPath,
                    ExtensionPath = GetVS2022ExtensionPath(),
                    ServiceInfo = new
                    {
                        Transport = "NamedPipes",
                        PipeName = _pipeName,
                        MaxConnections = _maxConnections,
                        ServerVersion = "1.0.0"
                    },
                    Timestamp = DateTime.UtcNow
                };

                _logger.Information("Setup information retrieved successfully");
                return ServiceResponse.CreateSuccess(setupInfo);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to process setup request");
                return ServiceResponse.CreateError($"Setup operation failed: {ex.Message}");
            }
        }

        private string GetVS2022ExtensionPath()
        {
            try
            {
                // Try to find VS2022 extension path from common locations
                var commonPaths = new[]
                {
                    @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\Extensions"
                };

                foreach (var basePath in commonPaths)
                {
                    if (Directory.Exists(basePath))
                    {
                        // Look for directories containing AX-related files
                        var extensionDirs = Directory.GetDirectories(basePath, "*", SearchOption.TopDirectoryOnly);
                        foreach (var dir in extensionDirs)
                        {
                            if (File.Exists(Path.Combine(dir, "Microsoft.Dynamics.AX.Metadata.dll")))
                            {
                                return dir;
                            }
                        }
                    }
                }

                return _config.D365Config.MetadataAssemblyPath != null 
                    ? Path.GetDirectoryName(_config.D365Config.MetadataAssemblyPath)
                    : null;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to determine VS2022 extension path");
                return null;
            }
        }

        private Task<ServiceResponse> HandleHealthCheckAsync(ServiceRequest request)
        {
            var healthResult = new HealthCheckResult
            {
                Status = "Healthy",
                Timestamp = DateTime.UtcNow,
                ActiveConnections = _activePipeHandlers.Count,
                MaxConnections = _maxConnections,
                ServiceInfo = new Dictionary<string, object>
                {
                    ["Transport"] = "NamedPipes",
                    ["PipeName"] = _pipeName,
                    ["DefaultModel"] = _config.D365Config.DefaultModel,
                    ["AssemblyPath"] = _config.D365Config.MetadataAssemblyPath,
                    ["ServerVersion"] = "1.0.0",
                    ["SupportedObjectTypes"] = new[] { "AxClass", "AxEnum", "AxProject", "VS2022Project", "ObjectProjectAssociation" }
                }
            };

            return Task.FromResult(ServiceResponse.CreateSuccess(healthResult));
        }

        private async Task SendResponseAsync(NamedPipeServerStream pipeServer, ServiceResponse response, string connectionId)
        {
            try
            {
                var json = JsonConvert.SerializeObject(response, Formatting.None);
                var data = Encoding.UTF8.GetBytes(json + "\n"); // Add newline delimiter

                await pipeServer.WriteAsync(data, 0, data.Length);

                _logger.Debug("Response sent to client {ConnectionId}: {ResponseSize} bytes", connectionId, data.Length);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to send response to client {ConnectionId}", connectionId);
            }
        }
    }
}
