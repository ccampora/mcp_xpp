/**
 * SQLite Object Lookup Module
 * 
 * Fast, efficient object location lookups using SQLite database
 * Replaces the 55MB JSON cache with sub-millisecond queries
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
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
    
    /**
     * Static method to safely check if database exists and has objects
     * without initializing the full SQLite instance
     */
    public static safeGetTotalCount(dbPath?: string): number {
        const targetPath = dbPath || path.join(process.cwd(), 'cache', 'object-lookup.db');
        
        if (!existsSync(targetPath)) {
            return 0;
        }
        
        let tempDb: Database.Database | null = null;
        try {
            // Try to open in read-write mode to avoid read-only issues
            tempDb = new Database(targetPath, { 
                fileMustExist: true
            });
            
            // Use a simple count query
            const stmt = tempDb.prepare('SELECT COUNT(*) as count FROM objects');
            const result = stmt.get() as { count: number };
            return result?.count || 0;
        } catch (error) {
            console.log('📖 Could not read existing database, will rebuild');
            return 0;
        } finally {
            if (tempDb) {
                try {
                    tempDb.close();
                } catch (error) {
                    // Ignore close errors
                }
            }
        }
    }
    private prepared: {
        findByName?: Database.Statement;
        findByNameExact?: Database.Statement;
        findByModel?: Database.Statement;
        findByType?: Database.Statement;
        findByModelAndType?: Database.Statement;
        findByNameAndModel?: Database.Statement;
        getStats?: Database.Statement;
        searchByNamePattern?: Database.Statement;
        searchByNamePatternAndType?: Database.Statement;
        getTotalCount?: Database.Statement;
        getTypeCount?: Database.Statement;
        insertObject?: Database.Statement;
    } = {};

    constructor(private dbPath: string = 'cache/object-lookup.db') {}

    /**
     * Initialize the database connection and prepare statements
     * Automatically creates the database if it doesn't exist
     */
    public initialize(): boolean {
        try {
            // Auto-create database if it doesn't exist
            if (!existsSync(this.dbPath)) {
                console.log(`🔧 SQLite database not found: ${this.dbPath}`);
                console.log('🚀 Auto-initializing database...');
                
                if (!this.createDatabase()) {
                    console.error('❌ Failed to auto-create database');
                    console.error('💡 Please run the build process to initialize the database properly');
                    return false;
                }
                
                console.log('✅ Database auto-created successfully');
            }

            this.db = new Database(this.dbPath, { readonly: true });
            
            // Optimize for reading performance (ignore errors on read-only database)
            try {
                this.db.pragma('cache_size = 20000');        // Increased from 10000
                this.db.pragma('temp_store = MEMORY');
                this.db.pragma('mmap_size = 268435456');     // 256MB memory mapping
                this.db.pragma('query_only = true');        // Read-only optimization
            } catch (error) {
                // Ignore pragma errors on read-only database
                console.log('📖 Read-only database - skipping pragma optimizations');
            }
            
            // Prepare commonly used statements
            try {
                this.prepareStatements();
            } catch (error) {
                console.log('📖 Read-only database - will prepare statements on-demand');
                // Statements will be prepared on-demand when needed
            }

            // For new databases or when we can write, ensure optimized indexes exist
            if (!this.db.readonly) {
                try {
                    this.createOptimizedIndexes();
                } catch (error) {
                    console.log('📖 Could not create indexes (read-only database)');
                }
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize SQLite lookup:', error);
            return false;
        }
    }

    /**
     * Create a new empty database with the required schema
     * Called automatically when database doesn't exist
     */
    private createDatabase(): boolean {
        try {
            // Create parent directory if it doesn't exist
            const dir = path.dirname(this.dbPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            // Create the database with write access
            const newDb = new Database(this.dbPath, { readonly: false });
            
            // Create the objects table
            newDb.exec(`
                CREATE TABLE IF NOT EXISTS objects (
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    model TEXT NOT NULL,
                    type TEXT NOT NULL,
                    lastModified INTEGER,
                    PRIMARY KEY (name, model, type)
                )
            `);
            
            // Create the object types cache table
            newDb.exec(`
                CREATE TABLE IF NOT EXISTS object_types_cache (
                    type_name TEXT PRIMARY KEY,
                    cached_at INTEGER DEFAULT (datetime('now'))
                )
            `);
            
            // Create basic indexes
            newDb.exec(`
                CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name);
                CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type);
                CREATE INDEX IF NOT EXISTS idx_objects_model ON objects(model);
            `);
            
            newDb.close();
            console.log('✅ Created empty SQLite database with schema');
            return true;
        } catch (error) {
            console.error('❌ Error creating database:', error);
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

            // Optimized pattern + type search (most common search pattern)
            searchByNamePatternAndType: this.db.prepare(`
                SELECT name, path, model, type, lastModified 
                FROM objects 
                WHERE name LIKE ? AND type = ?
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
            `),

            // Insert object statement for indexing
            insertObject: this.db.prepare(`
                INSERT OR REPLACE INTO objects (name, path, model, type, lastModified)
                VALUES (?, ?, ?, ?, ?)
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
     * Insert an object into the database
     * Automatically handles database mode switching if needed
     */
    public insertObject(obj: ObjectLocation): boolean {
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for object insertion...');
            this.close();
            
            // Reopen in write mode
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }
        
        if (!this.prepared.insertObject) return false;
        
        try {
            // Convert lastModified to integer timestamp if it's a string
            const timestamp = typeof obj.lastModified === 'string' 
                ? new Date(obj.lastModified).getTime() 
                : (obj.lastModified || Date.now());
                
            this.prepared.insertObject.run(
                obj.name,
                obj.path,
                obj.model,
                obj.type,
                timestamp
            );
            return true;
        } catch (error) {
            console.error('❌ Error inserting object:', error);
            return false;
        }
    }

    /**
     * Bulk insert objects into the database using transactions for optimal performance
     * Much faster than individual insertObject calls for large datasets
     */
    public insertObjectsBulk(objects: ObjectLocation[]): boolean {
        if (objects.length === 0) return true;
        
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for bulk insertion...');
            this.close();
            
            // Reopen in write mode
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }
        
        if (!this.prepared.insertObject) return false;
        
        try {
            // Use transaction for bulk insert - much faster!
            const insertMany = this.db.transaction((objs: ObjectLocation[]) => {
                for (const obj of objs) {
                    // Convert lastModified to integer timestamp if it's a string
                    const timestamp = typeof obj.lastModified === 'string' 
                        ? new Date(obj.lastModified).getTime() 
                        : (obj.lastModified || Date.now());
                        
                    this.prepared.insertObject!.run(
                        obj.name,
                        obj.path,
                        obj.model,
                        obj.type,
                        timestamp
                    );
                }
            });

            insertMany(objects);
            return true;
        } catch (error) {
            console.error('❌ Error bulk inserting objects:', error);
            return false;
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
     * Search objects by name pattern and type (optimized for most common search)
     */
    public searchObjectsByPatternAndType(pattern: string, type: string): ObjectLocation[] {
        if (!this.prepared.searchByNamePatternAndType) return [];
        
        try {
            // Convert simple wildcards to SQL LIKE patterns
            const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
            return this.prepared.searchByNamePatternAndType.all(sqlPattern, type, pattern) as ObjectLocation[];
        } catch (error) {
            console.error('❌ Error searching objects by pattern and type:', error);
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
        if (!this.db) return 0;
        
        try {
            // If prepared statement exists, use it
            if (this.prepared?.getTotalCount) {
                const result = this.prepared.getTotalCount.get() as { count: number };
                return result.count;
            }
            
            // Otherwise prepare and execute on-demand for read-only databases
            const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM objects');
            const result = countStmt.get() as { count: number };
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

    /**
     * Clear all objects from the database (for force rebuild)
     * This ensures a clean slate when forceRebuild is requested
     */
    public clearDatabase(): void {
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for clearing...');
            this.close();
            
            // Reopen in write mode
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        try {
            if (!this.db) {
                throw new Error('Failed to initialize database for clearing');
            }

            // Clear all data from objects table
            this.db.exec('DELETE FROM objects');
            
            // Also clear object types cache if it exists
            this.db.exec('DELETE FROM object_types_cache');
            
            // Ensure all optimized indexes exist for best performance
            console.log('� Ensuring optimized indexes exist...');
            this.createOptimizedIndexes();
            
            console.log('�🗑️ Database cleared successfully');
            
            // Reopen in readonly mode for future operations
            this.close();
            this.initialize();
        } catch (error) {
            console.error('❌ Error clearing database:', error);
            throw error;
        }
    }

    /**
     * Create all optimized indexes for best search performance
     */
    private createOptimizedIndexes(): void {
        if (!this.db) return;

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name)',
            'CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type)',
            'CREATE INDEX IF NOT EXISTS idx_objects_model ON objects(model)',
            'CREATE INDEX IF NOT EXISTS idx_objects_model_type ON objects(model, type)',
            'CREATE INDEX IF NOT EXISTS idx_objects_name_type ON objects(name, type)',
            'CREATE INDEX IF NOT EXISTS idx_objects_type_name ON objects(type, name)',
            'CREATE INDEX IF NOT EXISTS idx_objects_name_collate ON objects(name COLLATE NOCASE)'
        ];

        for (const indexSql of indexes) {
            try {
                this.db.exec(indexSql);
            } catch (error) {
                // Ignore errors if index already exists
                console.log('📝 Index may already exist, continuing...');
            }
        }
        
        // Update table statistics for query optimizer
        try {
            this.db.exec('ANALYZE objects');
        } catch (error) {
            // Ignore analyze errors
        }
    }

    /**
     * Cache object types for fast retrieval
     * Stores the complete list of available object types from VS2022 service
     */
    public async cacheObjectTypes(objectTypes: string[]): Promise<void> {
        // For write operations, we need to reopen database in write mode
        if (!this.db || this.db.readonly) {
            console.log('📝 Reopening database in write mode for caching...');
            this.close();
            
            // Reopen in write mode (readonly: false)
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        try {
            if (!this.db) {
                throw new Error('Failed to initialize database for caching');
            }

            // Create cache table if it doesn't exist
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS object_types_cache (
                    type_name TEXT PRIMARY KEY,
                    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `);
            
            const insertMany = this.db.transaction((types: string[]) => {
                // Clear existing cache first
                this.db!.exec('DELETE FROM object_types_cache');
                const insert = this.db!.prepare('INSERT OR REPLACE INTO object_types_cache (type_name) VALUES (?)');
                for (const type of types) {
                    insert.run(type);
                }
            });

            insertMany(objectTypes);
            console.log(`✅ Cached ${objectTypes.length} object types in SQLite`);
            
            // Reopen in readonly mode for future operations
            this.close();
            this.initialize();
        } catch (error) {
            console.error('❌ Error caching object types:', error);
            throw error;
        }
    }

    /**
     * Get cached object types from SQLite
     * Returns the complete list of available object types
     */
    public async getCachedObjectTypes(): Promise<string[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            const stmt = this.db.prepare('SELECT type_name FROM object_types_cache ORDER BY type_name');
            const rows = stmt.all() as Array<{ type_name: string }>;
            
            return rows.map(row => row.type_name);
        } catch (error) {
            console.error('❌ Error retrieving cached object types:', error);
            // Return empty array if table doesn't exist yet
            return [];
        }
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
