import { promises as fs } from "fs";
import { extname, relative } from "path";
import { MAX_FILE_SIZE } from "./config.js";

/**
 * Helper function to safely read a file with size limits
 */
export async function safeReadFile(filepath: string): Promise<string> {
  try {
    const stats = await fs.stat(filepath);
    
    if (stats.size > MAX_FILE_SIZE) {
      return `File too large (${Math.round(stats.size / (1024 * 1024) * 100) / 100}MB). Maximum supported size is ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.`;
    }
    
    const content = await fs.readFile(filepath, "utf-8");
    return content;
  } catch (error) {
    if (error instanceof Error) {
      return `Error reading file: ${error.message}`;
    }
    return "Unknown error occurred while reading file";
  }
}

/**
 * Helper function to get directory listing with file information
 */
export async function getDirectoryListing(dirPath: string, showHidden: boolean = false): Promise<any[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: any[] = [];
    
    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) {
        continue;
      }
      
      const fullPath = `${dirPath}/${entry.name}`;
      const isDirectory = entry.isDirectory();
      
      let size = 0;
      let lastModified = '';
      
      try {
        const stats = await fs.stat(fullPath);
        size = stats.size;
        lastModified = stats.mtime.toISOString();
      } catch (error) {
        // Could not get stats, continue without them
      }
      
      results.push({
        name: entry.name,
        type: isDirectory ? 'directory' : 'file',
        size: isDirectory ? 0 : size,
        lastModified,
        extension: isDirectory ? '' : extname(entry.name),
        path: fullPath
      });
    }
    
    // Sort: directories first, then files, both alphabetically
    results.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    
    return results;
  } catch (error) {
    throw new Error(`Could not read directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Helper function to search for files containing specific text
 */
export async function searchInFiles(searchTerm: string, searchPath: string, fileExtensions: string[] = []): Promise<any[]> {
  const results: any[] = [];
  
  async function searchDirectory(dirPath: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await searchDirectory(`${dirPath}/${entry.name}`);
        } else if (entry.isFile()) {
          const filePath = `${dirPath}/${entry.name}`;
          const ext = extname(entry.name).toLowerCase();
          
          // Check if file extension matches (if extensions specified)
          if (fileExtensions.length === 0 || fileExtensions.includes(ext)) {
            try {
              const stats = await fs.stat(filePath);
              if (stats.size <= MAX_FILE_SIZE) {
                const content = await fs.readFile(filePath, 'utf-8');
                
                if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
                  results.push({
                    path: relative(searchPath, filePath),
                    name: entry.name,
                    size: stats.size,
                    lastModified: stats.mtime.toISOString()
                  });
                }
              }
            } catch (error) {
              // Skip files we can't read
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }
  
  await searchDirectory(searchPath);
  return results;
}
