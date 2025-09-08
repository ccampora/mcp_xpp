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
    model: string;
    type: string;
    lastModified?: string;
    hasCode?: boolean;
    isValid?: boolean;
    processingTime?: number;
}

export interface LookupStats {
    totalObjects: number;
    uniqueNames: number;
    nameConflicts: number;
    models: number;
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
        findByModel?: Database.Statement;
        findByType?: Database.Statement;
        findByModelAndType?: Database.Statement;
        findByNameAndModel?: Database.Statement;
        getStats?: Database.Statement;
        searchByNamePattern?: Database.Statement;
        getTotalCount?: Database.Statement;
        getTypeCount?: Database.Statement;
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
                SELECT name, path, model, type, lastModified 
                FROM objects 
                WHERE name = ? 
                ORDER BY model, type
            `),

            // Find unique object by name and model
            findByNameAndModel: this.db.prepare(`
                SELECT name, path, model, type, lastModified 
                FROM objects 
                WHERE name = ? AND model = ?
                LIMIT 1
            `),

            // Find all objects in a model
            findByModel: this.db.prepare(`
                SELECT name, path, model, type, lastModified 
                FROM objects 
                WHERE model = ? 
                ORDER BY type, name
            `),

            // Find all objects of a specific type
            findByType: this.db.prepare(`
                SELECT name, path, model, type, lastModified 
                FROM objects 
                WHERE type = ? 
                ORDER BY model, name
            `),

            // Find objects by model and type
            findByModelAndType: this.db.prepare(`
                SELECT name, path, model, type, lastModified 
                FROM objects 
                WHERE model = ? AND type = ? 
                ORDER BY name
            `),

            // Pattern search for object names
            searchByNamePattern: this.db.prepare(`
                SELECT name, path, model, type, lastModified 
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
                    COUNT(DISTINCT model) as models,
                    COUNT(DISTINCT type) as types
                FROM objects
            `),

            // Get total count of objects
            getTotalCount: this.db.prepare(`
                SELECT COUNT(*) as count 
                FROM objects
            `),

            // Get count of objects by type
            getTypeCount: this.db.prepare(`
                SELECT type, COUNT(*) as count 
                FROM objects 
                GROUP BY type 
                ORDER BY count DESC
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
    public findObjectExact(name: string, modelName: string): ObjectLocation | null {
        if (!this.prepared.findByNameAndModel) return null;
        
        try {
            return this.prepared.findByNameAndModel.get(name, modelName) as ObjectLocation || null;
        } catch (error) {
            console.error('❌ Error finding exact object:', error);
            return null;
        }
    }

    /**
     * Find all objects in a model
     */
    public findObjectsByModel(modelName: string): ObjectLocation[] {
        if (!this.prepared.findByModel) return [];
        
        try {
            return this.prepared.findByModel.all(modelName) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error finding objects by model:', error);
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
     * Find objects by model and type
     */
    public findObjectsByModelAndType(modelName: string, type: string): ObjectLocation[] {
        if (!this.prepared.findByModelAndType) return [];
        
        try {
            return this.prepared.findByModelAndType.all(modelName, type) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error finding objects by model and type:', error);
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
                models: stats.models,
                types: stats.types
            };
        } catch (error) {
            console.error('❌ Error getting stats:', error);
            return null;
        }
    }

    /**
     * Object lookup with conflict resolution
     * Returns the most likely match or suggests alternatives
     */
    public lookupObject(name: string, preferredPackage?: string): {
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
            const modelMatch = matches.find(m => m.model === preferredPackage);
            if (modelMatch) {
                bestMatch = modelMatch;
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
     * Get total count of objects in the database
     */
    public getTotalCount(): number {
        if (!this.prepared.getTotalCount) return 0;
        
        try {
            const result = this.prepared.getTotalCount.get() as { count: number };
            return result.count;
        } catch (error) {
            console.error('❌ Error getting total count:', error);
            return 0;
        }
    }

    /**
     * Get object count by type
     */
    public getTypeStats(): Record<string, number> {
        if (!this.prepared.getTypeCount) return {};
        
        try {
            const results = this.prepared.getTypeCount.all() as { type: string; count: number }[];
            const stats: Record<string, number> = {};
            for (const row of results) {
                stats[row.type] = row.count;
            }
            return stats;
        } catch (error) {
            console.error('❌ Error getting type stats:', error);
            return {};
        }
    }

    /**
     * Get object count by model
     */
    public getModelStats(): Record<string, number> {
        if (!this.db) return {};
        
        try {
            const stmt = this.db.prepare(`
                SELECT model, COUNT(*) as count 
                FROM objects 
                GROUP BY model 
                ORDER BY count DESC
            `);
            const results = stmt.all() as { model: string; count: number }[];
            const stats: Record<string, number> = {};
            for (const row of results) {
                stats[row.model] = row.count;
            }
            return stats;
        } catch (error) {
            console.error('❌ Error getting model stats:', error);
            return {};
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
