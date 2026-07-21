/**
 * SQLite Object Lookup Module
 * 
 * Fast, efficient object location lookups using SQLite database
 * Replaces the 55MB JSON cache with sub-millisecond queries
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { 
    MethodCall, 
    CodeReference, 
    ObjectCode, 
    IndexingMetadata, 
    CODE_ANALYSIS_SCHEMA, 
    SEARCH_PATTERNS 
} from './code-analysis-schema.js';

export interface ObjectLocation {
    name: string;
    path: string;
    model: string;
    type: string;        // Human-readable type (Classes, Tables, Forms)
    axType?: string;     // D365 AX type (AxClass, AxTable, AxForm) - optional for backward compatibility
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

export interface MethodCallSearchResult extends MethodCall {
    objectPath?: string;
}

export interface CodeReferenceSearchResult extends CodeReference {
    objectPath?: string;
}

export interface MethodCodeSearchResult extends ObjectCode {
    objectPath?: string;
}

export interface CodeAnalysisStats {
    totalObjects: number;
    analyzedObjects: number;
    totalMethods: number;
    totalCalls: number;
    totalReferences: number;
    lastAnalysisTime?: string;
    analysisProgress: number; // percentage
}

export class SQLiteObjectLookup {
    protected db: Database.Database | null = null;
    
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
            console.log('ðŸ“– Could not read existing database, will rebuild');
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
        // Existing object lookup statements
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
        deleteObject?: Database.Statement;
        
        // Code analysis statements
        insertMethodCall?: Database.Statement;
        findMethodCalls?: Database.Statement;
        findMethodCallsByPattern?: Database.Statement;
        deleteMethodCallsByObject?: Database.Statement;
        insertCodeReference?: Database.Statement;
        findObjectReferences?: Database.Statement;
        findReferencesByPattern?: Database.Statement;
        deleteReferencesByObject?: Database.Statement;
        insertObjectCode?: Database.Statement;
        findMethodCode?: Database.Statement;
        searchMethodCode?: Database.Statement;
        deleteCodeByObject?: Database.Statement;
        getMethodsByObject?: Database.Statement;
        insertIndexingMetadata?: Database.Statement;
        updateIndexingMetadata?: Database.Statement;
        getIndexingMetadata?: Database.Statement;
        findObjectsNeedingAnalysis?: Database.Statement;
        getAnalysisStats?: Database.Statement;
        getMethodCallStats?: Database.Statement;
        getReferenceStats?: Database.Statement;
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
                console.log(`ðŸ”§ SQLite database not found: ${this.dbPath}`);
                console.log('ðŸš€ Auto-initializing database...');
                
                if (!this.createDatabase()) {
                    console.error('âŒ Failed to auto-create database');
                    console.error('ðŸ’¡ Please run the build process to initialize the database properly');
                    return false;
                }
                
                console.log('âœ… Database auto-created successfully');
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
                console.log('ðŸ“– Read-only database - skipping pragma optimizations');
            }
            
            // Prepare commonly used statements
            try {
                this.prepareStatements();
            } catch (error) {
                console.log('ðŸ“– Read-only database - will prepare statements on-demand');
                // Statements will be prepared on-demand when needed
            }

            // For new databases or when we can write, ensure optimized indexes exist
            if (!this.db.readonly) {
                try {
                    this.createOptimizedIndexes();
                } catch (error) {
                    console.log('ðŸ“– Could not create indexes (read-only database)');
                }
            }
            
            return true;
        } catch (error) {
            console.error('âŒ Failed to initialize SQLite lookup:', error);
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
            
            // Create the objects table with both human-readable and AX type columns
            newDb.exec(`
                CREATE TABLE IF NOT EXISTS objects (
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    model TEXT NOT NULL,
                    type TEXT NOT NULL,
                    ax_type TEXT NOT NULL,
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
            
            // Create code analysis tables
            newDb.exec(CODE_ANALYSIS_SCHEMA.method_calls);
            newDb.exec(CODE_ANALYSIS_SCHEMA.code_references);
            newDb.exec(CODE_ANALYSIS_SCHEMA.object_code);
            newDb.exec(CODE_ANALYSIS_SCHEMA.indexing_metadata);
            
            // Create basic indexes for both type columns
            newDb.exec(`
                CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name);
                CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type);
                CREATE INDEX IF NOT EXISTS idx_objects_ax_type ON objects(ax_type);
                CREATE INDEX IF NOT EXISTS idx_objects_model ON objects(model);
            `);
            
            // Create code analysis indexes
            for (const indexSql of CODE_ANALYSIS_SCHEMA.indexes) {
                newDb.exec(indexSql);
            }
            
            newDb.close();
            console.log('âœ… Created empty SQLite database with schema');
            return true;
        } catch (error) {
            console.error('âŒ Error creating database:', error);
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
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE name = ? 
                ORDER BY model, type
            `),

            // Find unique object by name and model
            findByNameAndModel: this.db.prepare(`
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE name = ? AND model = ?
                LIMIT 1
            `),

            // Find all objects in a model
            findByModel: this.db.prepare(`
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE model = ? 
                ORDER BY type, name
            `),

            // Find all objects of a specific type (supports both human-readable and AX types)
            findByType: this.db.prepare(`
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE type = ? OR ax_type = ? 
                ORDER BY model, name
            `),

            // Find objects by model and type (supports both type formats)
            findByModelAndType: this.db.prepare(`
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE model = ? AND (type = ? OR ax_type = ?) 
                ORDER BY name
            `),

            // Pattern search for object names
            searchByNamePattern: this.db.prepare(`
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE name LIKE ? 
                ORDER BY 
                    CASE WHEN name = ? THEN 0 ELSE 1 END,
                    LENGTH(name),
                    name
                LIMIT 50
            `),

            // Optimized pattern + type search (supports both type formats)
            searchByNamePatternAndType: this.db.prepare(`
                SELECT name, path, model, type, ax_type, lastModified 
                FROM objects 
                WHERE name LIKE ? AND (type = ? OR ax_type = ?)
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

            // Insert object statement for indexing with both type formats
            insertObject: this.db.prepare(`
                INSERT OR REPLACE INTO objects (name, path, model, type, ax_type, lastModified)
                VALUES (?, ?, ?, ?, ?, ?)
            `),

            // Delete object statement for cache maintenance
            deleteObject: this.db.prepare(`
                DELETE FROM objects 
                WHERE name = ? AND type = ?
            `),

            // === CODE ANALYSIS PREPARED STATEMENTS ===
            
            // Method call statements
            insertMethodCall: this.db.prepare(`
                INSERT OR REPLACE INTO method_calls 
                (object_name, object_type, object_model, method_name, called_class, called_method, 
                 call_type, source_location, line_number, call_context, last_indexed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            findMethodCalls: this.db.prepare(SEARCH_PATTERNS.METHOD_CALLS.BY_CLASS_METHOD),
            
            findMethodCallsByPattern: this.db.prepare(`
                SELECT mc.*, o.path as object_path
                FROM method_calls mc
                LEFT JOIN objects o ON (mc.object_name = o.name AND mc.object_type = o.type AND mc.object_model = o.model)
                WHERE (mc.called_class LIKE ? OR mc.called_method LIKE ?)
                ORDER BY mc.object_name, mc.source_location
            `),

            deleteMethodCallsByObject: this.db.prepare(`
                DELETE FROM method_calls 
                WHERE object_name = ? AND object_type = ? AND object_model = ?
            `),

            // Code reference statements
            insertCodeReference: this.db.prepare(`
                INSERT OR REPLACE INTO code_references 
                (object_name, object_type, object_model, referenced_object, reference_type, 
                 reference_context, source_location, line_number, last_indexed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            findObjectReferences: this.db.prepare(SEARCH_PATTERNS.REFERENCES.BY_OBJECT),

            deleteReferencesByObject: this.db.prepare(`
                DELETE FROM code_references 
                WHERE object_name = ? AND object_type = ? AND object_model = ?
            `),

            // Object code statements
            insertObjectCode: this.db.prepare(`
                INSERT OR REPLACE INTO object_code 
                (object_name, object_type, object_model, method_name, source_code, code_hash,
                 method_signature, access_level, is_static, parameters, return_type, last_indexed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            findMethodCode: this.db.prepare(`
                SELECT * FROM object_code 
                WHERE object_name = ? AND object_type = ? AND object_model = ? AND method_name = ?
            `),

            searchMethodCode: this.db.prepare(SEARCH_PATTERNS.SOURCE_CODE.SEARCH_CODE),

            getMethodsByObject: this.db.prepare(`
                SELECT * FROM object_code 
                WHERE object_name = ? AND object_type = ? AND object_model = ?
                ORDER BY method_name
            `),

            deleteCodeByObject: this.db.prepare(`
                DELETE FROM object_code 
                WHERE object_name = ? AND object_type = ? AND object_model = ?
            `),

            // Indexing metadata statements
            insertIndexingMetadata: this.db.prepare(`
                INSERT OR REPLACE INTO indexing_metadata 
                (object_name, object_type, object_model, last_analyzed, method_count, 
                 reference_count, analysis_version, code_hash, analysis_status, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            getIndexingMetadata: this.db.prepare(`
                SELECT * FROM indexing_metadata 
                WHERE object_name = ? AND object_type = ? AND object_model = ?
            `),

            findObjectsNeedingAnalysis: this.db.prepare(
                SEARCH_PATTERNS.METADATA.NEEDS_ANALYSIS
            ),

            // Analysis statistics
            getAnalysisStats: this.db.prepare(`
                SELECT 
                    COUNT(DISTINCT o.name || '|' || o.type || '|' || o.model) as total_objects,
                    COUNT(DISTINCT im.object_name || '|' || im.object_type || '|' || im.object_model) as analyzed_objects,
                    COALESCE(SUM(im.method_count), 0) as total_methods,
                    COALESCE(SUM(im.reference_count), 0) as total_references,
                    MAX(im.last_analyzed) as last_analysis
                FROM objects o
                LEFT JOIN indexing_metadata im ON (
                    o.name = im.object_name AND 
                    o.type = im.object_type AND 
                    o.model = im.object_model
                )
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
            console.error('âŒ Error finding object:', error);
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
            console.error('âŒ Error finding exact object:', error);
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
            console.error('âŒ Error finding objects by model:', error);
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
            console.log('ðŸ”„ Reopening database in write mode for object insertion...');
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
                obj.axType || obj.type, // Use axType if available, fallback to type
                timestamp
            );
            return true;
        } catch (error) {
            console.error('âŒ Error inserting object:', error);
            return false;
        }
    }

    /**
     * Delete an object from the database
     * Used to maintain cache consistency when objects are deleted
     */
    public deleteObject(objectName: string, objectType: string): boolean {
        // Check if database needs to be reopened in write mode  
        if (!this.db || this.db.readonly) {
            console.log('ðŸ”„ Reopening database in write mode for object deletion...');
            this.close();
            
            // Reopen in write mode
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        if (!this.prepared.deleteObject) return false;

        try {
            const result = this.prepared.deleteObject.run(objectName, objectType);
            
            if (result.changes > 0) {
                console.log(`âœ… Deleted object from cache: ${objectName} (${objectType})`);
                return true;
            } else {
                console.log(`â„¹ï¸ Object not found in cache: ${objectName} (${objectType})`);
                return true; // Not an error - object might not have been in cache
            }
        } catch (error) {
            console.error('âŒ Error deleting object:', error);
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
            console.log('ðŸ”„ Reopening database in write mode for bulk insertion...');
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
                        obj.axType || obj.type, // Use axType if available, fallback to type
                        timestamp
                    );
                }
            });

            insertMany(objects);
            return true;
        } catch (error) {
            console.error('âŒ Error bulk inserting objects:', error);
            return false;
        }
    }

    /**
     * Find all objects of a specific type
     */
    public findObjectsByType(type: string): ObjectLocation[] {
        if (!this.prepared.findByType) return [];
        
        try {
            return this.prepared.findByType.all(type, type) as ObjectLocation[];
        } catch (error) {
            console.error('âŒ Error finding objects by type:', error);
            return [];
        }
    }

    /**
     * Find objects by model and type
     */
    public findObjectsByModelAndType(modelName: string, type: string): ObjectLocation[] {
        if (!this.prepared.findByModelAndType) return [];
        
        try {
            return this.prepared.findByModelAndType.all(modelName, type, type) as ObjectLocation[];
        } catch (error) {
            console.error('âŒ Error finding objects by model and type:', error);
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
            console.error('âŒ Error searching objects:', error);
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
            return this.prepared.searchByNamePatternAndType.all(sqlPattern, type, type, pattern) as ObjectLocation[];
        } catch (error) {
            console.error('âŒ Error searching objects by pattern and type:', error);
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
            console.error('âŒ Error getting stats:', error);
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
            
            console.log('âœ… AOT metadata stored in SQLite database');
            return true;
        } catch (error) {
            console.error('âŒ Failed to store AOT metadata:', error);
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
            console.error('âŒ Failed to retrieve AOT metadata:', error);
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
            console.error('âŒ Failed to check AOT metadata staleness:', error);
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
            console.error('âŒ Error getting total count:', error);
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
            console.error('âŒ Error getting type stats:', error);
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
            console.error('âŒ Error getting model stats:', error);
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
            console.log('ðŸ”„ Reopening database in write mode for clearing...');
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
            console.log('ï¿½ Ensuring optimized indexes exist...');
            this.createOptimizedIndexes();
            
            console.log('ï¿½ðŸ—‘ï¸ Database cleared successfully');
            
            // Reopen in readonly mode for future operations
            this.close();
            this.initialize();
        } catch (error) {
            console.error('âŒ Error clearing database:', error);
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
                console.log('ðŸ“ Index may already exist, continuing...');
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
            console.log('ðŸ“ Reopening database in write mode for caching...');
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
            console.log(`âœ… Cached ${objectTypes.length} object types in SQLite`);
            
            // Reopen in readonly mode for future operations
            this.close();
            this.initialize();
        } catch (error) {
            console.error('âŒ Error caching object types:', error);
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
            console.error('âŒ Error retrieving cached object types:', error);
            // Return empty array if table doesn't exist yet
            return [];
        }
    }

    // ==================== CODE ANALYSIS METHODS ====================

    /**
     * Add a method call to the index
     */
    public async addMethodCall(methodCall: MethodCall): Promise<void> {
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for method call insertion...');
            this.close();
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        if (!this.prepared.insertMethodCall) {
            throw new Error('Database not initialized');
        }

        this.prepared.insertMethodCall.run(
            methodCall.objectName,
            methodCall.objectType,
            methodCall.objectModel,
            methodCall.methodName,
            methodCall.calledClass,
            methodCall.calledMethod,
            methodCall.callType,
            methodCall.sourceLocation,
            methodCall.lineNumber || null,
            methodCall.callContext || null,
            methodCall.lastIndexed
        );
    }

    /**
     * Find all calls to a specific method (e.g., "xGlobal::runAsync")
     */
    public async findMethodCalls(className: string, methodName: string): Promise<MethodCallSearchResult[]> {
        if (!this.prepared.findMethodCalls) {
            throw new Error('Database not initialized');
        }

        const results = this.prepared.findMethodCalls.all(className, methodName) as any[];
        return results.map(row => ({
            id: row.id,
            objectName: row.object_name,
            objectType: row.object_type,
            objectModel: row.object_model,
            methodName: row.method_name,
            calledClass: row.called_class,
            calledMethod: row.called_method,
            callType: row.call_type as 'static' | 'instance' | 'global',
            sourceLocation: row.source_location,
            lineNumber: row.line_number,
            callContext: row.call_context,
            lastIndexed: row.last_indexed,
            objectPath: row.object_path
        }));
    }

    /**
     * Search method calls by pattern (supports wildcards)
     */
    public async searchMethodCalls(pattern: string): Promise<MethodCallSearchResult[]> {
        if (!this.prepared.findMethodCallsByPattern) {
            throw new Error('Database not initialized');
        }

        const searchPattern = pattern.includes('%') ? pattern : `%${pattern}%`;
        const results = this.prepared.findMethodCallsByPattern.all(searchPattern, searchPattern) as any[];
        
        return results.map(row => ({
            id: row.id,
            objectName: row.object_name,
            objectType: row.object_type,
            objectModel: row.object_model,
            methodName: row.method_name,
            calledClass: row.called_class,
            calledMethod: row.called_method,
            callType: row.call_type as 'static' | 'instance' | 'global',
            sourceLocation: row.source_location,
            lineNumber: row.line_number,
            callContext: row.call_context,
            lastIndexed: row.last_indexed,
            objectPath: row.object_path
        }));
    }

    /**
     * Add a code reference to the index
     */
    public async addCodeReference(codeRef: CodeReference): Promise<void> {
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for code reference insertion...');
            this.close();
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        if (!this.prepared.insertCodeReference) {
            throw new Error('Database not initialized');
        }

        this.prepared.insertCodeReference.run(
            codeRef.objectName,
            codeRef.objectType,
            codeRef.objectModel,
            codeRef.referencedObject,
            codeRef.referenceType,
            codeRef.referenceContext,
            codeRef.sourceLocation,
            codeRef.lineNumber || null,
            codeRef.lastIndexed
        );
    }

    /**
     * Find all references to a specific object
     */
    public async findObjectReferences(objectName: string): Promise<CodeReferenceSearchResult[]> {
        if (!this.prepared.findObjectReferences) {
            throw new Error('Database not initialized');
        }

        const results = this.prepared.findObjectReferences.all(`%${objectName}%`) as any[];
        return results.map(row => ({
            id: row.id,
            objectName: row.object_name,
            objectType: row.object_type,
            objectModel: row.object_model,
            referencedObject: row.referenced_object,
            referenceType: row.reference_type as 'class' | 'table' | 'enum' | 'edt' | 'form' | 'query' | 'other',
            referenceContext: row.reference_context,
            sourceLocation: row.source_location,
            lineNumber: row.line_number,
            lastIndexed: row.last_indexed,
            objectPath: row.object_path
        }));
    }

    /**
     * Add method source code to the index
     */
    public async addMethodCode(objectCode: ObjectCode): Promise<void> {
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for method code insertion...');
            this.close();
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        if (!this.prepared.insertObjectCode) {
            throw new Error('Database not initialized');
        }

        this.prepared.insertObjectCode.run(
            objectCode.objectName,
            objectCode.objectType,
            objectCode.objectModel,
            objectCode.methodName,
            objectCode.sourceCode,
            objectCode.codeHash,
            objectCode.methodSignature || null,
            objectCode.accessLevel || null,
            objectCode.isStatic || false,
            objectCode.parameters ? JSON.stringify(objectCode.parameters) : null,
            objectCode.returnType || null,
            objectCode.lastIndexed
        );
    }

    /**
     * Search method source code
     */
    public async searchMethodCode(codePattern: string): Promise<MethodCodeSearchResult[]> {
        if (!this.prepared.searchMethodCode) {
            throw new Error('Database not initialized');
        }

        const searchPattern = codePattern.includes('%') ? codePattern : `%${codePattern}%`;
        const results = this.prepared.searchMethodCode.all(searchPattern) as any[];
        
        return results.map(row => ({
            objectName: row.object_name,
            objectType: row.object_type,
            objectModel: row.object_model,
            methodName: row.method_name,
            sourceCode: row.source_code,
            codeHash: row.code_hash,
            methodSignature: row.method_signature,
            accessLevel: row.access_level,
            isStatic: row.is_static === 1,
            parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
            returnType: row.return_type,
            lastIndexed: row.last_indexed,
            objectPath: row.object_path
        }));
    }

    /**
     * Update indexing metadata for an object
     */
    public async updateIndexingMetadata(metadata: IndexingMetadata): Promise<void> {
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for indexing metadata...');
            this.close();
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        if (!this.prepared.insertIndexingMetadata) {
            throw new Error('Database not initialized');
        }

        this.prepared.insertIndexingMetadata.run(
            metadata.objectName,
            metadata.objectType,
            metadata.objectModel,
            metadata.lastAnalyzed,
            metadata.methodCount || 0,
            metadata.referenceCount || 0,
            metadata.analysisVersion,
            metadata.codeHash || null,
            metadata.analysisStatus,
            metadata.errorMessage || null
        );
    }

    /**
     * Get objects that need code analysis
     */
    public async getObjectsNeedingAnalysis(analysisVersion: string, limit: number = 100): Promise<ObjectLocation[]> {
        if (!this.prepared.findObjectsNeedingAnalysis) {
            throw new Error('Database not initialized');
        }

        const stmt = this.db!.prepare(`
            ${SEARCH_PATTERNS.METADATA.NEEDS_ANALYSIS}
            LIMIT ?
        `);

        const results = stmt.all(analysisVersion, limit) as any[];
        return results.map(row => ({
            name: row.name,
            type: row.type,
            model: row.model,
            path: row.path,
            lastModified: row.lastModified ? new Date(row.lastModified * 1000).toISOString() : undefined
        }));
    }

    /**
     * Get code analysis statistics
     */
    public async getCodeAnalysisStats(): Promise<CodeAnalysisStats> {
        if (!this.prepared.getAnalysisStats) {
            throw new Error('Database not initialized');
        }

        const result = this.prepared.getAnalysisStats.get() as any;
        const totalObjects = result.total_objects || 0;
        const analyzedObjects = result.analyzed_objects || 0;
        
        return {
            totalObjects,
            analyzedObjects,
            totalMethods: result.total_methods || 0,
            totalCalls: result.total_calls || 0,
            totalReferences: result.total_references || 0,
            lastAnalysisTime: result.last_analysis ? new Date(result.last_analysis * 1000).toISOString() : undefined,
            analysisProgress: totalObjects > 0 ? Math.round((analyzedObjects / totalObjects) * 100) : 0
        };
    }

    /**
     * Clean up analysis data for an object (before re-analysis)
     */
    public async cleanupObjectAnalysis(objectName: string, objectType: string, objectModel: string): Promise<void> {
        // Check if database needs to be reopened in write mode
        if (!this.db || this.db.readonly) {
            console.log('🔄 Reopening database in write mode for analysis cleanup...');
            this.close();
            this.db = new Database(this.dbPath, { readonly: false });
            this.prepareStatements();
        }

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const transaction = this.db.transaction(() => {
            this.prepared.deleteMethodCallsByObject?.run(objectName, objectType, objectModel);
            this.prepared.deleteReferencesByObject?.run(objectName, objectType, objectModel);
            this.prepared.deleteCodeByObject?.run(objectName, objectType, objectModel);
        });

        transaction();
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
