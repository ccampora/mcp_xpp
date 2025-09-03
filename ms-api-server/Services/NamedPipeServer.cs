using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Reflection;
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
        private readonly CancellationTokenSource _cancellationTokenSource;
        private readonly List<Task> _activePipeHandlers;
        private bool _isRunning;

        public NamedPipeServer(ServiceConfiguration config, D365ObjectFactory objectFactory, ILogger logger)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _objectFactory = objectFactory ?? throw new ArgumentNullException(nameof(objectFactory));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _pipeName = "mcp-xpp-d365-service";
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
                    MaxConnections = _config.MaxConnections, 
                    _config.D365Config.DefaultModel,
                    AssemblyPath = Path.GetFileName(_config.D365Config.MetadataAssemblyPath) 
                });

                // Start accepting connections
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

            _logger.Information("Stopping Named Pipe Server...");

            _isRunning = false;
            _cancellationTokenSource?.Cancel();

            // Wait for all pipe handlers to complete
            try
            {
                await Task.WhenAll(_activePipeHandlers.ToArray());
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
            while (!cancellationToken.IsCancellationRequested && _isRunning)
            {
                try
                {
                    // Check connection limit
                    if (_activePipeHandlers.Count >= _config.MaxConnections)
                    {
                        _logger.Warning("Maximum connections ({MaxConnections}) reached. Waiting for available slot...", _config.MaxConnections);
                        await Task.Delay(100, cancellationToken);
                        continue;
                    }

                    // Create new pipe instance
                    NamedPipeServerStream pipeServer;
                    try
                    {
                        pipeServer = CreatePipeServerInstance();
                    }
                    catch (UnauthorizedAccessException)
                    {
                        _logger.Warning("Cannot create more pipe instances, likely at system limit. Current active connections: {ActiveCount}. Waiting...", _activePipeHandlers.Count);
                        await Task.Delay(1000, cancellationToken);
                        continue;
                    }
                    
                    // Wait for client connection
                    await pipeServer.WaitForConnectionAsync(cancellationToken);

                    var connectionId = Guid.NewGuid().ToString();
                    _logger.Debug("New client connection established: {ConnectionId}", connectionId);

                    // Handle client in background
                    var handlerTask = HandleClientAsync(pipeServer, connectionId, cancellationToken);
                    _activePipeHandlers.Add(handlerTask);

                    // Clean up completed handlers
                    CleanupCompletedHandlers();
                }
                catch (OperationCanceledException)
                {
                    // Expected during shutdown
                    break;
                }
                catch (Exception ex)
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        _logger.Error(ex, "Error accepting client connections");
                        await Task.Delay(1000, cancellationToken); // Brief delay before retrying
                    }
                }
            }
        }

        private NamedPipeServerStream CreatePipeServerInstance()
        {
            // Create pipe with security settings for proper access control
            var pipeSecurity = new PipeSecurity();
            var identity = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
            var accessRule = new PipeAccessRule(identity, PipeAccessRights.ReadWrite, AccessControlType.Allow);
            pipeSecurity.SetAccessRule(accessRule);

            return new NamedPipeServerStream(
                _pipeName,
                PipeDirection.InOut,
                _config.MaxConnections,
                PipeTransmissionMode.Message,
                PipeOptions.Asynchronous | PipeOptions.WriteThrough,
                4096, // inBufferSize
                4096, // outBufferSize
                pipeSecurity);
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
            // Create timeout for the entire client session
            using var sessionTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_config.SessionTimeoutSeconds));
            using var combinedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, sessionTimeoutCts.Token);
            
            var sessionStartTime = DateTime.UtcNow;
            var lastActivityTime = DateTime.UtcNow;
            
            try
            {
                _logger.Information("Client connected: {ConnectionId}, Session timeout: {SessionTimeout}s", 
                    connectionId, _config.SessionTimeoutSeconds);

                var buffer = new byte[4096];
                var messageBuilder = new StringBuilder();

                while (!combinedCts.Token.IsCancellationRequested && pipeServer.IsConnected)
                {
                    CancellationTokenSource readTimeoutCts = null;
                    try
                    {
                        // Create timeout for individual read operations
                        readTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_config.ReadTimeoutSeconds));
                        using var readCts = CancellationTokenSource.CreateLinkedTokenSource(combinedCts.Token, readTimeoutCts.Token);
                        
                        var bytesRead = await pipeServer.ReadAsync(buffer, 0, buffer.Length, readCts.Token);
                        
                        if (bytesRead == 0)
                        {
                            // Client disconnected
                            _logger.Information("Client disconnected gracefully: {ConnectionId}, Session duration: {Duration}ms", 
                                connectionId, (DateTime.UtcNow - sessionStartTime).TotalMilliseconds);
                            break;
                        }

                        // Update activity timestamp
                        lastActivityTime = DateTime.UtcNow;

                        var data = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        messageBuilder.Append(data);

                        // Check for complete messages (assuming messages end with newline)
                        string completeMessage;
                        while ((completeMessage = ExtractCompleteMessage(messageBuilder)) != null)
                        {
                            await ProcessMessageAsync(completeMessage, pipeServer, connectionId);
                        }
                    }
                    catch (OperationCanceledException) when (readTimeoutCts?.Token.IsCancellationRequested == true)
                    {
                        // Read operation timed out
                        _logger.Warning("Read timeout for client {ConnectionId} ({ReadTimeout}s), closing connection", 
                            connectionId, _config.ReadTimeoutSeconds);
                        break;
                    }
                    catch (OperationCanceledException) when (sessionTimeoutCts.Token.IsCancellationRequested)
                    {
                        // Session timed out
                        _logger.Warning("Session timeout for client {ConnectionId} ({SessionTimeout}s), closing connection. Last activity: {LastActivity}s ago", 
                            connectionId, _config.SessionTimeoutSeconds, (DateTime.UtcNow - lastActivityTime).TotalSeconds);
                        break;
                    }
                    catch (IOException ex) when (ex.Message.Contains("pipe has been ended") || ex.Message.Contains("pipe is being closed"))
                    {
                        // Client disconnected gracefully
                        _logger.Information("Client disconnected gracefully: {ConnectionId}, Session duration: {Duration}ms", 
                            connectionId, (DateTime.UtcNow - sessionStartTime).TotalMilliseconds);
                        break;
                    }
                    catch (Exception ex)
                    {
                        // Unexpected error during read/write operation
                        _logger.Warning(ex, "Unexpected error in client communication loop: {ConnectionId}", connectionId);
                        break;
                    }
                    finally
                    {
                        // Clean up the read timeout cancellation token source
                        readTimeoutCts?.Dispose();
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Expected during shutdown
                _logger.Information("Client connection {ConnectionId} cancelled due to service shutdown", connectionId);
            }
            catch (OperationCanceledException) when (sessionTimeoutCts.Token.IsCancellationRequested)
            {
                // Session timeout at the outer level
                _logger.Warning("Client session {ConnectionId} timed out after {SessionTimeout}s, forcing disconnect", 
                    connectionId, _config.SessionTimeoutSeconds);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error handling client connection: {ConnectionId}", connectionId);
            }
            finally
            {
                // Cleanup
                try
                {
                    if (pipeServer.IsConnected)
                    {
                        pipeServer.Disconnect();
                    }
                    pipeServer.Dispose();
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Error disposing pipe server for connection: {ConnectionId}", connectionId);
                }
                
                _logger.Debug("Client connection closed: {ConnectionId}", connectionId);
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

        private async Task ProcessMessageAsync(string message, NamedPipeServerStream pipeServer, string connectionId)
        {
            var startTime = DateTime.UtcNow;
            ServiceResponse response;
            string requestId = null;

            // Add timeout for individual request processing
            using var requestTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_config.RequestTimeoutSeconds));

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
                    
                    // Handle request with timeout
                    var requestTask = HandleRequestAsync(request);
                    var timeoutTask = Task.Delay(Timeout.Infinite, requestTimeoutCts.Token);
                    
                    var completedTask = await Task.WhenAny(requestTask, timeoutTask);
                    
                    if (completedTask == timeoutTask)
                    {
                        _logger.Warning("Request processing timeout ({RequestTimeout}s) for {ConnectionId}, Request: {RequestId}", 
                            _config.RequestTimeoutSeconds, connectionId, requestId);
                        response = ServiceResponse.CreateError($"Request processing timeout after {_config.RequestTimeoutSeconds} seconds");
                    }
                    else
                    {
                        response = await requestTask;
                    }
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

            await SendResponseAsync(response, pipeServer, connectionId);
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
                        return HandleAOTStructureAsync(request);
                    
                    case "aotmetadata":
                        return HandleAOTMetadataAsync(request);
                    
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
                        MaxConnections = _config.MaxConnections,
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
                MaxConnections = _config.MaxConnections,
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

        private ServiceResponse HandleAOTStructureAsync(ServiceRequest request)
        {
            try
            {
                _logger.Information("Pure reflection-based AOT discovery - NO HARDCODED CATEGORIES");

                var assemblyPath = _config.D365Config.MetadataAssemblyPath;
                if (string.IsNullOrEmpty(assemblyPath) || !File.Exists(assemblyPath))
                {
                    return ServiceResponse.CreateError("Microsoft.Dynamics.AX.Metadata assembly path not configured or file not found");
                }

                var assembly = System.Reflection.Assembly.LoadFrom(assemblyPath);
                var axTypes = assembly.GetTypes()
                    .Where(t => t.Name.StartsWith("Ax") && 
                               t.IsClass && 
                               !t.IsAbstract && 
                               t.IsPublic)
                    .OrderBy(t => t.Name)
                    .ToList();

                _logger.Information("Discovered {TypeCount} Ax types from assembly reflection", axTypes.Count);

                // Pure reflection discovery - NO categorization in service
                var discoveredTypes = axTypes.Select(type => new
                {
                    Name = type.Name,
                    FullName = type.FullName,
                    BaseType = type.BaseType?.Name ?? "Object",
                    Namespace = type.Namespace,
                    IsAbstract = type.IsAbstract,
                    IsSealed = type.IsSealed,
                    IsGeneric = type.IsGenericType,
                    Assembly = type.Assembly.GetName().Name,
                    Description = ExtractTypeDescription(type),
                    Attributes = ExtractTypeAttributes(type),
                    Properties = GetTypeProperties(type),
                    Methods = GetTypeMethods(type)
                }).ToList();

                var result = new
                {
                    discoveredAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss"),
                    assemblyPath = assemblyPath,
                    totalTypes = axTypes.Count,
                    discoveredTypes = discoveredTypes,
                    message = "Pure reflection discovery - categorization handled by MCP server using configuration"
                };

                _logger.Information("Pure AOT reflection complete: {TotalTypes} types discovered", result.totalTypes);

                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to perform AOT reflection discovery");
                return ServiceResponse.CreateError($"AOT discovery failed: {ex.Message}");
            }
        }

        private string ExtractTypeDescription(Type type)
        {
            // Try to get description from various sources
            
            // 1. Check for Display/Description attributes
            var displayAttr = type.GetCustomAttribute<System.ComponentModel.DisplayNameAttribute>();
            if (displayAttr != null)
                return displayAttr.DisplayName;

            var descAttr = type.GetCustomAttribute<System.ComponentModel.DescriptionAttribute>();
            if (descAttr != null)
                return descAttr.Description;

            // 2. Generate description based on name patterns
            return GenerateDescriptionFromName(type.Name);
        }

        private string GenerateDescriptionFromName(string typeName)
        {
            // Generate intelligent descriptions based on type name patterns
            var patterns = new Dictionary<string, string>
            {
                { "AxClass", "Class definition for business logic" },
                { "AxEnum", "Enumeration with predefined values" },
                { "AxTable", "Database table for data storage" },
                { "AxView", "Database view for data querying" },
                { "AxForm", "User interface form" },
                { "AxReport", "Report definition" },
                { "AxQuery", "Data query definition" },
                { "AxDataEntity", "Data entity for integration" },
                { "AxMenu", "Navigation menu structure" },
                { "AxSecurity", "Security configuration" },
                { "AxWorkflow", "Workflow process definition" },
                { "AxAggregate", "Aggregate data structure" },
                { "AxEdt", "Extended data type definition" },
                { "AxConfig", "Configuration setting" },
                { "AxService", "Web service definition" },
                { "AxResource", "Resource file" },
                { "AxLabel", "Label file for localization" }
            };

            foreach (var pattern in patterns)
            {
                if (typeName.StartsWith(pattern.Key, StringComparison.OrdinalIgnoreCase))
                {
                    return pattern.Value;
                }
            }

            // Check for common suffixes/patterns
            return null; // Unknown description
        }

        private Dictionary<string, object> ExtractTypeAttributes(Type type)
        {
            var attributes = new Dictionary<string, object>();
            
            try
            {
                foreach (var attr in type.GetCustomAttributes())
                {
                    var attrName = attr.GetType().Name.Replace("Attribute", "");
                    attributes[attrName] = attr.ToString();
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to extract attributes for type {TypeName}", type.Name);
            }

            return attributes;
        }

        private List<object> GetTypeProperties(Type type)
        {
            var properties = new List<object>();
            
            try
            {
                foreach (var prop in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (prop.CanRead && prop.GetIndexParameters().Length == 0)
                    {
                        properties.Add(new
                        {
                            Name = prop.Name,
                            Type = prop.PropertyType.Name,
                            CanWrite = prop.CanWrite,
                            IsStatic = prop.GetGetMethod()?.IsStatic ?? false
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to extract properties for type {TypeName}", type.Name);
            }

            return properties.Take(10).ToList(); // Limit to first 10 properties
        }

        private List<object> GetTypeMethods(Type type)
        {
            var methods = new List<object>();
            
            try
            {
                foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                {
                    if (!method.IsSpecialName)
                    {
                        methods.Add(new
                        {
                            Name = method.Name,
                            ReturnType = method.ReturnType.Name,
                            Parameters = method.GetParameters().Select(p => new
                            {
                                Name = p.Name,
                                Type = p.ParameterType.Name
                            }).ToList()
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to extract methods for type {TypeName}", type.Name);
            }

            return methods.Take(5).ToList(); // Limit to first 5 methods
        }

        private ServiceResponse HandleAOTMetadataAsync(ServiceRequest request)
        {
            try
            {
                _logger.Information("Discovering AOT metadata via pure reflection - NO HARDCODING");

                var assemblyPath = _config.D365Config.MetadataAssemblyPath;
                if (string.IsNullOrEmpty(assemblyPath) || !File.Exists(assemblyPath))
                {
                    return ServiceResponse.CreateError("Microsoft.Dynamics.AX.Metadata assembly path not configured or file not found");
                }

                var assembly = System.Reflection.Assembly.LoadFrom(assemblyPath);
                var axTypes = assembly.GetTypes()
                    .Where(t => t.Name.StartsWith("Ax") && 
                               t.IsClass && 
                               !t.IsAbstract && 
                               t.IsPublic)
                    .OrderBy(t => t.Name)
                    .ToList();

                _logger.Information("Analyzing {TypeCount} Ax types for metadata discovery", axTypes.Count);

                // Discover metadata via pure reflection analysis
                var typeMetadata = axTypes.Select(type => new
                {
                    Name = type.Name,
                    FullName = type.FullName,
                    BaseType = type.BaseType?.Name ?? "Object",
                    Namespace = type.Namespace,
                    Assembly = type.Assembly.GetName().Name,
                    
                    // Discover creation capabilities via reflection
                    CreationMetadata = AnalyzeCreationCapabilities(type),
                    
                    // Discover file system patterns via naming analysis
                    FileSystemMetadata = AnalyzeFileSystemPatterns(type),
                    
                    // Discover relationships via type hierarchy analysis
                    RelationshipMetadata = AnalyzeTypeRelationships(type),
                    
                    // Extract all attributes for further analysis
                    Attributes = ExtractTypeAttributes(type),
                    
                    // Analyze constructors and factory methods
                    ConstructorInfo = AnalyzeConstructors(type)
                }).ToList();

                var result = new
                {
                    discoveredAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss"),
                    assemblyPath = assemblyPath,
                    totalTypes = axTypes.Count,
                    typeMetadata = typeMetadata,
                    message = "Pure reflection metadata discovery - no hardcoded patterns"
                };

                _logger.Information("AOT metadata discovery complete: {TotalTypes} types analyzed", result.totalTypes);

                return ServiceResponse.CreateSuccess(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to perform AOT metadata discovery");
                return ServiceResponse.CreateError($"AOT metadata discovery failed: {ex.Message}");
            }
        }

        private object AnalyzeCreationCapabilities(Type type)
        {
            // Analyze if the type can be created via reflection
            try
            {
                var constructors = type.GetConstructors();
                var hasDefaultConstructor = constructors.Any(c => c.GetParameters().Length == 0);
                var hasPublicConstructors = constructors.Any(c => c.IsPublic);
                
                // Look for factory methods
                var factoryMethods = type.GetMethods(BindingFlags.Public | BindingFlags.Static)
                    .Where(m => m.ReturnType == type && 
                               (m.Name.StartsWith("Create") || m.Name.StartsWith("New") || m.Name.StartsWith("Build")))
                    .Select(m => new { Name = m.Name, ParameterCount = m.GetParameters().Length })
                    .ToList();

                return new
                {
                    HasDefaultConstructor = hasDefaultConstructor,
                    HasPublicConstructors = hasPublicConstructors,
                    ConstructorCount = constructors.Length,
                    FactoryMethods = factoryMethods,
                    IsInstantiable = !type.IsAbstract && hasPublicConstructors
                };
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to analyze creation capabilities for {TypeName}", type.Name);
                return new { Error = ex.Message };
            }
        }

        private object AnalyzeFileSystemPatterns(Type type)
        {
            // Discover file system patterns via naming analysis
            try
            {
                var typeName = type.Name;
                
                // Infer folder pattern from type name (remove common prefixes/suffixes)
                string folderPattern = typeName;
                if (folderPattern.StartsWith("Ax"))
                    folderPattern = folderPattern.Substring(2);
                
                // Infer file extensions based on type characteristics
                var inferredExtensions = new List<string>();
                
                // Check if it's likely a code type (.xpp) or metadata type (.xml)
                var hasCodeProperties = type.GetProperties()
                    .Any(p => p.Name.Contains("Source") || p.Name.Contains("Code") || p.Name.Contains("Method"));
                
                if (hasCodeProperties)
                    inferredExtensions.Add(".xpp");
                
                inferredExtensions.Add(".xml"); // Most D365 objects have XML metadata

                return new
                {
                    InferredFolderPattern = folderPattern,
                    InferredExtensions = inferredExtensions,
                    TypeNameLength = typeName.Length,
                    HasPrefix = typeName.StartsWith("Ax"),
                    NamePatternAnalysis = AnalyzeNamePattern(typeName)
                };
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to analyze file system patterns for {TypeName}", type.Name);
                return new { Error = ex.Message };
            }
        }

        private object AnalyzeTypeRelationships(Type type)
        {
            // Analyze type relationships and hierarchy
            try
            {
                var baseTypes = new List<string>();
                var currentType = type.BaseType;
                while (currentType != null && currentType != typeof(object))
                {
                    baseTypes.Add(currentType.Name);
                    currentType = currentType.BaseType;
                }

                var interfaces = type.GetInterfaces()
                    .Select(i => i.Name)
                    .ToList();

                var derivedTypesInAssembly = type.Assembly.GetTypes()
                    .Where(t => t.BaseType == type)
                    .Select(t => t.Name)
                    .ToList();

                return new
                {
                    BaseTypeChain = baseTypes,
                    Interfaces = interfaces,
                    DerivedTypes = derivedTypesInAssembly,
                    IsLeafType = derivedTypesInAssembly.Count == 0,
                    InheritanceDepth = baseTypes.Count
                };
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to analyze relationships for {TypeName}", type.Name);
                return new { Error = ex.Message };
            }
        }

        private object AnalyzeConstructors(Type type)
        {
            try
            {
                var constructors = type.GetConstructors()
                    .Select(c => new
                    {
                        IsPublic = c.IsPublic,
                        ParameterCount = c.GetParameters().Length,
                        Parameters = c.GetParameters().Select(p => new
                        {
                            Name = p.Name,
                            Type = p.ParameterType.Name,
                            HasDefaultValue = p.HasDefaultValue
                        }).ToList()
                    }).ToList();

                return new
                {
                    Constructors = constructors,
                    HasParameterlessConstructor = constructors.Any(c => c.ParameterCount == 0),
                    PublicConstructorCount = constructors.Count(c => c.IsPublic)
                };
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to analyze constructors for {TypeName}", type.Name);
                return new { Error = ex.Message };
            }
        }

        private object AnalyzeNamePattern(string typeName)
        {
            // Analyze type name patterns without hardcoding specific patterns
            var analysis = new
            {
                StartsWithAx = typeName.StartsWith("Ax"),
                Length = typeName.Length,
                HasNumbers = typeName.Any(char.IsDigit),
                HasUnderscore = typeName.Contains('_'),
                CamelCaseWords = SplitCamelCase(typeName).ToList(),
                CommonSuffixes = DetectCommonSuffixes(typeName),
                PossibleAcronyms = DetectPossibleAcronyms(typeName)
            };

            return analysis;
        }

        private IEnumerable<string> SplitCamelCase(string input)
        {
            var words = new List<string>();
            var currentWord = new StringBuilder();

            for (int i = 0; i < input.Length; i++)
            {
                char c = input[i];
                
                if (char.IsUpper(c) && currentWord.Length > 0)
                {
                    words.Add(currentWord.ToString());
                    currentWord.Clear();
                }
                
                currentWord.Append(c);
            }

            if (currentWord.Length > 0)
            {
                words.Add(currentWord.ToString());
            }

            return words;
        }

        private List<string> DetectCommonSuffixes(string typeName)
        {
            var commonSuffixes = new[] { "Extension", "Base", "View", "Entity", "Reference", "Collection", "Manager", "Service", "Provider", "Factory", "Handler" };
            return commonSuffixes.Where(suffix => typeName.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        private List<string> DetectPossibleAcronyms(string typeName)
        {
            // Detect sequences of uppercase letters as possible acronyms
            var acronyms = new List<string>();
            var current = new StringBuilder();
            
            foreach (char c in typeName)
            {
                if (char.IsUpper(c))
                {
                    current.Append(c);
                }
                else
                {
                    if (current.Length > 1) // More than one uppercase letter
                    {
                        acronyms.Add(current.ToString());
                    }
                    current.Clear();
                }
            }
            
            if (current.Length > 1)
            {
                acronyms.Add(current.ToString());
            }
            
            return acronyms;
        }

        private async Task SendResponseAsync(ServiceResponse response, NamedPipeServerStream pipeServer, string connectionId)
        {
            // Add timeout for response sending
            using var responseTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_config.ResponseTimeoutSeconds));
            
            try
            {
                var json = JsonConvert.SerializeObject(response, Formatting.None);
                var data = Encoding.UTF8.GetBytes(json + "\n"); // Add newline delimiter

                await pipeServer.WriteAsync(data, 0, data.Length, responseTimeoutCts.Token);
                await pipeServer.FlushAsync(responseTimeoutCts.Token);

                _logger.Debug("Response sent to client {ConnectionId}: {ResponseSize} bytes", connectionId, data.Length);
            }
            catch (OperationCanceledException) when (responseTimeoutCts.Token.IsCancellationRequested)
            {
                _logger.Warning("Response send timeout ({ResponseTimeout}s) for client {ConnectionId}", 
                    _config.ResponseTimeoutSeconds, connectionId);
                throw new TimeoutException($"Failed to send response to client {connectionId} within {_config.ResponseTimeoutSeconds} seconds");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to send response to client {ConnectionId}", connectionId);
                throw;
            }
        }
    }
}
