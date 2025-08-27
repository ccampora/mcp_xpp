#!/usr/bin/env node

// =============================================================================
// IMPORTS
// =============================================================================
import { pathToFileURL } from "url";
import { realpathSync } from "fs";

// Import modules
import { DiskLogger } from "./modules/logger.js";
import { setXppCodebasePath, getXppCodebasePath } from "./modules/config.js";
import { AppConfig } from "./modules/app-config.js";
import { ObjectIndexManager } from "./modules/object-index.js";
import { ServerManager } from "./modules/server-manager.js";

// =============================================================================
// SERVER EXPORTS
// =============================================================================

// Global server manager instance
let serverManager: ServerManager | null = null;

/**
 * Get the server start time
 */
export function getServerStartTime(): Date | null {
  return serverManager?.getServerStartTime() || null;
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function runServer() {
  try {
    // Initialize configuration system
    await AppConfig.initialize();
    
    // Set XPP codebase path for backward compatibility with existing code
    const xppPath = AppConfig.getXppPath();
    if (xppPath) {
      setXppCodebasePath(xppPath);
      console.error(`XPP codebase path configured: ${xppPath}`);
      
      const metadataFolder = AppConfig.getXppMetadataFolder();
      if (metadataFolder) {
        console.error(`XPP metadata folder configured: ${metadataFolder}`);
      }

      const vs2022ExtensionPath = AppConfig.getVS2022ExtensionPath();
      if (vs2022ExtensionPath) {
        console.error(`VS2022 extension path configured: ${vs2022ExtensionPath}`);
      }
    }

    // Initialize ObjectIndexManager if path is available
    if (getXppCodebasePath()) {
      ObjectIndexManager.setIndexPath(getXppCodebasePath());
    }

    await DiskLogger.logStartup();
    
    // Load index if XPP path is set
    if (getXppCodebasePath()) {
      try {
        await ObjectIndexManager.loadIndex();
        await DiskLogger.logDebug(`Loaded object index for: ${getXppCodebasePath()}`);
      } catch (error) {
        await DiskLogger.logDebug(`Could not load existing index: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Initialize and start the server
    serverManager = new ServerManager();
    await serverManager.initialize();
    await serverManager.start();
    
  } catch (error) {
    await DiskLogger.logError(error, "startup");
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Only start the server if this module is being run directly (not imported)
if (process.argv[1]) {
  try {
    const resolvedPath = realpathSync(process.argv[1]);
    if (import.meta.url === pathToFileURL(resolvedPath).href) {
      runServer();
    }
  } catch (error) {
    // Fallback to basic check if realpath fails
    if (import.meta.url === pathToFileURL(process.argv[1]).href) {
      runServer();
    }
  }
}
