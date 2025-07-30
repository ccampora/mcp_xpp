import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration file paths - centralized constants
export const CONFIG_PATHS = {
  AOT_STRUCTURE: join(__dirname, '..', 'config', 'aot-structure.json'),
  D365_MODEL_CONFIG: join(__dirname, '..', 'config', 'd365-model-config.json'),
  D365_OBJECT_TEMPLATES: join(__dirname, '..', 'config', 'd365-object-templates.json')
} as const;

// Configuration cache for improved performance
class ConfigurationCache {
  private cache = new Map<string, any>();
  private loadPromises = new Map<string, Promise<any>>();

  async loadConfig<T = any>(filePath: string): Promise<T> {
    // Return cached result if available
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath) as T;
    }

    // Return ongoing promise if file is being loaded
    if (this.loadPromises.has(filePath)) {
      return this.loadPromises.get(filePath) as Promise<T>;
    }

    // Start loading the file
    const loadPromise = this.loadConfigFile<T>(filePath);
    this.loadPromises.set(filePath, loadPromise);

    try {
      const result = await loadPromise;
      this.cache.set(filePath, result);
      return result;
    } finally {
      this.loadPromises.delete(filePath);
    }
  }

  private async loadConfigFile<T = any>(filePath: string): Promise<T> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      throw new Error(`Failed to load configuration from ${filePath}: ${error}`);
    }
  }

  clearCache(filePath?: string): void {
    if (filePath) {
      this.cache.delete(filePath);
      this.loadPromises.delete(filePath);
    } else {
      this.cache.clear();
      this.loadPromises.clear();
    }
  }

  getCacheStatus(): { totalCached: number; currentlyLoading: number } {
    return {
      totalCached: this.cache.size,
      currentlyLoading: this.loadPromises.size
    };
  }
}

// Singleton configuration loader instance
export const ConfigurationLoader = new ConfigurationCache();

// Convenience functions for specific config files
export const loadAOTStructure = <T = any>() => ConfigurationLoader.loadConfig<T>(CONFIG_PATHS.AOT_STRUCTURE);
export const loadD365ModelConfig = <T = any>() => ConfigurationLoader.loadConfig<T>(CONFIG_PATHS.D365_MODEL_CONFIG);
export const loadD365ObjectTemplates = <T = any>() => ConfigurationLoader.loadConfig<T>(CONFIG_PATHS.D365_OBJECT_TEMPLATES);
