using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace D365MetadataService.Models
{
    public class ServiceRequest
    {
        public string Id { get; set; }
        public string Action { get; set; }
        public string ObjectType { get; set; }
        
        [JsonProperty("Parameters")]
        public JObject ParametersRaw { get; set; } = new JObject();
        
        // Helper property to convert JObject to Dictionary when needed
        [JsonIgnore]
        public Dictionary<string, object> Parameters 
        { 
            get 
            {
                var dict = new Dictionary<string, object>();
                if (ParametersRaw != null)
                {
                    foreach (var property in ParametersRaw.Properties())
                    {
                        dict[property.Name] = property.Value.ToObject<object>();
                    }
                }
                return dict;
            }
        }
    }

    public class ServiceResponse
    {
        public string Id { get; set; }
        public bool Success { get; set; }
        public object Data { get; set; }
        public string Error { get; set; }
        public double ProcessingTimeMs { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        public static ServiceResponse CreateSuccess(object data)
        {
            return new ServiceResponse
            {
                Success = true,
                Data = data
            };
        }

        public static ServiceResponse CreateError(string error)
        {
            return new ServiceResponse
            {
                Success = false,
                Error = error
            };
        }
    }

    public class ObjectCreationResult
    {
        public string ObjectType { get; set; }
        public string Name { get; set; }
        public string XmlContent { get; set; }
        public string XmlPath { get; set; }
        public bool Success { get; set; } = true;
        public string ErrorMessage { get; set; }
        public Dictionary<string, object> Properties { get; set; } = new Dictionary<string, object>();
    }

    public class HealthCheckResult
    {
        public string Status { get; set; } = "Healthy";
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public int ActiveConnections { get; set; }
        public int MaxConnections { get; set; }
        public Dictionary<string, object> ServiceInfo { get; set; } = new Dictionary<string, object>();
    }

    public class ServiceConfiguration
    {
        public string PipeName { get; set; } = "mcp-xpp-d365-service";
        public int MaxConnections { get; set; } = 50;
        
        // Timeout configurations (in seconds)
        public int SessionTimeoutSeconds { get; set; } = 300;  // 5 minutes
        public int ReadTimeoutSeconds { get; set; } = 30;      // 30 seconds
        public int RequestTimeoutSeconds { get; set; } = 120;  // 2 minutes
        public int ResponseTimeoutSeconds { get; set; } = 30;  // 30 seconds
        
        public D365Configuration D365Config { get; set; } = new D365Configuration();
    }

    public class D365Configuration
    {
        public string MetadataAssemblyPath { get; set; }
        public string DefaultModel { get; set; } = "ApplicationSuite";
        public string PackagesLocalDirectory { get; set; }
        public string CustomMetadataPath { get; set; }
    }
}
