// =============================================================================
// VS2022 EXTENSION CONFIGURATION
// =============================================================================
// Helper module to access VS2022 extension path configuration

import { AppConfig } from "./app-config.js";
import { join } from "path";
import { promises as fs } from "fs";
import { existsSync } from "fs";

/**
 * Auto-detect VS2022 D365 extension GUID by scanning the Extensions directory
 */
export async function autoDetectVS2022ExtensionPath(): Promise<string | undefined> {
  const commonPaths = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\Extensions",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\Extensions",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\Extensions",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\Extensions",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\Extensions",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\Extensions"
  ];

  for (const basePath of commonPaths) {
    if (!existsSync(basePath)) {
      continue;
    }

    try {
      const directories = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const dir of directories) {
        if (!dir.isDirectory()) {
          continue;
        }

        // Check if this directory contains D365 extension markers
        const extensionPath = join(basePath, dir.name);
        const d365TemplatesPath = join(extensionPath, "Templates", "ProjectItems", "FinanceOperations", "Dynamics 365 Items");
        
        if (existsSync(d365TemplatesPath)) {
          // Verify it contains D365 template structure (directories with ZIP files)
          try {
            const templateDirs = await fs.readdir(d365TemplatesPath, { withFileTypes: true });
            
            for (const dir of templateDirs) {
              if (dir.isDirectory()) {
                // Check if this directory contains ZIP template files
                try {
                  const dirPath = join(d365TemplatesPath, dir.name);
                  const files = await fs.readdir(dirPath);
                  const hasZipFiles = files.some(file => file.endsWith('.zip'));
                  
                  if (hasZipFiles) {
                    return extensionPath;
                  }
                } catch {
                  // Continue checking other directories
                  continue;
                }
              }
            }
          } catch {
            // Continue searching if we can't read this directory
            continue;
          }
        }
      }
    } catch {
      // Continue with next path if we can't read this directory
      continue;
    }
  }

  return undefined;
}

/**
 * Get VS2022 extension path with auto-detection fallback
 */
export async function getVS2022ExtensionPathWithAutoDetect(): Promise<string | undefined> {
  // First try the configured path
  const configuredPath = getVS2022ExtensionPath();
  if (configuredPath && existsSync(configuredPath)) {
    return configuredPath;
  }

  // If not configured or doesn't exist, try auto-detection
  return await autoDetectVS2022ExtensionPath();
}

/**
 * Get the configured VS2022 extension path
 */
export function getVS2022ExtensionPath(): string | undefined {
  return AppConfig.getVS2022ExtensionPath();
}

/**
 * Get the full path to the VS2022 templates directory with auto-detection
 */
export async function getVS2022TemplatesPath(): Promise<string | undefined> {
  const extensionPath = await getVS2022ExtensionPathWithAutoDetect();
  if (!extensionPath) {
    return undefined;
  }
  
  return join(extensionPath, "Templates", "ProjectItems", "FinanceOperations", "Dynamics 365 Items");
}

/**
 * Get the full path to the VS2022 templates directory (synchronous - uses configured path only)
 */
export function getVS2022TemplatesPathSync(): string | undefined {
  const extensionPath = getVS2022ExtensionPath();
  if (!extensionPath) {
    return undefined;
  }
  
  return join(extensionPath, "Templates", "ProjectItems", "FinanceOperations", "Dynamics 365 Items");
}

/**
 * Get the full path to a VS2022 template ZIP file
 * @param templateName - Name of the template (e.g., "Class", "Table", "Form")
 * @returns Full path to the template ZIP file if VS2022 path is configured
 */
export async function getVS2022TemplatePath(templateName: string): Promise<string | undefined> {
  const templatesPath = await getVS2022TemplatesPath();
  if (!templatesPath) {
    return undefined;
  }
  
  return join(templatesPath, `${templateName}.zip`);
}

/**
 * Get the path to extracted template icon
 * @param templateName - Name of the template
 * @param iconFileName - Name of the icon file (with extension)
 * @returns Path to the icon file if available
 */
export async function getVS2022IconPath(templateName: string, iconFileName: string): Promise<string | undefined> {
  const templatesPath = await getVS2022TemplatesPath();
  if (!templatesPath) {
    return undefined;
  }
  
  // Icons are typically in the same directory structure as templates
  return join(templatesPath, templateName, iconFileName);
}

/**
 * Check if VS2022 extension path is configured and accessible
 */
export async function isVS2022ExtensionAvailable(): Promise<boolean> {
  const templatesPath = await getVS2022TemplatesPath();
  if (!templatesPath) {
    return false;
  }
  
  try {
    await fs.access(templatesPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available VS2022 template names by scanning the extension directory
 */
export async function getAvailableVS2022Templates(): Promise<string[]> {
  const templatesPath = await getVS2022TemplatesPath();
  if (!templatesPath) {
    return [];
  }
  
  try {
    const files = await fs.readdir(templatesPath, { recursive: true });
    return files
      .filter(file => file.endsWith('.zip'))
      .map(file => file.replace('.zip', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * VS2022 Template Categories mapping for enhanced organization
 */
export const VS2022_TEMPLATE_CATEGORIES = {
  'Analytics': ['AggregateDataEntity', 'AggregateDimension', 'AggregateMeasurement', 'KPI'],
  'Business Process and Workflow': ['WorkflowApproval', 'WorkflowAutomatedTask', 'WorkflowCategory', 'WorkflowTask', 'WorkflowType'],
  'Code': ['Class', 'Interface', 'Macro', 'RunnableClass', 'TestClass'],
  'Configuration': ['ConfigKey', 'ConfigKeyGroup', 'LicenseCode'],
  'Data Model': ['CompositeDataEntityView', 'DataEntityView', 'Map', 'Query', 'Table', 'TableCollection', 'View'],
  'Data Types': ['BaseEnum', 'EdtString', 'EdtInt', 'EdtReal'],
  'Labels And Resources': ['LabelFiles', 'Resource', 'PCFControlResource'],
  'Reports': ['Report', 'ReportEmbeddedImage'],
  'Security': ['SecurityDuty', 'SecurityPolicy', 'SecurityPrivilege', 'SecurityRole'],
  'Services': ['Service', 'ServiceGroup'],
  'User Interface': ['Form', 'Menu', 'MenuItemAction', 'MenuItemDisplay', 'MenuItemOutput', 'Tile']
};

/**
 * Get the category for a given template name
 */
export function getTemplateCategory(templateName: string): string | undefined {
  for (const [category, templates] of Object.entries(VS2022_TEMPLATE_CATEGORIES)) {
    if ((templates as string[]).includes(templateName)) {
      return category;
    }
  }
  return undefined;
}
