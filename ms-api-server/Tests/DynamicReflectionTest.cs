using System;
using System.Linq;
using System.Threading.Tasks;
using D365MetadataService.Services;
using D365MetadataService.Models;
using System.Collections.Generic;

namespace D365MetadataService.Tests
{
    /// <summary>
    /// Test class demonstrating the dynamic reflection approach
    /// Shows how agents can discover and execute D365 modifications in real-time
    /// </summary>
    public class DynamicReflectionTest
    {
        private readonly DynamicD365ReflectionService _reflectionService;

        public DynamicReflectionTest(DynamicD365ReflectionService reflectionService)
        {
            _reflectionService = reflectionService;
        }

        /// <summary>
        /// Test 1: Agent discovers AxTable modification capabilities
        /// </summary>
        public async Task TestDiscoverAxTableCapabilities()
        {
            Console.WriteLine("=== TEST 1: Discovering AxTable Modification Capabilities ===");
            
            var capabilities = await _reflectionService.DiscoverModificationCapabilitiesAsync("AxTable");
            
            if (capabilities.Success)
            {
                Console.WriteLine($"Successfully discovered capabilities for {capabilities.ObjectType}");
                Console.WriteLine($"Type: {capabilities.TypeFullName}");
                Console.WriteLine($"Found {capabilities.ModificationMethods.Count} modification methods:");
                
                foreach (var method in capabilities.ModificationMethods)
                {
                    Console.WriteLine($"  - {method.Name}({string.Join(", ", method.Parameters.Select(p => $"{p.Type} {p.Name}"))}) -> {method.ReturnType}");
                    Console.WriteLine($"    Description: {method.Description}");
                }
                
                Console.WriteLine($"\nFound {capabilities.WritableProperties.Count} writable properties:");
                foreach (var prop in capabilities.WritableProperties)
                {
                    Console.WriteLine($"  - {prop.Name} ({prop.Type})");
                    if (prop.IsCollection)
                    {
                        Console.WriteLine($"    Collection methods: {string.Join(", ", prop.CollectionMethods)}");
                    }
                }
                
                Console.WriteLine($"\nFound {capabilities.RelatedTypeConstructors.Count} related types that can be created:");
                foreach (var type in capabilities.RelatedTypeConstructors)
                {
                    Console.WriteLine($"  - {type.Name}: {type.Description}");
                }
            }
            else
            {
                Console.WriteLine($"Failed to discover capabilities: {capabilities.Error}");
            }
            
            Console.WriteLine();
        }

