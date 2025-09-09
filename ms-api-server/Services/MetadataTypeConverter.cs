using System;
using Microsoft.Dynamics.AX.Metadata.Core.MetaModel;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Helper class for converting between common types and D365 metadata types
    /// </summary>
    public static class MetadataTypeConverter
    {
        /// <summary>
        /// Converts boolean to NoYes enum used by D365 metadata API
        /// </summary>
        public static NoYes ToNoYes(bool value)
        {
            return value ? NoYes.Yes : NoYes.No;
        }

        /// <summary>
        /// Converts NoYes enum to boolean
        /// </summary>
        public static bool FromNoYes(NoYes value)
        {
            return value == NoYes.Yes;
        }

        /// <summary>
        /// Safely converts string to integer, returns 0 if invalid
        /// </summary>
        public static int ToInt(string value, int defaultValue = 0)
        {
            if (int.TryParse(value, out int result))
                return result;
            return defaultValue;
        }

        /// <summary>
        /// Ensures string is not null, returns empty string if null
        /// </summary>
        public static string SafeString(string value)
        {
            return value ?? string.Empty;
        }

        /// <summary>
        /// Validates and returns a safe field name (alphanumeric + underscore only)
        /// </summary>
        public static string SafeFieldName(string fieldName)
        {
            if (string.IsNullOrWhiteSpace(fieldName))
                throw new ArgumentException("Field name cannot be null or empty");

            // Remove invalid characters and ensure it starts with letter or underscore
            var safeName = System.Text.RegularExpressions.Regex.Replace(fieldName, @"[^a-zA-Z0-9_]", "");
            
            if (string.IsNullOrEmpty(safeName))
                throw new ArgumentException($"Field name '{fieldName}' contains no valid characters");

            // Ensure it starts with letter or underscore
            if (!char.IsLetter(safeName[0]) && safeName[0] != '_')
                safeName = "_" + safeName;

            return safeName;
        }

        /// <summary>
        /// Validates and returns a safe method name
        /// </summary>
        public static string SafeMethodName(string methodName)
        {
            if (string.IsNullOrWhiteSpace(methodName))
                throw new ArgumentException("Method name cannot be null or empty");

            // Remove invalid characters
            var safeName = System.Text.RegularExpressions.Regex.Replace(methodName, @"[^a-zA-Z0-9_]", "");
            
            if (string.IsNullOrEmpty(safeName))
                throw new ArgumentException($"Method name '{methodName}' contains no valid characters");

            // Ensure it starts with letter or underscore
            if (!char.IsLetter(safeName[0]) && safeName[0] != '_')
                safeName = "_" + safeName;

            return safeName;
        }
    }
}
