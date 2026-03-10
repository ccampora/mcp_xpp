using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Collections.Concurrent;
using Serilog;

namespace D365MetadataService.Services
{
    /// <summary>
    /// Label information including text and optional description
    /// </summary>
    public class LabelInfo
    {
        public string LabelId { get; set; }
        public string Text { get; set; }
        public string Description { get; set; }
    }

    /// <summary>
    /// Parser for D365 F&O label files from local metadata
    /// Handles format: LabelID=Translated text
    /// Optional description lines start with semicolon (;Description)
    /// Example:
    ///   ABBYYAmount=ABBYY Částka
    ///   ;This is an optional description
    /// </summary>
    public class LabelParser
    {
        private readonly string _packagesDirectory;
        private readonly ILogger _logger;
        private readonly List<string> _additionalSearchPaths;

        // Cache for parsed label files - key: filePath, value: labels dictionary
        private readonly ConcurrentDictionary<string, Dictionary<string, LabelInfo>> _labelCache = new();

        // Regex patterns for parsing
        private static readonly Regex LabelLineRegex = new Regex(@"^([A-Za-z0-9_]+)=(.*)$", RegexOptions.Compiled);
        private static readonly Regex DescriptionLineRegex = new Regex(@"^;(.*)$", RegexOptions.Compiled);
        private static readonly Regex LabelReferenceRegex = new Regex(@"^@([A-Za-z0-9_]+):([A-Za-z0-9_]+)$", RegexOptions.Compiled);

        public LabelParser(string packagesDirectory, ILogger logger, List<string> additionalSearchPaths = null)
        {
            _packagesDirectory = packagesDirectory ?? throw new ArgumentNullException(nameof(packagesDirectory));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _additionalSearchPaths = additionalSearchPaths ?? new List<string>();
        }

        /// <summary>
        /// Get single label text by reference (@LabelFileID:LabelID)
        /// </summary>
        public string GetLabelText(string labelReference, string language = "en-US")
        {
            var labelInfo = GetLabelInfo(labelReference, language);
            return labelInfo?.Text;
        }

        /// <summary>
        /// Get label with description
        /// </summary>
        public LabelInfo GetLabelInfo(string labelReference, string language = "en-US")
        {
            if (string.IsNullOrWhiteSpace(labelReference))
            {
                _logger.Warning("Empty label reference provided");
                return null;
            }

            // Parse label reference
            var match = LabelReferenceRegex.Match(labelReference);
            if (!match.Success)
            {
                _logger.Warning("Invalid label reference format: {LabelReference}. Expected format: @LabelFileID:LabelID", labelReference);
                return null;
            }

            var labelFileId = match.Groups[1].Value;
            var labelId = match.Groups[2].Value;

            // Try to find the label file
            var labelFile = FindLabelFile(labelFileId, language);
            if (labelFile == null)
            {
                // Try fallback to en-US if not found
                if (language != "en-US")
                {
                    _logger.Information("Label file not found for language {Language}, falling back to en-US", language);
                    labelFile = FindLabelFile(labelFileId, "en-US");
                }

                if (labelFile == null)
                {
                    _logger.Warning("Label file not found: {LabelFileId} for language {Language}", labelFileId, language);
                    return null;
                }
            }

            // Parse the label file and get the label
            var labels = ParseLabelFile(labelFile);
            if (labels.TryGetValue(labelId, out var labelInfo))
            {
                return labelInfo;
            }

            _logger.Warning("Label not found: {LabelId} in file {LabelFile}", labelId, labelFile);
            return null;
        }

        /// <summary>
        /// Get multiple labels efficiently in a single request
        /// </summary>
        public Dictionary<string, string> GetLabelsBatch(List<string> labelReferences, string language = "en-US")
        {
            var results = new Dictionary<string, string>();

            if (labelReferences == null || labelReferences.Count == 0)
            {
                return results;
            }

            // Group by label file for efficient processing
            var groupedByFile = new Dictionary<string, List<(string reference, string labelId)>>();

            foreach (var reference in labelReferences)
            {
                var match = LabelReferenceRegex.Match(reference);
                if (match.Success)
                {
                    var labelFileId = match.Groups[1].Value;
                    var labelId = match.Groups[2].Value;

                    if (!groupedByFile.ContainsKey(labelFileId))
                    {
                        groupedByFile[labelFileId] = new List<(string, string)>();
                    }
                    groupedByFile[labelFileId].Add((reference, labelId));
                }
                else
                {
                    _logger.Warning("Invalid label reference format: {Reference}", reference);
                }
            }

            // Process each label file once
            foreach (var kvp in groupedByFile)
            {
                var labelFileId = kvp.Key;
                var labelFile = FindLabelFile(labelFileId, language);

                if (labelFile == null && language != "en-US")
                {
                    labelFile = FindLabelFile(labelFileId, "en-US");
                }

                if (labelFile == null)
                {
                    _logger.Warning("Label file not found: {LabelFileId}", labelFileId);
                    continue;
                }

                var labels = ParseLabelFile(labelFile);

                foreach (var (reference, labelId) in kvp.Value)
                {
                    if (labels.TryGetValue(labelId, out var labelInfo))
                    {
                        results[reference] = labelInfo.Text;
                    }
                    else
                    {
                        _logger.Warning("Label not found: {LabelId} in file {LabelFile}", labelId, labelFile);
                    }
                }
            }

            return results;
        }

