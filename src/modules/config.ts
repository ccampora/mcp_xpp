// Enhanced X++ file extensions with AOT structure
export const XPP_EXTENSIONS = [
  ".xpp",      // X++ source files
  ".xml",      // Metadata files (tables, forms, reports, etc.)
  ".rnrproj",  // Project files
  ".axproj",   // AX project files
  ".txt",      // Documentation files
  ".md",       // Markdown documentation
  ".json",     // Configuration files
  ".axpp",     // Additional X++ files
  ".designer.cs", // Form/Report designers
];

// Package priority for intelligent searching
export const PACKAGE_PRIORITY = [
  "YourCustomPackage", // User customizations (highest priority)
  "ApplicationSuite",  // Core business logic
  "ApplicationPlatform", // Framework
  "ApplicationFoundation", // Base classes
  "Directory", // Directory integration
  "ApplicationCommon", // Common utilities
  "Test" // Test packages (lowest priority)
];

// Enhanced X++ file extensions with priority
export const XPP_PRIORITY_EXTENSIONS = {
  high: [".xpp", ".xml"],        // Most important for code analysis
  medium: [".rnrproj", ".axproj"], // Project files
  low: [".txt", ".md", ".json", ".designer.cs"] // Documentation and misc
};

// Performance Configuration
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // Increased to 2MB for larger X++ files
export const MAX_FILES_LIMIT = 500; // Increased limit
export const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache TTL
export const MAX_SEARCH_RESULTS = 100;
export const MAX_WORKERS = 4;

// Configuration for X++ codebase path
export let xppCodebasePath: string = "";

export function setXppCodebasePath(path: string): void {
  xppCodebasePath = path;
}

export function getXppCodebasePath(): string {
  return xppCodebasePath;
}
