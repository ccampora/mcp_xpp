using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using D365MetadataService.Models;
using D365MetadataService.Services;
using D365MetadataService.Handlers;
using Serilog;

namespace D365MetadataService
{
    class Program
    {
        private static ILogger _logger;
        private static NamedPipeServer _namedPipeServer;

        static async Task Main(string[] args)
        {
            try
            {
                // Initialize logging first
                InitializeLogging();

                _logger.Information("=== D365 Metadata Service Starting ===");
                _logger.Information("Process ID: {ProcessId}", System.Diagnostics.Process.GetCurrentProcess().Id);
                _logger.Information("Working Directory: {WorkingDirectory}", Environment.CurrentDirectory);

                // Load configuration
                var config = LoadConfiguration();
                _logger.Information("Configuration loaded successfully");

                // Set up dependency injection
                var services = new ServiceCollection();
                ConfigureServices(services, config);
                var serviceProvider = services.BuildServiceProvider();

                // Get the Named Pipe Server from DI container
                _namedPipeServer = serviceProvider.GetRequiredService<NamedPipeServer>();
                _logger.Information("Using Named Pipes transport with Handler pattern");

                // Handle graceful shutdown
                Console.CancelKeyPress += OnCancelKeyPress;
                AppDomain.CurrentDomain.ProcessExit += OnProcessExit;

                // Start the server
                await _namedPipeServer.StartAsync();

                _logger.Information("=== D365 Metadata Service Started Successfully ===");
                _logger.Information("Press Ctrl+C to stop the service");

                // Keep the service running
                await WaitForShutdownAsync();
            }
            catch (Exception ex)
            {
                if (_logger != null)
                {
                    _logger.Fatal(ex, "Fatal error during service startup");
                }
                else
                {
                    Console.WriteLine($"Fatal error during service startup: {ex}");
                }

                Environment.Exit(1);
            }
            finally
            {
                _logger?.Information("=== D365 Metadata Service Shutdown Complete ===");
                Log.CloseAndFlush();
            }
        }

        private static void ConfigureServices(IServiceCollection services, ServiceConfiguration config)
        {
            // Register configuration
            services.AddSingleton(config);
            services.AddSingleton(_logger);

            // Register Centralized D365 Reflection Manager (eliminates scattered reflection code)
            services.AddSingleton<D365ReflectionManager>(sp => 
            {
                var manager = D365ReflectionManager.Instance;
                manager.Initialize(); // Pre-initialize for optimal performance
                return manager;
            });

            // Register Dynamic D365 Object Factory (supports all 575+ object types)
            // Now managed by D365ReflectionManager for better resource sharing
            services.AddSingleton<D365ObjectFactory>(sp =>
                D365ReflectionManager.Instance.GetObjectFactory(config.D365Config));

            // Register D365 Reflection Service
            services.AddSingleton<D365ReflectionService>();

            // Register Parameter Discovery Service
            services.AddSingleton<ParameterDiscoveryService>();

            // Register all request handlers
            services.AddSingleton<IRequestHandler, CreateObjectHandler>();
            services.AddSingleton<IRequestHandler, HealthCheckHandler>();
            services.AddSingleton<IRequestHandler, PingHandler>();
            services.AddSingleton<IRequestHandler, ParameterSchemasHandler>();
            services.AddSingleton<IRequestHandler, ValidationHandler>();
            services.AddSingleton<IRequestHandler, AssociateHandler>();
            services.AddSingleton<IRequestHandler, ModelsHandler>();
            services.AddSingleton<IRequestHandler, AOTStructureHandler>();
            services.AddSingleton<IRequestHandler, SetupInfoHandler>();
            services.AddSingleton<IRequestHandler, ListObjectsByModelHandler>();
            services.AddSingleton<IRequestHandler, AvailableObjectTypesHandler>();
            services.AddSingleton<IRequestHandler, ShutdownHandler>(sp =>
                new ShutdownHandler(sp.GetRequiredService<ILogger>(), () => Environment.Exit(0)));
            
            // Register dynamic reflection handlers
            services.AddSingleton<IRequestHandler, DiscoverModificationCapabilitiesHandler>();
            services.AddSingleton<IRequestHandler, DiscoverAvailableTypesHandler>();
            services.AddSingleton<IRequestHandler, ExecuteObjectModificationHandler>();
            services.AddSingleton<IRequestHandler, InspectObjectHandler>();
            
            // Register summary-first inspection handlers (new architecture)
            services.AddSingleton<IRequestHandler, ObjectSummaryHandler>();
            services.AddSingleton<IRequestHandler, ObjectPropertiesHandler>();
            services.AddSingleton<IRequestHandler, ObjectCollectionHandler>();
            services.AddSingleton<IRequestHandler, ObjectCodeHandler>();

            // Register handler factory
            services.AddSingleton<RequestHandlerFactory>();

            // Register Named Pipe Server
            services.AddSingleton<NamedPipeServer>(sp =>
                new NamedPipeServer(
                    sp.GetRequiredService<RequestHandlerFactory>(),
                    sp.GetRequiredService<ILogger>(),
                    config.MaxConnections));
        }

