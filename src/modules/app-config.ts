// =============================================================================
// APPLICATION CONFIGURATION MANAGER
// =============================================================================
// Centralized configuration management for the MCP X++ Server
// Handles command line arguments, directory creation, and configuration access

import { promises as fs } from "fs";
import { join } from "path";
import { DiskLogger } from "./logger.js";
import { ObjectIndexManager } from "./object-index.js";
import { autoDetectVS2022ExtensionPath } from "./vs2022-config.js";
import { D365ServiceClient } from "./d365-service-client.js";

// Import server start time function
let getServerStartTime: (() => Date | null) | null = null;

// Dynamically import the server start time function to avoid circular imports
async function importServerStartTime() {
  if (!getServerStartTime) {
    try {
      const serverModule = await import("../index.js");
      getServerStartTime = serverModule.getServerStartTime;
    } catch (error) {
      // If we can't import (e.g., in tests), we'll use fallback behavior
      getServerStartTime = () => null;
    }
  }
  return getServerStartTime;
}

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface ServerConfiguration {
  xppPath?: string;
  xppMetadataFolder?: string;
  vs2022ExtensionPath?: string;
  d365Url?: string; // Future use
}

export interface IndexStatistics {
  totalObjects: number;
  objectTypes: Record<string, number>;
  lastBuilt?: string;
  indexSize?: string;
  indexSizeInKB?: number;
  indexPath?: string;
}

export interface ModelInfo {
  name: string;
  displayName: string;
  publisher: string;
  version: string;
  layer: string;
  id: string;
  dependencies: string[];
  description?: string;
  descriptorPath: string;
  hasSource: boolean;
  hasBuildArtifacts: boolean;
  objectCount?: number;
}

export interface ApplicationConfiguration {
  serverConfig: ServerConfiguration;
  indexStats: IndexStatistics;
  models: ModelInfo[];
  applicationInfo: {
    name: string;
    version: string;
    startTime: string;
    uptime?: string;
  };
  systemInfo: {
    nodeVersion: string;
    platform: string;
    architecture: string;
  };
}

// =============================================================================
// CONFIGURATION MANAGER CLASS
// =============================================================================

class AppConfigManager {
  private config: ServerConfiguration = {};
  private startTime: Date = new Date();

