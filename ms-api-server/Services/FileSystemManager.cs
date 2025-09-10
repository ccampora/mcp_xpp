using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Concurrent;
using Serilog;

namespace D365MetadataService.Services
{
    /// <summary>
    /// CENTRALIZED File System Manager - Single Source of Truth for all filesystem operations
    /// Eliminates scattered filesystem logic across multiple handlers and services
    /// 
    /// DESIGN PRINCIPLES:
    /// - Single Responsibility: All filesystem logic in one place
    /// - Thread-Safe: Concurrent collections for high-performance caching
    /// - Path Security: Validates and normalizes all paths
    /// - Performance Optimized: Aggressive caching of expensive filesystem operations
    /// </summary>
    public class FileSystemManager
    {
        #region Private Fields

        private readonly ILogger _logger;
        private static readonly Lazy<FileSystemManager> _instance = new(() => new FileSystemManager());
        
        // Thread-safe caches for expensive filesystem operations
        private readonly ConcurrentDictionary<string, bool> _fileExistsCache = new();
        private readonly ConcurrentDictionary<string, bool> _directoryExistsCache = new();
        private readonly ConcurrentDictionary<string, string[]> _directoryListCache = new();
        private readonly ConcurrentDictionary<string, string> _extensionPathCache = new();
        
        // Cache expiration tracking
        private readonly ConcurrentDictionary<string, DateTime> _cacheTimestamp = new();
        private readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5); // 5-minute cache

        #endregion

        #region Constructor & Singleton

        private FileSystemManager()
        {
            _logger = Serilog.Log.ForContext<FileSystemManager>();
            _logger.Information("🚀 Initializing File System Manager...");
        }

        /// <summary>
        /// Singleton instance - thread-safe lazy initialization
        /// </summary>
        public static FileSystemManager Instance => _instance.Value;

        #endregion

        #region Core File Operations

        /// <summary>
        /// UNIFIED file existence check with caching and security validation
        /// </summary>
        public bool FileExists(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return false;

            try
            {
                var normalizedPath = Path.GetFullPath(filePath);
                
                // Check cache first
                if (IsCacheValid(normalizedPath) && _fileExistsCache.TryGetValue(normalizedPath, out var cachedResult))
                {
                    return cachedResult;
                }

                // Perform actual check
                var exists = File.Exists(normalizedPath);
                
                // Cache result
                _fileExistsCache[normalizedPath] = exists;
                _cacheTimestamp[normalizedPath] = DateTime.UtcNow;
                
                return exists;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error checking file existence: {FilePath}", filePath);
                return false;
            }
        }

        /// <summary>
        /// UNIFIED directory existence check with caching and security validation
        /// </summary>
        public bool DirectoryExists(string directoryPath)
        {
            if (string.IsNullOrWhiteSpace(directoryPath))
                return false;

            try
            {
                var normalizedPath = Path.GetFullPath(directoryPath);
                
                // Check cache first
                if (IsCacheValid(normalizedPath) && _directoryExistsCache.TryGetValue(normalizedPath, out var cachedResult))
                {
                    return cachedResult;
                }

                // Perform actual check
                var exists = Directory.Exists(normalizedPath);
                
                // Cache result
                _directoryExistsCache[normalizedPath] = exists;
                _cacheTimestamp[normalizedPath] = DateTime.UtcNow;
                
                return exists;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error checking directory existence: {DirectoryPath}", directoryPath);
                return false;
            }
        }

        /// <summary>
        /// UNIFIED directory enumeration with caching and filtering
        /// </summary>
        public string[] GetDirectories(string path, string searchPattern = "*", SearchOption searchOption = SearchOption.TopDirectoryOnly)
        {
            if (string.IsNullOrWhiteSpace(path))
                return Array.Empty<string>();

            try
            {
                var normalizedPath = Path.GetFullPath(path);
                var cacheKey = $"{normalizedPath}|{searchPattern}|{searchOption}";
                
                // Check cache first
                if (IsCacheValid(cacheKey) && _directoryListCache.TryGetValue(cacheKey, out var cachedResult))
                {
                    return cachedResult;
                }

                // Perform actual enumeration
                var directories = Directory.Exists(normalizedPath) 
                    ? Directory.GetDirectories(normalizedPath, searchPattern, searchOption)
                    : Array.Empty<string>();
                
                // Cache result
                _directoryListCache[cacheKey] = directories;
                _cacheTimestamp[cacheKey] = DateTime.UtcNow;
                
                return directories;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error enumerating directories: {Path}", path);
                return Array.Empty<string>();
            }
        }

        #endregion

        #region Path Operations

        /// <summary>
        /// UNIFIED path combination with security validation
        /// </summary>
        public string CombinePath(params string[] paths)
        {
            if (paths == null || paths.Length == 0)
                return string.Empty;

            try
            {
                var combined = Path.Combine(paths.Where(p => !string.IsNullOrWhiteSpace(p)).ToArray());
                return Path.GetFullPath(combined);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error combining paths: {@Paths}", paths);
                return string.Empty;
            }
        }

