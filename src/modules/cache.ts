import { CACHE_TTL } from "./config.js";

// Multi-level cache system for performance
const xppObjectCache = new Map<string, any>();
const fileSystemCache = new Map<string, any>();
const objectIndexCache = new Map<string, any>();
const searchCache = new Map<string, any>();
const metadataCache = new Map<string, any>();
const directoryCache = new Map<string, string[]>();

// Cache timestamps for TTL management
const cacheTimestamps = new Map<string, number>();

/**
 * Cache management utilities
 */
export class CacheManager {
  static isExpired(key: string): boolean {
    const timestamp = cacheTimestamps.get(key);
    if (!timestamp) return true;
    return Date.now() - timestamp > CACHE_TTL;
  }

  static set(cache: Map<string, any>, key: string, value: any): void {
    cache.set(key, value);
    cacheTimestamps.set(key, Date.now());
  }

  static get(cache: Map<string, any>, key: string): any | null {
    if (this.isExpired(key)) {
      cache.delete(key);
      cacheTimestamps.delete(key);
      return null;
    }
    return cache.get(key) || null;
  }

  static clear(): void {
    xppObjectCache.clear();
    fileSystemCache.clear();
    objectIndexCache.clear();
    searchCache.clear();
    metadataCache.clear();
    directoryCache.clear();
    cacheTimestamps.clear();
  }
}

// Export cache instances for use in other modules
export {
  xppObjectCache,
  fileSystemCache,
  objectIndexCache,
  searchCache,
  metadataCache,
  directoryCache
};
