using D365MetadataService.Models;
using D365MetadataService.Services;
using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace D365MetadataService.Handlers
{
    /// <summary>
    /// Handler for label management operations
    /// Supports get (single label) and batch (multiple labels) operations
    /// </summary>
    public class LabelHandler : BaseRequestHandler
    {
        private readonly LabelParser _labelParser;

        public LabelHandler(LabelParser labelParser, ILogger logger) : base(logger)
        {
            _labelParser = labelParser ?? throw new ArgumentNullException(nameof(labelParser));
        }

        public override string SupportedAction => "labels";

        protected override Task<ServiceResponse> HandleRequestAsync(ServiceRequest request)
        {
            var validationError = ValidateRequest(request);
            if (validationError != null)
                return Task.FromResult(validationError);

            try
            {
                // Get subAction from parameters
                if (!request.Parameters.TryGetValue("subAction", out var subActionObj) || subActionObj == null)
                {
                    return Task.FromResult(ServiceResponse.CreateError("subAction parameter is required"));
                }

                var subAction = subActionObj.ToString();

                switch (subAction.ToLowerInvariant())
                {
                    case "get":
                        return Task.FromResult(HandleGetLabel(request));
                    case "batch":
                        return Task.FromResult(HandleBatchLabels(request));
                    default:
                        return Task.FromResult(ServiceResponse.CreateError($"Unknown subAction: {subAction}"));
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error handling label request");
                return Task.FromResult(ServiceResponse.CreateError($"Label operation failed: {ex.Message}"));
            }
        }

        private ServiceResponse HandleGetLabel(ServiceRequest request)
        {
            // Get labelId parameter
            if (!request.Parameters.TryGetValue("labelId", out var labelIdObj) || labelIdObj == null)
            {
                return ServiceResponse.CreateError("labelId parameter is required");
            }

            var labelId = labelIdObj.ToString();

            // Get optional language parameter
            var language = "en-US";
            if (request.Parameters.TryGetValue("language", out var languageObj) && languageObj != null)
            {
                language = languageObj.ToString();
            }

            // Get optional includeDescription parameter
            var includeDescription = false;
            if (request.Parameters.TryGetValue("includeDescription", out var includeDescObj) && includeDescObj != null)
            {
                if (includeDescObj is bool boolValue)
                {
                    includeDescription = boolValue;
                }
                else if (bool.TryParse(includeDescObj.ToString(), out var parsedBool))
                {
                    includeDescription = parsedBool;
                }
            }

            // Parse label reference to extract label file ID and actual label ID.
            // Supports both modern (@FileID:LabelID) and legacy (@SYS12345) formats.
            string labelFileId = null;
            string actualLabelId = null;
            if (labelId.StartsWith("@"))
            {
                var withoutAt = labelId.Substring(1);
                var colonIndex = withoutAt.IndexOf(':');
                if (colonIndex >= 0)
                {
                    // Modern format: @LabelFileID:LabelID
                    labelFileId = withoutAt.Substring(0, colonIndex);
                    actualLabelId = withoutAt.Substring(colonIndex + 1);
                }
                else
                {
                    // Legacy format: @SYS12345 — extract alphabetic prefix as file ID
                    var prefixLength = 0;
                    while (prefixLength < withoutAt.Length && char.IsLetter(withoutAt[prefixLength]))
                        prefixLength++;
                    if (prefixLength > 0 && prefixLength < withoutAt.Length)
                    {
                        labelFileId = withoutAt.Substring(0, prefixLength);
                        actualLabelId = withoutAt; // full string (e.g. "SYS12345") is the key in the label file
                    }
                }
            }

            // Get label info
            var labelInfo = _labelParser.GetLabelInfo(labelId, language);

            var response = new
            {
                labelId = labelId,
                labelFileId = labelFileId,
                actualLabelId = actualLabelId,
                language = language,
                labelText = labelInfo?.Text,
                description = includeDescription ? labelInfo?.Description : null,
                found = labelInfo != null,
                fallbackApplied = false // Can be enhanced to track fallback
            };

            return ServiceResponse.CreateSuccess(response);
        }

        private ServiceResponse HandleBatchLabels(ServiceRequest request)
        {
            // Get labelIds parameter
            if (!request.Parameters.TryGetValue("labelIds", out var labelIdsObj) || labelIdsObj == null)
            {
                return ServiceResponse.CreateError("labelIds parameter is required");
            }

            List<string> labelIds;
            try
            {
                if (labelIdsObj is Newtonsoft.Json.Linq.JArray jArray)
                {
                    labelIds = jArray.ToObject<List<string>>();
                }
                else if (labelIdsObj is List<object> objList)
                {
                    labelIds = objList.Select(o => o?.ToString()).Where(s => s != null).ToList();
                }
                else if (labelIdsObj is string[] strArray)
                {
                    labelIds = strArray.ToList();
                }
                else
                {
                    return ServiceResponse.CreateError("labelIds must be an array of strings");
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error parsing labelIds parameter");
                return ServiceResponse.CreateError($"Error parsing labelIds: {ex.Message}");
            }

            // Get optional language parameter
            var language = "en-US";
            if (request.Parameters.TryGetValue("language", out var languageObj) && languageObj != null)
            {
                language = languageObj.ToString();
            }

            // Get labels batch
            var labels = _labelParser.GetLabelsBatch(labelIds, language);

            // Determine missing labels
            var missingLabels = labelIds.Where(id => !labels.ContainsKey(id)).ToList();

            var response = new
            {
                language = language,
                totalRequested = labelIds.Count,
                totalFound = labels.Count,
                labels = labels,
                missingLabels = missingLabels
            };

            return ServiceResponse.CreateSuccess(response);
        }
    }
}
