using System.Collections.Generic;

namespace D365MetadataService.Models
{
    /// <summary>
    /// Result of parameter validation for object modification operations
    /// Provides detailed feedback about parameter matching and validation errors
    /// </summary>
    public class ParameterValidationResult
    {
        /// <summary>
        /// Whether all provided parameters are valid and match requirements
        /// </summary>
        public bool IsValid { get; set; }

        /// <summary>
        /// Primary error message describing validation failure
        /// </summary>
        public string ErrorMessage { get; set; }

        /// <summary>
        /// List of required parameters that were missing from the provided parameters
        /// </summary>
        public List<string> MissingRequiredParameters { get; set; } = new List<string>();

        /// <summary>
        /// List of provided parameters that don't match any expected parameters
        /// </summary>
        public List<string> UnknownParameters { get; set; } = new List<string>();

        /// <summary>
        /// List of suggested parameter names that should be used instead
        /// </summary>
        public List<string> SuggestedParameters { get; set; } = new List<string>();

        /// <summary>
        /// The D365 object type being created that had parameter validation issues
        /// </summary>
        public string ObjectTypeBeingCreated { get; set; }

        /// <summary>
        /// Additional validation details for debugging
        /// </summary>
        public string ValidationDetails { get; set; }

        /// <summary>
        /// The method name being executed
        /// </summary>
        public string MethodName { get; set; }

        /// <summary>
        /// The target object type being modified
        /// </summary>
        public string TargetObjectType { get; set; }

        /// <summary>
        /// Create a successful validation result
        /// </summary>
        public static ParameterValidationResult Success()
        {
            return new ParameterValidationResult
            {
                IsValid = true,
                ErrorMessage = null
            };
        }

        /// <summary>
        /// Create a validation failure result with error details
        /// </summary>
        public static ParameterValidationResult Failure(
            string errorMessage, 
            string objectTypeBeingCreated = null,
            string methodName = null,
            string targetObjectType = null)
        {
            return new ParameterValidationResult
            {
                IsValid = false,
                ErrorMessage = errorMessage,
                ObjectTypeBeingCreated = objectTypeBeingCreated,
                MethodName = methodName,
                TargetObjectType = targetObjectType
            };
        }
    }
}