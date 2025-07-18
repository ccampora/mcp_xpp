import { extname } from "path";
import { XPP_EXTENSIONS, PACKAGE_PRIORITY, XPP_PRIORITY_EXTENSIONS } from "./config.js";

/**
 * Enhanced helper function to check if a file has an X++ related extension
 */
export function isXppRelatedFile(filepath: string): boolean {
  const ext = extname(filepath).toLowerCase();
  return XPP_EXTENSIONS.includes(ext);
}

/**
 * File priority helper
 */
export function getFilePriority(filepath: string): number {
  const ext = extname(filepath).toLowerCase();
  if (XPP_PRIORITY_EXTENSIONS.high.includes(ext)) return 3;
  if (XPP_PRIORITY_EXTENSIONS.medium.includes(ext)) return 2;
  if (XPP_PRIORITY_EXTENSIONS.low.includes(ext)) return 1;
  return 0;
}

/**
 * Package priority helper
 */
export function getPackagePriority(packagePath: string): number {
  for (let i = 0; i < PACKAGE_PRIORITY.length; i++) {
    if (packagePath.includes(PACKAGE_PRIORITY[i])) {
      return PACKAGE_PRIORITY.length - i;
    }
  }
  return 0;
}
