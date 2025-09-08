import { promises as fs } from "fs";
import { join, extname, relative } from "path";
import { ObjectIndexManager } from "./object-index.js";
import { CacheManager, searchCache } from "./cache.js";
import { getPackagePriority } from "./utils.js";
import { XPP_EXTENSIONS, MAX_SEARCH_RESULTS, MAX_FILE_SIZE } from "./config.js";

/**
 * Search manager for X++ codebase content and object lookups
 */
export class SearchManager {
  static async search(
    searchTerm: string, 
    searchPath: string = "", 
    extensions: string[] = [],
    maxResults: number = MAX_SEARCH_RESULTS,
    priorityMode: 'recent' | 'frequent' | 'size' = 'recent'
  ): Promise<any[]> {
    
    const cacheKey = `search_${searchTerm}_${searchPath}_${extensions.join(',')}_${maxResults}`;
    const cached = CacheManager.get(searchCache, cacheKey);
    if (cached) return cached;

    const results: any[] = [];
    const xppCodebasePath = process.env.XPP_CODEBASE_PATH || "";
    const targetPath = searchPath ? join(xppCodebasePath, searchPath) : xppCodebasePath;
    
    // First, try to find objects by name using the index
    const objectResults = ObjectIndexManager.findObjects(searchTerm);
    for (const obj of objectResults.slice(0, maxResults)) {
      results.push({
        type: 'object',
        name: obj.name,
        objectType: obj.type,
        path: obj.path,
        package: obj.model,  // ObjectLocation uses 'model' instead of 'package'
        priority: getPackagePriority(obj.model)  // ObjectLocation uses 'model' instead of 'package'
      });
    }

    // Only search file contents if we have very few or no index results
    // This avoids the expensive directory traversal when we have good matches
    if (results.length < 3) {
      const fileResults = await this.searchInFiles(targetPath, searchTerm, extensions, maxResults - results.length);
      results.push(...fileResults);
    }

    // Sort by priority and relevance
    results.sort((a, b) => {
      if (a.priority !== b.priority) return (b.priority || 0) - (a.priority || 0);
      if (a.type === 'object' && b.type !== 'object') return -1;
      if (b.type === 'object' && a.type !== 'object') return 1;
      return 0;
    });

    const finalResults = results.slice(0, maxResults);
    CacheManager.set(searchCache, cacheKey, finalResults);
    return finalResults;
  }

  private static async searchInFiles(
    basePath: string, 
    searchTerm: string, 
    extensions: string[], 
    maxResults: number
  ): Promise<any[]> {
    const results: any[] = [];
    const searchExtensions = extensions.length > 0 ? extensions : XPP_EXTENSIONS;
    
    try {
      await this.searchDirectory(basePath, basePath, searchTerm, searchExtensions, results, maxResults);
    } catch (error) {
      console.error("Search error:", error);
    }

    return results;
  }

  private static async searchDirectory(
    dirPath: string,
    basePath: string,
    searchTerm: string,
    extensions: string[],
    results: any[],
    maxResults: number
  ): Promise<void> {
    if (results.length >= maxResults) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Process files first (for faster results)
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        
        if (entry.isFile()) {
          const filePath = join(dirPath, entry.name);
          const ext = extname(entry.name).toLowerCase();
          
          if (extensions.includes(ext)) {
            const fileResults = await this.searchInFile(filePath, searchTerm, basePath);
            results.push(...fileResults);
          }
        }
      }

      // Then process directories
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        
        if (entry.isDirectory()) {
          const fullPath = join(dirPath, entry.name);
          await this.searchDirectory(fullPath, basePath, searchTerm, extensions, results, maxResults);
        }
      }
    } catch (error) {
      // Skip directories we can't access
    }
  }

  private static async searchInFile(filePath: string, searchTerm: string, basePath: string): Promise<any[]> {
    const results: any[] = [];
    
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > MAX_FILE_SIZE) return results;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const lowerSearchTerm = searchTerm.toLowerCase();

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerSearchTerm)) {
          const context = this.getContext(lines, i);
          
          results.push({
            type: 'file',
            path: relative(basePath, filePath),
            line: i + 1,
            content: lines[i].trim(),
            context: {
              before: context.before,
              after: context.after
            },
            priority: getPackagePriority(filePath)
          });
        }
      }
    } catch (error) {
      // Skip files we can't read
    }

    return results;
  }

  private static getContext(lines: string[], lineIndex: number): { before: string[], after: string[] } {
    const contextSize = 2;
    const before = lines.slice(Math.max(0, lineIndex - contextSize), lineIndex);
    const after = lines.slice(lineIndex + 1, Math.min(lines.length, lineIndex + 1 + contextSize));
    
    return { before, after };
  }
}