  /**
   * Parse command line arguments and initialize configuration
   */
  public parseCommandLineArgs(): void {
    const args = process.argv.slice(2);
    const parsedConfig: ServerConfiguration = {};

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--xpp-path':
          if (i + 1 < args.length) {
            parsedConfig.xppPath = args[i + 1];
            i++; // Skip the next argument as it's the value
          }
          break;
        case '--xpp-metadata-folder':
          if (i + 1 < args.length) {
            parsedConfig.xppMetadataFolder = args[i + 1];
            i++; // Skip the next argument as it's the value
          }
          break;
        case '--vs2022-extension-path':
          if (i + 1 < args.length) {
            parsedConfig.vs2022ExtensionPath = args[i + 1];
            i++; // Skip the next argument as it's the value
          }
          break;
        case '--d365-url':
          if (i + 1 < args.length) {
            parsedConfig.d365Url = args[i + 1];
            i++; // Skip the next argument as it's the value
          }
          break;
      }
    }

    this.config = parsedConfig;
  }

  /**
   * Initialize configuration and create necessary directories
   */
  public async initialize(): Promise<void> {
    this.parseCommandLineArgs();

    // Try to get configuration from VS2022 service with 30-second timeout
    // This is now purely informational - the service handles all actual work
    let setupFromService = false;
    if (!this.config.xppPath || !this.config.xppMetadataFolder) {
      try {
        await DiskLogger.logDebug("Attempting to get setup configuration from VS2022 service...");
        console.log("Attempting to get setup configuration from VS2022 service (30s timeout)...");
        
        const setupInfo = await this.getSetupFromVS2022Service(30000); // 30 second timeout
        if (setupInfo) {
          // Update configuration with service-provided values (informational only)
          this.config.xppPath = this.config.xppPath || setupInfo.PackagesLocalDirectory;
          this.config.xppMetadataFolder = this.config.xppMetadataFolder || setupInfo.CustomMetadataPath;
          this.config.vs2022ExtensionPath = this.config.vs2022ExtensionPath || setupInfo.ExtensionPath;
          
          setupFromService = true;
          console.log("Setup configuration retrieved from VS2022 service");
          await DiskLogger.logDebug(`Setup from VS2022 service: ${JSON.stringify(setupInfo, null, 2)}`);
        }
      } catch (error) {
        await DiskLogger.logDebug(`Failed to get setup from VS2022 service: ${error}`);
        console.log("Could not get setup from VS2022 service, proceeding with available configuration");
      }
    }

    // Note: xppPath is now purely informational - VS2022 service handles all actual work
    // No validation required as the service operates independently

    // Create XPP metadata folder if specified and doesn't exist
    if (this.config.xppMetadataFolder) {
      await this.ensureDirectoryExists(this.config.xppMetadataFolder);
    }

    // Handle VS2022 extension path - validate if provided, or auto-detect if not
    if (this.config.vs2022ExtensionPath) {
      try {
        await fs.access(this.config.vs2022ExtensionPath);
        await DiskLogger.logDebug(`VS2022 extension path validated: ${this.config.vs2022ExtensionPath}`);
        
        // Also check if the templates subdirectory exists
        const templatesPath = join(this.config.vs2022ExtensionPath, "Templates", "ProjectItems", "FinanceOperations", "Dynamics 365 Items");
        try {
          await fs.access(templatesPath);
          await DiskLogger.logDebug(`VS2022 templates directory validated: ${templatesPath}`);
        } catch (error) {
          const warningMsg = `VS2022 templates directory not found: ${templatesPath}`;
          await DiskLogger.logDebug(warningMsg);
          console.warn(`WARNING: ${warningMsg}`);
        }
      } catch (error) {
        const errorMsg = `VS2022 extension path does not exist: ${this.config.vs2022ExtensionPath}`;
        await DiskLogger.logError(new Error(errorMsg), "vs2022-path-validation");
        throw new Error(errorMsg);
      }
    } else {
      // Try to auto-detect VS2022 extension path
      try {
        const autoDetectedPath = await autoDetectVS2022ExtensionPath();
        if (autoDetectedPath) {
          this.config.vs2022ExtensionPath = autoDetectedPath;
          await DiskLogger.logDebug(`VS2022 extension path auto-detected: ${autoDetectedPath}`);
          console.log(`Auto-detected VS2022 extension path: ${autoDetectedPath}`);
        } else {
          await DiskLogger.logDebug("VS2022 extension path not provided and auto-detection failed");
          console.log("VS2022 extension path not provided and could not be auto-detected");
        }
      } catch (error) {
        await DiskLogger.logDebug(`VS2022 auto-detection failed: ${error}`);
        console.warn(`VS2022 auto-detection failed: ${error}`);
      }
    }

    // Log configuration
    await DiskLogger.logDebug(`Configuration initialized: ${JSON.stringify(this.config, null, 2)}`);
  }

  /**
   * Ensure a directory exists, create it if it doesn't
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
      await DiskLogger.logDebug(`Directory exists: ${dirPath}`);
    } catch {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        await DiskLogger.logDebug(`Created directory: ${dirPath}`);
      } catch (error) {
        const errorMsg = `Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        await DiskLogger.logError(new Error(errorMsg), "directory-creation");
        throw new Error(errorMsg);
      }
    }
  }

  /**
   * Get setup configuration from VS2022 service
   */
  private async getSetupFromVS2022Service(timeoutMs: number): Promise<any | null> {
    const client = new D365ServiceClient('mcp-xpp-d365-service', timeoutMs, timeoutMs);
    
    try {
      await DiskLogger.logDebug(`Connecting to VS2022 service with ${timeoutMs}ms timeout...`);
      await client.connect();
      
      await DiskLogger.logDebug("Requesting setup information from VS2022 service...");
      const setupInfo = await client.getSetupInfo();
      
      await client.disconnect();
      
      if (setupInfo && setupInfo.Data) {
        await DiskLogger.logDebug("Setup information received successfully");
        return setupInfo.Data;
      } else {
        await DiskLogger.logDebug("Setup response received but no data available");
        return null;
      }
    } catch (error) {
      try {
        await client.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
      
      await DiskLogger.logDebug(`VS2022 service setup request failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get current server configuration
   */
  public getServerConfig(): ServerConfiguration {
    return { ...this.config };
  }

  /**
   * Get XPP codebase path
   */
  public getXppPath(): string | undefined {
    return this.config.xppPath;
  }

  /**
   * Get XPP metadata folder path
   */
  public getXppMetadataFolder(): string | undefined {
    return this.config.xppMetadataFolder;
  }

  /**
   * Get VS2022 extension path
   */
  public getVS2022ExtensionPath(): string | undefined {
    return this.config.vs2022ExtensionPath;
  }

  /**
   * Get D365 URL (future use)
   */
  public getD365Url(): string | undefined {
    return this.config.d365Url;
  }

  /**
   * Get comprehensive application configuration for JSON response
   */
  public async getApplicationConfiguration(): Promise<ApplicationConfiguration> {
    const indexStats = await this.getIndexStatistics();
    const models = await this.getAvailableModels();
    
    // Get server start time from the main server module
    const getServerStartTimeFn = await importServerStartTime();
    const actualStartTime = getServerStartTimeFn?.() || this.startTime;
    const uptime = Date.now() - actualStartTime.getTime();

    return {
      serverConfig: this.getServerConfig(),
      indexStats,
      models,
      applicationInfo: {
        name: "MCP X++ Server",
        version: "1.0.0",
        startTime: actualStartTime.toISOString(),
        uptime: this.formatUptime(uptime)
      },
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch
      }
    };
  }

  /**
   * Get index statistics from ObjectIndexManager or from file if not loaded
   */
  private async getIndexStatistics(): Promise<IndexStatistics> {
    try {
      const stats = ObjectIndexManager.getStats();
      const indexMetadata = await this.getIndexMetadata();
      
      // If in-memory index is empty but file exists, read from file
      if (stats.totalObjects === 0 && indexMetadata.indexSize !== "0 KB") {
        const fileStats = await this.getIndexStatsFromFile();
        if (fileStats) {
          return {
            totalObjects: fileStats.totalObjects,
            objectTypes: fileStats.objectTypes,
            lastBuilt: indexMetadata.lastBuilt,
            indexSize: indexMetadata.indexSize,
            indexSizeInKB: indexMetadata.indexSizeInKB,
            indexPath: indexMetadata.indexPath
          };
        }
      }
      
      return {
        totalObjects: stats.totalObjects,
        objectTypes: stats.byType,
        lastBuilt: indexMetadata.lastBuilt,
        indexSize: indexMetadata.indexSize,
        indexSizeInKB: indexMetadata.indexSizeInKB,
        indexPath: indexMetadata.indexPath
      };
    } catch (error) {
      return {
        totalObjects: 0,
        objectTypes: {},
        lastBuilt: "Never",
        indexSize: "0 KB",
        indexSizeInKB: 0,
        indexPath: "Not available"
      };
    }
  }

  /**
   * Read index statistics directly from the SQLite database
   */
  private async getIndexStatsFromFile(): Promise<{ totalObjects: number; objectTypes: Record<string, number> } | null> {
    try {
      const { SQLiteObjectLookup } = await import('./sqlite-lookup.js');
      const lookup = new SQLiteObjectLookup();
      const initialized = lookup.initialize();
      
      if (!initialized) {
        await DiskLogger.logDebug('SQLite database not available for stats');
        return null;
      }
      
      const stats = lookup.getStats();
      if (!stats) {
        lookup.close();
        return null;
      }
      
      // Get count by type - we need to query the database for this info
      const objectTypes: Record<string, number> = {};
      
      // Common D365 object types to check
      const commonTypes = ['CLASSES', 'TABLES', 'FORMS', 'REPORTS', 'ENUMS', 'VIEWS', 'EDTS'];
      for (const type of commonTypes) {
        const objects = lookup.findObjectsByType(type);
        if (objects.length > 0) {
          objectTypes[type] = objects.length;
        }
      }
      
      lookup.close();
      
      return { 
        totalObjects: stats.totalObjects, 
        objectTypes 
      };
      
    } catch (error) {
      await DiskLogger.logDebug(`Could not read index stats from SQLite: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Get index metadata from the SQLite database
   */
  private async getIndexMetadata(): Promise<{ lastBuilt: string; indexSize: string; indexSizeInKB: number; indexPath: string }> {
    try {
      const dbPath = join(process.cwd(), 'cache', 'object-lookup.db');
      
      try {
        const stats = await fs.stat(dbPath);
        
        return {
          lastBuilt: stats.mtime.toISOString(),
          indexSize: this.formatBytes(stats.size),
          indexSizeInKB: Math.round((stats.size / 1024) * 100) / 100, // Round to 2 decimal places
          indexPath: dbPath
        };
      } catch {
        return {
          lastBuilt: "Never",
          indexSize: "0 KB",
          indexSizeInKB: 0,
          indexPath: dbPath
        };
      }
    } catch (error) {
      return {
        lastBuilt: "Error",
        indexSize: "Unknown",
        indexSizeInKB: 0,
        indexPath: "Not available"
      };
    }
  }

  /**
   * Format bytes into human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 KB';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get all available D365 F&O models in the codebase
   * Note: This is informational only - actual model operations handled by VS2022 service
   */
  public async getAvailableModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    
    if (!this.config.xppPath) {
      await DiskLogger.logDebug("XPP path not available for model enumeration (informational only)");
      return models;
    }

    try {
      // Search for model descriptor files throughout the codebase
      await this.findModelsRecursively(this.config.xppPath, models);
      
      // Sort models by name for consistent output
      models.sort((a, b) => a.name.localeCompare(b.name));
      
      return models;
    } catch (error) {
      await DiskLogger.logError(error, "getAvailableModels");
      return [];
    }
  }

  /**
   * Recursively find model descriptor files and parse model information
   */
  private async findModelsRecursively(dirPath: string, models: ModelInfo[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if this directory contains a Descriptor folder
          const descriptorPath = join(fullPath, 'Descriptor');
          try {
            const descriptorStat = await fs.stat(descriptorPath);
            if (descriptorStat.isDirectory()) {
              // Look for XML files in the Descriptor folder
              const descriptorFiles = await fs.readdir(descriptorPath);
              const xmlFiles = descriptorFiles.filter(file => file.endsWith('.xml'));
              
              for (const xmlFile of xmlFiles) {
                const modelName = xmlFile.replace('.xml', '');
                const xmlPath = join(descriptorPath, xmlFile);
                
                try {
                  const modelInfo = await this.parseModelDescriptor(xmlPath, modelName, fullPath);
                  if (modelInfo) {
                    models.push(modelInfo);
                  }
                } catch (error) {
                  await DiskLogger.logError(error, `parseModelDescriptor:${modelName}`);
                }
              }
            }
          } catch {
            // Directory doesn't have Descriptor folder, continue searching recursively
            await this.findModelsRecursively(fullPath, models);
          }
        }
      }
    } catch (error) {
      // Ignore directories we can't read
    }
  }

  /**
   * Parse a model descriptor XML file and extract model information
   */
  private async parseModelDescriptor(xmlPath: string, modelName: string, modelRoot: string): Promise<ModelInfo | null> {
    try {
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');
      
      // Simple XML parsing - extract key elements
      const displayNameMatch = xmlContent.match(/<DisplayName>([^<]+)<\/DisplayName>/);
      const publisherMatch = xmlContent.match(/<Publisher>([^<]+)<\/Publisher>/);
      const idMatch = xmlContent.match(/<Id>([^<]+)<\/Id>/);
      const layerMatch = xmlContent.match(/<Layer>([^<]+)<\/Layer>/);
      const descriptionMatch = xmlContent.match(/<Description>([^<]*)<\/Description>/);
      
      // Extract version information
      const versionMajorMatch = xmlContent.match(/<VersionMajor>([^<]+)<\/VersionMajor>/);
      const versionMinorMatch = xmlContent.match(/<VersionMinor>([^<]+)<\/VersionMinor>/);
      const versionBuildMatch = xmlContent.match(/<VersionBuild>([^<]+)<\/VersionBuild>/);
      const versionRevisionMatch = xmlContent.match(/<VersionRevision>([^<]+)<\/VersionRevision>/);
      
      // Extract dependencies
      const dependencies: string[] = [];
      const moduleRefsMatch = xmlContent.match(/<ModuleReferences[^>]*>(.*?)<\/ModuleReferences>/s);
      if (moduleRefsMatch) {
        const stringMatches = moduleRefsMatch[1].match(/<d2p1:string>([^<]+)<\/d2p1:string>/g);
        if (stringMatches) {
          for (const match of stringMatches) {
            const depMatch = match.match(/<d2p1:string>([^<]+)<\/d2p1:string>/);
            if (depMatch) {
              dependencies.push(depMatch[1]);
            }
          }
        }
      }
      
      // Build version string
      const major = versionMajorMatch?.[1] || '1';
      const minor = versionMinorMatch?.[1] || '0';
      const build = versionBuildMatch?.[1] || '0';
      const revision = versionRevisionMatch?.[1] || '0';
      const version = `${major}.${minor}.${build}.${revision}`;
      
      // Check for source files and build artifacts
      const parentDir = join(modelRoot, '..');
      const hasSource = await this.checkForSourceFiles(parentDir, modelName);
      const hasBuildArtifacts = await this.checkForBuildArtifacts(modelRoot);
      
      return {
        name: modelName,
        displayName: displayNameMatch?.[1] || modelName,
        publisher: publisherMatch?.[1] || 'Unknown',
        version,
        layer: layerMatch?.[1] || 'Unknown',
        id: idMatch?.[1] || 'Unknown',
        dependencies,
        description: descriptionMatch?.[1] || '',
        descriptorPath: xmlPath,
        hasSource,
        hasBuildArtifacts
      };
    } catch (error) {
      await DiskLogger.logError(error, `parseModelDescriptor:${modelName}`);
      return null;
    }
  }

  /**
   * Check if model has source files in XppSource folder
   */
  private async checkForSourceFiles(containerDir: string, modelName: string): Promise<boolean> {
    try {
      const xppSourcePath = join(containerDir, 'XppSource', modelName);
      const stat = await fs.stat(xppSourcePath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(xppSourcePath);
        return files.some(file => file.endsWith('.xpp'));
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return false;
  }

  /**
   * Check if model has build artifacts
   */
  private async checkForBuildArtifacts(modelRoot: string): Promise<boolean> {
    try {
      // Check for common build artifacts
      const buildFiles = ['BuildProjectResult.xml', 'BuildProjectResult.log'];
      for (const buildFile of buildFiles) {
        try {
          await fs.stat(join(modelRoot, buildFile));
          return true;
        } catch {
          // File doesn't exist, continue checking
        }
      }
      
      // Check for bin directory
      try {
        const binStat = await fs.stat(join(modelRoot, 'bin'));
        return binStat.isDirectory();
      } catch {
        // Bin directory doesn't exist
      }
    } catch {
      // Error checking for build artifacts
    }
    return false;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const AppConfig = new AppConfigManager();