        private static void InitializeLogging()
        {
            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
                .WriteTo.Console(
                    outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
                .WriteTo.File(
                    path: "logs/d365-metadata-service-.log",
                    rollingInterval: RollingInterval.Day,
                    outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
                .CreateLogger();

            _logger = Log.Logger;
        }

        private static ServiceConfiguration LoadConfiguration()
        {
            var configuration = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .AddEnvironmentVariables()
                .Build();

            var serviceConfig = new ServiceConfiguration();
            configuration.Bind(serviceConfig);

            // Validate configuration
            ValidateConfiguration(serviceConfig);

            return serviceConfig;
        }

        private static void ValidateConfiguration(ServiceConfiguration config)
        {
            if (string.IsNullOrWhiteSpace(config.PipeName))
                throw new ArgumentException("PipeName cannot be empty");

            if (config.MaxConnections <= 0)
                throw new ArgumentException($"MaxConnections must be greater than 0: {config.MaxConnections}");

            if (config.D365Config == null)
                throw new ArgumentException("D365Config section is missing from configuration");

            if (string.IsNullOrEmpty(config.D365Config.DefaultModel))
                config.D365Config.DefaultModel = "ApplicationSuite"; // Set default if not specified

            _logger.Information("Configuration validated successfully");
            _logger.Information("Service will use Named Pipes: {PipeName} with max {MaxConnections} connections", 
                config.PipeName, config.MaxConnections);
        }

        private static async Task WaitForShutdownAsync()
        {
            var shutdownEvent = new ManualResetEventSlim(false);

            // Wait for shutdown signal
            await Task.Run(() => shutdownEvent.Wait());
        }

        private static void OnCancelKeyPress(object sender, ConsoleCancelEventArgs e)
        {
            _logger.Information("Shutdown signal received (Ctrl+C)");
            e.Cancel = true; // Prevent immediate termination

            // Trigger graceful shutdown
            _ = Task.Run(async () =>
            {
                try
                {
                    await GracefulShutdownAsync();
                }
                finally
                {
                    Environment.Exit(0);
                }
            });
        }

        private static void OnProcessExit(object sender, EventArgs e)
        {
            _logger.Information("Process exit signal received");
            
            // Perform synchronous cleanup
            try
            {
                _namedPipeServer?.StopAsync().Wait(TimeSpan.FromSeconds(5));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error during process exit cleanup");
            }
        }

        private static async Task GracefulShutdownAsync()
        {
            _logger.Information("=== Starting Graceful Shutdown ===");

            try
            {
                if (_namedPipeServer != null)
                {
                    _logger.Information("Stopping Named Pipe Server...");
                    await _namedPipeServer.StopAsync();
                    _logger.Information("Named Pipe Server stopped");
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error during graceful shutdown");
            }

            _logger.Information("=== Graceful Shutdown Complete ===");
        }
    }
}