        /// <summary>
        /// Get available languages for a specific label file
        /// </summary>
        public List<string> GetAvailableLanguages(string packageName, string modelName, string labelFileId)
        {
            var languages = new List<string>();

            try
            {
                var labelResourcesPath = Path.Combine(_packagesDirectory, packageName, modelName, "AxLabelFile", "LabelResources");
                
                if (!Directory.Exists(labelResourcesPath))
                {
                    return languages;
                }

                var languageDirs = Directory.GetDirectories(labelResourcesPath);
                foreach (var langDir in languageDirs)
                {
                    var language = Path.GetFileName(langDir);
                    var labelFilePath = Path.Combine(langDir, $"{labelFileId}.{language}.label.txt");
                    
                    if (File.Exists(labelFilePath))
                    {
                        languages.Add(language);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error getting available languages for {LabelFileId}", labelFileId);
            }

            return languages;
        }

        /// <summary>
        /// Get available label files in a package/model
        /// </summary>
        public List<string> GetAvailableLabelFiles(string packageName, string modelName, string language = "en-US")
        {
            var labelFiles = new List<string>();

            try
            {
                var labelResourcesPath = Path.Combine(_packagesDirectory, packageName, modelName, "AxLabelFile", "LabelResources", language);
                
                if (!Directory.Exists(labelResourcesPath))
                {
                    return labelFiles;
                }

                var files = Directory.GetFiles(labelResourcesPath, "*.label.txt");
                foreach (var file in files)
                {
                    var fileName = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(file));
                    labelFiles.Add(fileName);
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error getting available label files");
            }

            return labelFiles;
        }

        /// <summary>
        /// Clear the label cache
        /// </summary>
        public void ClearCache()
        {
            _labelCache.Clear();
            _logger.Information("Label cache cleared");
        }

        /// <summary>
        /// Find a label file by label file ID and language
        /// Searches across all packages/models with layering support (custom models override standard)
        /// </summary>
        private string FindLabelFile(string labelFileId, string language)
        {
            // Build the ordered list of root directories to search.
            // PackagesLocalDirectory is searched first; AdditionalLabelSearchPaths are fallbacks.
            var searchRoots = new List<string>();
            if (Directory.Exists(_packagesDirectory))
                searchRoots.Add(_packagesDirectory);
            foreach (var extra in _additionalSearchPaths)
                if (!string.IsNullOrWhiteSpace(extra) && Directory.Exists(extra))
                    searchRoots.Add(extra);

            if (searchRoots.Count == 0)
            {
                _logger.Warning("No valid label search directories found. PackagesDirectory='{PackagesDirectory}'", _packagesDirectory);
                return null;
            }

            var foundFiles = new List<string>();

            foreach (var root in searchRoots)
            {
                try
                {
                    foreach (var package in Directory.GetDirectories(root))
                    {
                        foreach (var model in Directory.GetDirectories(package))
                        {
                            var labelFilePath = Path.Combine(model, "AxLabelFile", "LabelResources", language, $"{labelFileId}.{language}.label.txt");
                            if (File.Exists(labelFilePath))
                                foundFiles.Add(labelFilePath);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.Error(ex, "Error searching label files in root '{Root}' for '{LabelFileId}'", root, labelFileId);
                }
            }

            // Return the last found file (supports layering - custom models override standard)
            if (foundFiles.Count > 0)
            {
                var selectedFile = foundFiles.Last();
                _logger.Debug("Found label file: {LabelFile}", selectedFile);
                return selectedFile;
            }

            return null;
        }

        /// <summary>
        /// Parse a label file and return all labels
        /// Format: LabelID=Translated text
        ///         ;Description (optional, next line, starts with semicolon)
        /// Example file content:
        ///   ABBYYActiveErr01=Není zadaný název datového zdroje
        ///   ABBYYAmount=ABBYY Částka
        ///   ;Optional description for the label above
        /// </summary>
        private Dictionary<string, LabelInfo> ParseLabelFile(string filePath)
        {
            // Check cache first
            if (_labelCache.TryGetValue(filePath, out var cachedLabels))
            {
                return cachedLabels;
            }

            var labels = new Dictionary<string, LabelInfo>();
            LabelInfo currentLabel = null;

            try
            {
                var lines = File.ReadAllLines(filePath);

                foreach (var line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line))
                    {
                        // Empty line resets current label context
                        currentLabel = null;
                        continue;
                    }

                    // Check if it's a label line
                    var labelMatch = LabelLineRegex.Match(line);
                    if (labelMatch.Success)
                    {
                        var labelId = labelMatch.Groups[1].Value;
                        var labelText = labelMatch.Groups[2].Value;

                        currentLabel = new LabelInfo
                        {
                            LabelId = labelId,
                            Text = labelText,
                            Description = null
                        };

                        labels[labelId] = currentLabel;
                        continue;
                    }

                    // Check if it's a description line
                    var descMatch = DescriptionLineRegex.Match(line);
                    if (descMatch.Success && currentLabel != null)
                    {
                        currentLabel.Description = descMatch.Groups[1].Value;
                        continue;
                    }

                    // Unknown line format - reset context
                    currentLabel = null;
                }

                // Cache the results
                _labelCache[filePath] = labels;

                _logger.Information("Parsed {Count} labels from {FilePath}", labels.Count, filePath);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Error parsing label file: {FilePath}", filePath);
            }

            return labels;
        }
    }
}
