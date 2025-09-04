#!/usr/bin/env node

/**
 * MCP X++ Server - Template-First Architecture
 * 
 * FOUNDATIONAL DESIGN PRINCIPLE (August 29, 2025):
 * 
 * This server follows TEMPLATE-FIRST ARCHITECTURE:
 * - Objects are essentially STATIC throughout VS2022 extension lifecycle
 * - Object creation uses TEMPLATES (<100ms) NOT API calls (2000ms+)
 * - Single Source of Truth: config/object_descriptions/{ObjectType}_description.json
 * - PowerShell for synchronization ONLY (rare, on-demand)
 * - Self-sufficient: Works offline without external APIs
 * 
 * Reference: misc/template-first-architecture-design.md
 * 
 * FORBIDDEN: Runtime Microsoft API calls for object creation
 * REQUIRED: Template-based generation with <100ms performance
 */

// =============================================================================
// IMPORTS
// =============================================================================
import { pathToFileURL } from "url";
import { realpathSync } from "fs";

// Import modules
import { DiskLogger } from "./modules/logger.js";
import { AppConfig } from "./modules/app-config.js";
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

/**
 * Parse command line arguments for transport configuration
 */
function parseTransportConfig(): { stdio: boolean; http?: { enabled: boolean; port: number; host?: string } } {
  const args = process.argv.slice(2);
  let config: any = { stdio: true };

  // Check for HTTP transport arguments
  const httpPortIndex = args.findIndex(arg => arg === '--http-port');
  const httpHostIndex = args.findIndex(arg => arg === '--http-host');
  const stdioDisabledIndex = args.findIndex(arg => arg === '--no-stdio');

  if (httpPortIndex !== -1 && httpPortIndex + 1 < args.length) {
    const port = parseInt(args[httpPortIndex + 1], 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      config.http = {
        enabled: true,
        port: port,
        host: '0.0.0.0'
      };

      // Check for custom host
      if (httpHostIndex !== -1 && httpHostIndex + 1 < args.length) {
        config.http.host = args[httpHostIndex + 1];
      }
    }
  }

  // Check if STDIO should be disabled
  if (stdioDisabledIndex !== -1) {
    config.stdio = false;
  }

  return config;
}

async function runServer() {
  try {
    // Parse transport configuration from command line arguments
    const transportConfig = parseTransportConfig();
    
    console.error(`Starting MCP X++ Server...`);
    console.error(`📡 Transport Configuration:`);
    console.error(`   STDIO: ${transportConfig.stdio ? 'enabled' : 'disabled'}`);
    if (transportConfig.http?.enabled) {
      console.error(`   HTTP: enabled on ${transportConfig.http.host}:${transportConfig.http.port}`);
    } else {
      console.error(`   HTTP: disabled`);
    }

    // Initialize configuration system
    await AppConfig.initialize();
    
    // Get paths from configuration
    const xppPath = AppConfig.getXppPath();
    const metadataFolder = AppConfig.getXppMetadataFolder();
    const vs2022ExtensionPath = AppConfig.getVS2022ExtensionPath();
    
    if (xppPath) {
      console.error(`XPP codebase path configured: ${xppPath}`);
      
      if (metadataFolder) {
        console.error(`XPP metadata folder configured: ${metadataFolder}`);
      }

      if (vs2022ExtensionPath) {
        console.error(`VS2022 extension path configured: ${vs2022ExtensionPath}`);
      }
    }

    await DiskLogger.logStartup();
    
    // SQLite object index is initialized on-demand when tools are called
    if (xppPath) {
      await DiskLogger.logDebug(`Using SQLite object index for: ${xppPath}`);
    }
    
    // Initialize and start the server
    serverManager = new ServerManager(transportConfig);
    await serverManager.initialize();
    await serverManager.start();
    
    // Log transport status
    const status = serverManager.getTransportStatus();
    console.error(`MCP X++ Server running successfully`);
    if (status) {
      console.error(`   Transport Status: STDIO=${status.stdio}, HTTP=${status.http}${status.httpPort ? ` (port ${status.httpPort})` : ''}`);
    }
    
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