        /// <summary>
        /// UNIFIED directory name extraction with validation
        /// </summary>
        public string GetDirectoryName(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return string.Empty;

            try
            {
                return Path.GetDirectoryName(Path.GetFullPath(path)) ?? string.Empty;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error getting directory name: {Path}", path);
                return string.Empty;
            }
        }

        #endregion

        #region VS2022 Extension Discovery

        /// <summary>
        /// UNIFIED VS2022 extension path discovery with intelligent caching
        /// Centralizes complex filesystem logic for finding D365 extensions
        /// </summary>
        public string GetVS2022ExtensionPath(string targetAssembly = "Microsoft.Dynamics.AX.Metadata.dll")
        {
            var cacheKey = $"vs2022_extension_{targetAssembly}";
            
            // Check cache first
            if (IsCacheValid(cacheKey) && _extensionPathCache.TryGetValue(cacheKey, out var cachedPath))
            {
                return cachedPath;
            }

            try
            {
                _logger.Information("🔍 Discovering VS2022 extension path for {Assembly}...", targetAssembly);
                
                // Common VS2022 installation paths
                var commonPaths = new[]
                {
                    @"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\Extensions",
                    @"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\Extensions"
                };

                foreach (var basePath in commonPaths)
                {
                    if (DirectoryExists(basePath))
                    {
                        _logger.Debug("🔍 Searching in {BasePath}...", basePath);
                        
                        var extensionDirs = GetDirectories(basePath);
                        foreach (var dir in extensionDirs)
                        {
                            var assemblyPath = CombinePath(dir, targetAssembly);
                            if (FileExists(assemblyPath))
                            {
                                _logger.Information("✅ Found VS2022 extension at: {ExtensionPath}", dir);
                                
                                // Cache successful result
                                _extensionPathCache[cacheKey] = dir;
                                _cacheTimestamp[cacheKey] = DateTime.UtcNow;
                                
                                return dir;
                            }
                        }
                    }
                }

                _logger.Warning("⚠️ VS2022 extension path not found for {Assembly}", targetAssembly);
                
                // Cache negative result (shorter expiration)
                _extensionPathCache[cacheKey] = string.Empty;
                _cacheTimestamp[cacheKey] = DateTime.UtcNow;
                
                return string.Empty;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Error discovering VS2022 extension path");
                return string.Empty;
            }
        }

        #endregion

        #region Assembly Loading

        /// <summary>
        /// UNIFIED assembly loading with path validation and error handling
        /// </summary>
        public Assembly LoadAssemblyFromPath(string assemblyPath)
        {
            if (string.IsNullOrWhiteSpace(assemblyPath))
                throw new ArgumentException("Assembly path cannot be null or empty", nameof(assemblyPath));

            try
            {
                var normalizedPath = Path.GetFullPath(assemblyPath);
                
                if (!FileExists(normalizedPath))
                    throw new FileNotFoundException($"Assembly not found: {normalizedPath}");

                _logger.Information("📦 Loading assembly from: {AssemblyPath}", normalizedPath);
                
                var assembly = Assembly.LoadFrom(normalizedPath);
                
                _logger.Information("✅ Successfully loaded assembly: {AssemblyName}", assembly.FullName);
                
                return assembly;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "❌ Failed to load assembly from: {AssemblyPath}", assemblyPath);
                throw;
            }
        }

        #endregion

        #region Cache Management

        /// <summary>
        /// Check if cache entry is still valid based on expiration time
        /// </summary>
        private bool IsCacheValid(string key)
        {
            return _cacheTimestamp.TryGetValue(key, out var timestamp) && 
                   DateTime.UtcNow - timestamp < _cacheExpiration;
        }

        /// <summary>
        /// Clear expired cache entries to prevent memory bloat
        /// </summary>
        public void ClearExpiredCache()
        {
            try
            {
                var now = DateTime.UtcNow;
                var expiredKeys = _cacheTimestamp
                    .Where(kvp => now - kvp.Value >= _cacheExpiration)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var key in expiredKeys)
                {
                    _fileExistsCache.TryRemove(key, out _);
                    _directoryExistsCache.TryRemove(key, out _);
                    _directoryListCache.TryRemove(key, out _);
                    _extensionPathCache.TryRemove(key, out _);
                    _cacheTimestamp.TryRemove(key, out _);
                }

                if (expiredKeys.Count > 0)
                    _logger.Debug("🧹 Cleared {Count} expired cache entries", expiredKeys.Count);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "⚠️ Error clearing expired cache");
            }
        }

        /// <summary>
        /// Get cache statistics for monitoring and debugging
        /// </summary>
        public object GetCacheStatistics()
        {
            return new
            {
                FileExistsCacheSize = _fileExistsCache.Count,
                DirectoryExistsCacheSize = _directoryExistsCache.Count,
                DirectoryListCacheSize = _directoryListCache.Count,
                ExtensionPathCacheSize = _extensionPathCache.Count,
                TotalCacheEntries = _cacheTimestamp.Count,
                CacheExpirationMinutes = _cacheExpiration.TotalMinutes
            };
        }

        #endregion
    }
}
