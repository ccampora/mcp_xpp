using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using D365MetadataService.Models;
using D365MetadataService.Handlers;
using Serilog;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Windows Named Pipe server for high-performance local IPC communication
    /// Handles only transport concerns - delegates all business logic to handlers
    /// </summary>
    public class NamedPipeServer
    {
        private readonly RequestHandlerFactory _handlerFactory;
        private readonly ILogger _logger;
        private readonly string _pipeName;
        private readonly int _maxConnections;
        private readonly CancellationTokenSource _cancellationTokenSource;
        private readonly List<Task> _activePipeHandlers;
        private bool _isRunning;

        public NamedPipeServer(RequestHandlerFactory handlerFactory, ILogger logger, int maxConnections = 10)
        {
            _handlerFactory = handlerFactory ?? throw new ArgumentNullException(nameof(handlerFactory));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _pipeName = "mcp-xpp-d365-service";
            _maxConnections = maxConnections;
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
                    MaxConnections = _maxConnections
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
                _logger.Debug("Processing message from {ConnectionId}", connectionId);
                _logger.Debug("Raw message content: {Message}", message);
                _logger.Debug("Message length: {Length}", message?.Length ?? 0);

                // Add additional logging for JSON parsing issues
                if (string.IsNullOrWhiteSpace(message))
                {
                    _logger.Warning("Received empty or null message from {ConnectionId}", connectionId);
                    response = ServiceResponse.CreateError("Empty message received");
                }
                else
                {
                    try
                    {
                        var request = JsonConvert.DeserializeObject<ServiceRequest>(message);
                        if (request == null)
                        {
                            response = ServiceResponse.CreateError("Invalid JSON request - deserialized to null");
                        }
                        else
                        {
                            requestId = request.Id; // Capture the request ID
                            response = await HandleRequestAsync(request);
                        }
                    }
                    catch (JsonException jsonEx)
                    {
                        _logger.Error(jsonEx, "JSON deserialization failed for message: {Message}", message);
                        response = ServiceResponse.CreateError($"JSON parsing error: {jsonEx.Message}");
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

            await SendResponseAsync(pipeServer, response, connectionId);
        }

        private async Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            _logger.Information("Processing request: {Action} for {ObjectType}", request.Action, request.ObjectType);

            try
            {
                // Use the handler factory to get the appropriate handler
                if (!_handlerFactory.HasHandler(request.Action))
                {
                    return ServiceResponse.CreateError($"Unknown action: {request.Action}");
                }

                var handler = _handlerFactory.GetHandler(request.Action);
                return await handler.HandleAsync(request);
            }
            catch (NotSupportedException ex)
            {
                _logger.Warning(ex, "Unsupported action requested: {Action}", request.Action);
                return ServiceResponse.CreateError($"Unsupported action: {request.Action}");
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error handling request {Action} for {ObjectType}", request.Action, request.ObjectType);
                return ServiceResponse.CreateError($"Request handling failed: {ex.Message}");
            }
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
