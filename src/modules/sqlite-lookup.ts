/**
 * SQLite Object Lookup Module
 * 
 * Fast, efficient object location lookups using SQLite database
 * Replaces the 55MB JSON cache with sub-millisecond queries
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';

export interface ObjectLocation {
    name: string;
    path: string;
    package: string;
    type: string;
    size?: number;
    lastModified?: number;
}

export interface LookupStats {
    totalObjects: number;
    uniqueNames: number;
    nameConflicts: number;
    packages: number;
    types: number;
}

export interface AOTMetadata {
    generatedAt: string;
    totalTypes: number;
    categorizedTypes: number;
    uncategorizedTypes: number;
    categorizationRate: string;
    sourceAssembly: string;
    generationTimeMs: number;
    categories: Record<string, any>;
}

export class SQLiteObjectLookup {
    private db: Database.Database | null = null;
    private prepared: {
        findByName?: Database.Statement;
        findByNameExact?: Database.Statement;
        findByPackage?: Database.Statement;
        findByType?: Database.Statement;
        findByPackageAndType?: Database.Statement;
        findByNameAndPackage?: Database.Statement;
        getStats?: Database.Statement;
        searchByNamePattern?: Database.Statement;
    } = {};

    constructor(private dbPath: string = 'cache/object-lookup.db') {}

    /**
     * Initialize the database connection and prepare statements
     */
    public initialize(): boolean {
        try {
            if (!existsSync(this.dbPath)) {
                console.error(`❌ SQLite database not found: ${this.dbPath}`);
                console.log('💡 Run "node misc/migrate-to-sqlite.mjs" to create the database');
                return false;
            }

            this.db = new Database(this.dbPath, { readonly: true });
            
            // Optimize for reading
            this.db.pragma('cache_size = 10000');
            this.db.pragma('temp_store = MEMORY');
            
            // Prepare commonly used statements
            this.prepareStatements();
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize SQLite lookup:', error);
            return false;
        }
    }

    /**
     * Prepare all SQL statements for optimal performance
     */
    private prepareStatements(): void {
        if (!this.db) return;

        this.prepared = {
            // Find object by name (may return multiple if conflicts exist)
            findByName: this.db.prepare(`
                SELECT name, path, package, type, size, lastModified 
                FROM objects 
                WHERE name = ? 
                ORDER BY package, type
            `),

            // Find unique object by name and package
            findByNameAndPackage: this.db.prepare(`
                SELECT name, path, package, type, size, lastModified 
                FROM objects 
                WHERE name = ? AND package = ?
                LIMIT 1
            `),

            // Find all objects in a package
            findByPackage: this.db.prepare(`
                SELECT name, path, package, type, size, lastModified 
                FROM objects 
                WHERE package = ? 
                ORDER BY type, name
            `),

            // Find all objects of a specific type
            findByType: this.db.prepare(`
                SELECT name, path, package, type, size, lastModified 
                FROM objects 
                WHERE type = ? 
                ORDER BY package, name
            `),

            // Find objects by package and type
            findByPackageAndType: this.db.prepare(`
                SELECT name, path, package, type, size, lastModified 
                FROM objects 
                WHERE package = ? AND type = ? 
                ORDER BY name
            `),

            // Pattern search for object names
            searchByNamePattern: this.db.prepare(`
                SELECT name, path, package, type, size, lastModified 
                FROM objects 
                WHERE name LIKE ? 
                ORDER BY 
                    CASE WHEN name = ? THEN 0 ELSE 1 END,
                    LENGTH(name),
                    name
                LIMIT 50
            `),

            // Get database statistics
            getStats: this.db.prepare(`
                SELECT 
                    COUNT(*) as totalObjects,
                    COUNT(DISTINCT name) as uniqueNames,
                    COUNT(DISTINCT package) as packages,
                    COUNT(DISTINCT type) as types
                FROM objects
            `)
        };
    }

    /**
     * Find an object by name (handles conflicts by returning all matches)
     */
    public findObject(name: string): ObjectLocation[] {
        if (!this.prepared.findByName) return [];
        
        try {
            return this.prepared.findByName.all(name) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error finding object:', error);
            return [];
        }
    }

    /**
     * Find a specific object by name and package (for conflict resolution)
     */
    public findObjectExact(name: string, packageName: string): ObjectLocation | null {
        if (!this.prepared.findByNameAndPackage) return null;
        
        try {
            return this.prepared.findByNameAndPackage.get(name, packageName) as ObjectLocation || null;
        } catch (error) {
            console.error('❌ Error finding exact object:', error);
            return null;
        }
    }

    /**
     * Find all objects in a package
     */
    public findObjectsByPackage(packageName: string): ObjectLocation[] {
        if (!this.prepared.findByPackage) return [];
        
        try {
            return this.prepared.findByPackage.all(packageName) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error finding objects by package:', error);
            return [];
        }
    }

    /**
     * Find all objects of a specific type
     */
    public findObjectsByType(type: string): ObjectLocation[] {
        if (!this.prepared.findByType) return [];
        
        try {
            return this.prepared.findByType.all(type) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error finding objects by type:', error);
            return [];
        }
    }

    /**
     * Find objects by package and type
     */
    public findObjectsByPackageAndType(packageName: string, type: string): ObjectLocation[] {
        if (!this.prepared.findByPackageAndType) return [];
        
        try {
            return this.prepared.findByPackageAndType.all(packageName, type) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error finding objects by package and type:', error);
            return [];
        }
    }

    /**
     * Search objects by name pattern (supports wildcards)
     */
    public searchObjects(pattern: string): ObjectLocation[] {
        if (!this.prepared.searchByNamePattern) return [];
        
        try {
            // Convert simple wildcards to SQL LIKE patterns
            const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
            return this.prepared.searchByNamePattern.all(sqlPattern, pattern) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error searching objects:', error);
            return [];
        }
    }

    /**
     * Get database statistics
     */
    public getStats(): LookupStats | null {
        if (!this.prepared.getStats) return null;
        
        try {
            const stats = this.prepared.getStats.get() as any;
            return {
                totalObjects: stats.totalObjects,
                uniqueNames: stats.uniqueNames,
                nameConflicts: stats.totalObjects - stats.uniqueNames,
                packages: stats.packages,
                types: stats.types
            };
        } catch (error) {
            console.error('❌ Error getting stats:', error);
            return null;
        }
    }

    /**
     * Smart lookup that handles conflicts automatically
     * Returns the most likely match or suggests alternatives
     */
    public smartLookup(name: string, preferredPackage?: string): {
        result: ObjectLocation | null;
        alternatives: ObjectLocation[];
        isAmbiguous: boolean;
    } {
        const matches = this.findObject(name);
        
        if (matches.length === 0) {
            return {
                result: null,
                alternatives: [],
                isAmbiguous: false
            };
        }
        
        if (matches.length === 1) {
            return {
                result: matches[0],
                alternatives: [],
                isAmbiguous: false
            };
        }
        
        // Multiple matches - try to resolve
        let bestMatch = matches[0];
        
        if (preferredPackage) {
            const packageMatch = matches.find(m => m.package === preferredPackage);
            if (packageMatch) {
                bestMatch = packageMatch;
            }
        }
        
        return {
            result: bestMatch,
            alternatives: matches.filter(m => m !== bestMatch),
            isAmbiguous: true
        };
    }

    /**
     * Store AOT structure metadata in the database
     */
    public storeAOTMetadata(metadata: AOTMetadata): boolean {
        if (!this.db) return false;
        
        try {
            // Create metadata table if it doesn't exist
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS aot_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `);
            
            const insert = this.db.prepare(`
                INSERT OR REPLACE INTO aot_metadata (key, value, updated_at)
                VALUES (?, ?, strftime('%s', 'now'))
            `);
            
            // Store metadata as JSON
            insert.run('aot_structure', JSON.stringify(metadata));
            
            console.log('✅ AOT metadata stored in SQLite database');
            return true;
        } catch (error) {
            console.error('❌ Failed to store AOT metadata:', error);
            return false;
        }
    }

    /**
     * Retrieve AOT structure metadata from the database
     */
    public getAOTMetadata(): AOTMetadata | null {
        if (!this.db) return null;
        
        try {
            const select = this.db.prepare(`
                SELECT value FROM aot_metadata WHERE key = ?
            `);
            
            const row = select.get('aot_structure') as any;
            if (!row) return null;
            
            return JSON.parse(row.value) as AOTMetadata;
        } catch (error) {
            console.error('❌ Failed to retrieve AOT metadata:', error);
            return null;
        }
    }

    /**
     * Check if AOT metadata exists and is recent
     */
    public isAOTMetadataStale(maxAgeHours: number = 24): boolean {
        if (!this.db) return true;
        
        try {
            const select = this.db.prepare(`
                SELECT updated_at FROM aot_metadata WHERE key = ?
            `);
            
            const row = select.get('aot_structure') as any;
            if (!row) return true; // No metadata exists
            
            const now = Math.floor(Date.now() / 1000);
            const maxAge = maxAgeHours * 60 * 60; // Convert hours to seconds
            
            return (now - row.updated_at) > maxAge;
        } catch (error) {
            console.error('❌ Failed to check AOT metadata staleness:', error);
            return true; // Consider stale on error
        }
    }

    /**
     * Close the database connection
     */
    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    /**
     * Check if the database is available and initialized
     */
    public isReady(): boolean {
        return this.db !== null;
    }
}

// Convenience functions for quick usage
export function createObjectLookup(dbPath?: string): SQLiteObjectLookup {
    const lookup = new SQLiteObjectLookup(dbPath);
    if (lookup.initialize()) {
        return lookup;
    }
    throw new Error('Failed to initialize SQLite object lookup');
}

export async function quickLookup(objectName: string, dbPath?: string): Promise<ObjectLocation[]> {
    const lookup = createObjectLookup(dbPath);
    try {
        return lookup.findObject(objectName);
    } finally {
        lookup.close();
    }
}