        /// <summary>
        /// Test 2: Agent discovers field types that can be created
        /// </summary>
        public async Task TestDiscoverFieldTypes()
        {
            Console.WriteLine("=== TEST 2: Discovering Available Field Types ===");
            
            try
            {
                var fieldTypes = await _reflectionService.DiscoverFieldTypesAsync();
                
                Console.WriteLine($"Found {fieldTypes.Count} field types that can be created:");
                foreach (var fieldType in fieldTypes)
                {
                    Console.WriteLine($"  - {fieldType.Name}: {fieldType.Description}");
                    if (fieldType.Constructors.Count > 0)
                    {
                        foreach (var constructor in fieldType.Constructors)
                        {
                            var paramList = constructor.Parameters.Count > 0 ? 
                                string.Join(", ", constructor.Parameters.Select(p => $"{p.Type} {p.Name}")) : 
                                "no parameters";
                            Console.WriteLine($"    Constructor: ({paramList})");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error discovering field types: {ex.Message}");
            }
            
            Console.WriteLine();
        }

        /// <summary>
        /// Test 3: Agent creates a string field dynamically
        /// </summary>
        public async Task TestCreateFieldDynamically()
        {
            Console.WriteLine("=== TEST 3: Creating Field Instance Dynamically ===");
            
            var creationResult = await _reflectionService.CreateInstanceAsync("AxTableFieldString", new Dictionary<string, object>
            {
                { "Name", "DynamicTestField" },
                { "Label", "Dynamic Test Field" },
                { "HelpText", "Field created through dynamic reflection" }
            });
            
            if (creationResult.Success)
            {
                Console.WriteLine($"Successfully created {creationResult.TypeName}");
                Console.WriteLine($"Execution time: {creationResult.ExecutionTime.TotalMilliseconds}ms");
                Console.WriteLine($"Instance type: {creationResult.Instance.GetType().Name}");
                
                if (creationResult.Warnings.Count > 0)
                {
                    Console.WriteLine("Warnings:");
                    foreach (var warning in creationResult.Warnings)
                    {
                        Console.WriteLine($"  - {warning}");
                    }
                }
            }
            else
            {
                Console.WriteLine($"Failed to create field: {creationResult.Error}");
            }
            
            Console.WriteLine();
        }

        /// <summary>
        /// Test 4: Agent executes AddField method dynamically
        /// </summary>
        public async Task TestExecuteAddFieldDynamically()
        {
            Console.WriteLine("=== TEST 4: Executing AddField Method Dynamically ===");
            
            // First create a field instance
            var fieldCreation = await _reflectionService.CreateInstanceAsync("AxTableFieldString", new Dictionary<string, object>
            {
                { "Name", "DynamicAddedField" }
            });
            
            if (!fieldCreation.Success)
            {
                Console.WriteLine($"Failed to create field: {fieldCreation.Error}");
                return;
            }

            // Now execute AddField method dynamically
            var methodCall = new DynamicMethodCall
            {
                ObjectType = "AxTable",
                ObjectName = "CustTable", // This would need to exist
                MethodName = "AddField",
                Parameters = new Dictionary<string, object>
                {
                    { "field", fieldCreation.Instance }
                }
            };

            var executionResult = await _reflectionService.ExecuteModificationMethodAsync(methodCall);
            
            if (executionResult.Success)
            {
                Console.WriteLine($"Successfully executed {executionResult.MethodName} on {executionResult.ObjectName}");
                Console.WriteLine($"Execution time: {executionResult.ExecutionTime.TotalMilliseconds}ms");
                Console.WriteLine($"Return value: {executionResult.ReturnValue}");
                Console.WriteLine($"Return type: {executionResult.ReturnType}");
                
                if (executionResult.UpdatedObjectInfo.Count > 0)
                {
                    Console.WriteLine("Updated object state:");
                    foreach (var info in executionResult.UpdatedObjectInfo)
                    {
                        Console.WriteLine($"  - {info.Key}: {info.Value}");
                    }
                }
            }
            else
            {
                Console.WriteLine($"Failed to execute method: {executionResult.Error}");
            }
            
            Console.WriteLine();
        }

        /// <summary>
        /// Test 5: Agent workflow - Discover, Create, Execute
        /// </summary>
        public async Task TestCompleteAgentWorkflow()
        {
            Console.WriteLine("=== TEST 5: Complete Agent Workflow ===");
            
            try
            {
                // Step 1: Agent asks "What can I do with AxTable?"
                Console.WriteLine("Agent: What modification options are available for AxTable?");
                var capabilities = await _reflectionService.DiscoverModificationCapabilitiesAsync("AxTable");
                
                if (capabilities.Success)
                {
                    Console.WriteLine($"System: Found {capabilities.ModificationMethods.Count} modification methods.");
                    var addFieldMethod = capabilities.ModificationMethods.FirstOrDefault(m => m.Name == "AddField");
                    if (addFieldMethod != null)
                    {
                        Console.WriteLine($"System: AddField method available with parameters: {string.Join(", ", addFieldMethod.Parameters.Select(p => p.Type + " " + p.Name))}");
                    }
                }

                // Step 2: Agent asks "What field types can I create?"
                Console.WriteLine("\nAgent: What field types can I create for tables?");
                var fieldTypes = await _reflectionService.DiscoverFieldTypesAsync();
                Console.WriteLine($"System: Found {fieldTypes.Count} field types: {string.Join(", ", fieldTypes.Take(5).Select(f => f.Name))}...");

                // Step 3: Agent creates a field
                Console.WriteLine("\nAgent: Create an AxTableFieldString with name 'AgentCreatedField'");
                var fieldResult = await _reflectionService.CreateInstanceAsync("AxTableFieldString", new Dictionary<string, object>
                {
                    { "Name", "AgentCreatedField" },
                    { "Label", "Field Created by Agent" }
                });
                
                if (fieldResult.Success)
                {
                    Console.WriteLine("System: Field created successfully");
                    
                    // Step 4: Agent executes AddField (would need real table)
                    Console.WriteLine("\nAgent: Add this field to CustTable using AddField method");
                    Console.WriteLine("System: Would execute AddField(field) on CustTable (requires actual table object)");
                }

                Console.WriteLine("\nWorkflow completed successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Workflow error: {ex.Message}");
            }
            
            Console.WriteLine();
        }

        /// <summary>
        /// Run all tests
        /// </summary>
        public async Task RunAllTests()
        {
            Console.WriteLine("DYNAMIC D365 REFLECTION SERVICE TESTS");
            Console.WriteLine("=====================================");
            Console.WriteLine();
            
            await TestDiscoverAxTableCapabilities();
            await TestDiscoverFieldTypes();
            await TestCreateFieldDynamically();
            await TestExecuteAddFieldDynamically();
            await TestCompleteAgentWorkflow();
            
            Console.WriteLine("All tests completed!");
        }
    }

}
