// =============================================================================
// APPLICATION CONFIGURATION MANAGER
// =============================================================================
// Centralized configuration management for the MCP X++ Server
// Handles command line arguments, directory creation, and configuration access

import { promises as fs } from "fs";
import { join } from "path";
import { DiskLogger } from "./logger.js";
import { ObjectIndexManager } from "./object-index.js";

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

export interface ApplicationConfiguration {
  serverConfig: ServerConfiguration;
  indexStats: IndexStatistics;
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

    // Validate required configuration
    if (!this.config.xppPath) {
      throw new Error("XPP codebase path not provided. Use --xpp-path argument to specify the path.");
    }

    // Create XPP metadata folder if specified and doesn't exist
    if (this.config.xppMetadataFolder) {
      await this.ensureDirectoryExists(this.config.xppMetadataFolder);
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
    
    // Get server start time from the main server module
    const getServerStartTimeFn = await importServerStartTime();
    const actualStartTime = getServerStartTimeFn?.() || this.startTime;
    const uptime = Date.now() - actualStartTime.getTime();

    return {
      serverConfig: this.getServerConfig(),
      indexStats,
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
   * Read index statistics directly from the index file
   */
  private async getIndexStatsFromFile(): Promise<{ totalObjects: number; objectTypes: Record<string, number> } | null> {
    try {
      const indexPath = join(process.cwd(), 'cache', 'mcp-index.json');
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const parsed = JSON.parse(indexData);
      
      if (parsed.objects) {
        const objects = Object.values(parsed.objects) as any[];
        const totalObjects = objects.length;
        const objectTypes: Record<string, number> = {};
        
        // Count objects by type
        for (const obj of objects) {
          if (obj.type) {
            objectTypes[obj.type] = (objectTypes[obj.type] || 0) + 1;
          }
        }
        
        return { totalObjects, objectTypes };
      }
      
      return null;
    } catch (error) {
      await DiskLogger.logDebug(`Could not read index stats from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Get index metadata from the index file
   */
  private async getIndexMetadata(): Promise<{ lastBuilt: string; indexSize: string; indexSizeInKB: number; indexPath: string }> {
    try {
      const indexPath = join(process.cwd(), 'cache', 'mcp-index.json');
      
      try {
        const stats = await fs.stat(indexPath);
        const indexData = await fs.readFile(indexPath, 'utf-8');
        const parsed = JSON.parse(indexData);
        
        return {
          lastBuilt: parsed.lastUpdated ? new Date(parsed.lastUpdated).toISOString() : "Unknown",
          indexSize: this.formatBytes(stats.size),
          indexSizeInKB: Math.round((stats.size / 1024) * 100) / 100, // Round to 2 decimal places
          indexPath: indexPath
        };
      } catch {
        return {
          lastBuilt: "Never",
          indexSize: "0 KB",
          indexSizeInKB: 0,
          indexPath: indexPath
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
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const AppConfig = new AppConfigManager();
