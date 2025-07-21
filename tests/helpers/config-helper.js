import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Shared configuration helper for test files
 */

const currentModulePath = fileURLToPath(import.meta.url);
const projectRoot = join(dirname(currentModulePath), '..', '..');

/**
 * Read D365 F&O path from MCP configuration
 */
export async function getD365PathFromConfig() {
  try {
    const mcpConfigPath = join(projectRoot, '.vscode', 'mcp.json');
    const configContent = await fs.readFile(mcpConfigPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    // Extract XPP_CODEBASE_PATH from the mcp-xpp-server configuration
    const serverConfig = config.servers?.['mcp-xpp-server'];
    if (serverConfig?.env?.XPP_CODEBASE_PATH) {
      return serverConfig.env.XPP_CODEBASE_PATH;
    }
    
    console.warn('⚠️ XPP_CODEBASE_PATH not found in MCP configuration');
    return null;
  } catch (error) {
    console.warn('⚠️ Could not read MCP configuration:', error.message);
    return null;
  }
}

/**
 * Check if D365 F&O installation is available at the configured path
 */
export async function checkD365Availability() {
  const d365Path = await getD365PathFromConfig();
  
  if (!d365Path) {
    return { available: false, path: null, reason: 'Path not configured' };
  }

  try {
    await fs.access(d365Path);
    return { available: true, path: d365Path, reason: null };
  } catch (error) {
    return { available: false, path: d365Path, reason: `Path not accessible: ${error.message}` };
  }
}
