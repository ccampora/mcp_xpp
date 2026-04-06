/**
 * Code Analysis SQLite Schema for Method Indexing
 * 
 * This module defines the database schema for indexing method calls, references,
 * and other code analysis data to enable efficient searching for method usage
 * like "xGlobal::runAsync" across all D365 objects.
 */

export interface MethodCall {
    id?: number;
    objectName: string;        // Maps to object_name in DB
    objectType: string;        // Maps to object_type in DB  
    objectModel: string;       // Maps to object_model in DB
    methodName: string;        // Maps to method_name in DB
    calledClass: string;       // Maps to called_class in DB
    calledMethod: string;      // Maps to called_method in DB
    callType: 'static' | 'instance' | 'global'; // Maps to call_type in DB
    sourceLocation: string;    // Maps to source_location in DB
    lineNumber?: number;       // Maps to line_number in DB
    callContext?: string;      // Maps to call_context in DB
    lastIndexed: number;       // Maps to last_indexed in DB
}

export interface CodeReference {
    id?: number;
    objectName: string;
    objectType: string;
    objectModel: string;
    referencedObject: string;
    referenceType: 'class' | 'table' | 'enum' | 'edt' | 'form' | 'query' | 'other';
    referenceContext: string; // Where the reference appears
    sourceLocation: string;
    lineNumber?: number;
    lastIndexed: number;
}

export interface ObjectCode {
    objectName: string;
    objectType: string;
    objectModel: string;
    methodName: string;
    sourceCode: string;
    codeHash: string; // Hash to detect changes
    methodSignature?: string;
    accessLevel?: string; // public, private, protected
    isStatic?: boolean;
    parameters?: string[];
    returnType?: string;
    lastIndexed: number;
}

export interface IndexingMetadata {
    objectName: string;
    objectType: string;
    objectModel: string;
    lastAnalyzed: number;
    analysisVersion: string;
    codeHash?: string;
    methodCount?: number;
    referenceCount?: number;
    analysisStatus: 'pending' | 'completed' | 'error' | 'skipped';
    errorMessage?: string;
}

/**
 * Code Analysis SQLite database schema
 */
export const CODE_ANALYSIS_SCHEMA = {
    method_calls: `
        CREATE TABLE IF NOT EXISTS method_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_name TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_model TEXT NOT NULL,
            method_name TEXT NOT NULL,
            called_class TEXT NOT NULL,
            called_method TEXT NOT NULL,
            call_type TEXT NOT NULL CHECK(call_type IN ('static', 'instance', 'global')),
            source_location TEXT NOT NULL,
            line_number INTEGER,
            call_context TEXT,
            last_indexed INTEGER NOT NULL,
            UNIQUE(object_name, object_type, object_model, method_name, called_class, called_method, source_location)
        )`,
    
    code_references: `
        CREATE TABLE IF NOT EXISTS code_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_name TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_model TEXT NOT NULL,
            referenced_object TEXT NOT NULL,
            reference_type TEXT NOT NULL CHECK(reference_type IN ('class', 'table', 'enum', 'edt', 'form', 'query', 'other')),
            reference_context TEXT NOT NULL,
            source_location TEXT NOT NULL,
            line_number INTEGER,
            last_indexed INTEGER NOT NULL,
            UNIQUE(object_name, object_type, object_model, referenced_object, reference_type, source_location)
        )`,
    
    object_code: `
        CREATE TABLE IF NOT EXISTS object_code (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_name TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_model TEXT NOT NULL,
            method_name TEXT NOT NULL,
            source_code TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            method_signature TEXT,
            access_level TEXT,
            is_static INTEGER DEFAULT 0,
            parameters TEXT, -- JSON array of parameter names
            return_type TEXT,
            last_indexed INTEGER NOT NULL,
            UNIQUE(object_name, object_type, object_model, method_name)
        )`,
    
    indexing_metadata: `
        CREATE TABLE IF NOT EXISTS indexing_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_name TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_model TEXT NOT NULL,
            last_analyzed INTEGER NOT NULL,
            analysis_version TEXT NOT NULL,
            code_hash TEXT,
            method_count INTEGER DEFAULT 0,
            reference_count INTEGER DEFAULT 0,
            analysis_status TEXT NOT NULL CHECK(analysis_status IN ('pending', 'completed', 'error', 'skipped')),
            error_message TEXT,
            UNIQUE(object_name, object_type, object_model)
        )`,
    
    // Indexes for performance
    indexes: [
        'CREATE INDEX IF NOT EXISTS idx_method_calls_called ON method_calls(called_class, called_method)',
        'CREATE INDEX IF NOT EXISTS idx_method_calls_object ON method_calls(object_name, object_type, object_model)',
        'CREATE INDEX IF NOT EXISTS idx_method_calls_source ON method_calls(source_location)',
        'CREATE INDEX IF NOT EXISTS idx_method_calls_last_indexed ON method_calls(last_indexed)',
        
        'CREATE INDEX IF NOT EXISTS idx_code_references_referenced ON code_references(referenced_object)',
        'CREATE INDEX IF NOT EXISTS idx_code_references_object ON code_references(object_name, object_type, object_model)',
        'CREATE INDEX IF NOT EXISTS idx_code_references_type ON code_references(reference_type)',
        'CREATE INDEX IF NOT EXISTS idx_code_references_last_indexed ON code_references(last_indexed)',
        
        'CREATE INDEX IF NOT EXISTS idx_object_code_object ON object_code(object_name, object_type, object_model)',
        'CREATE INDEX IF NOT EXISTS idx_object_code_method ON object_code(method_name)',
        'CREATE INDEX IF NOT EXISTS idx_object_code_hash ON object_code(code_hash)',
        'CREATE INDEX IF NOT EXISTS idx_object_code_last_indexed ON object_code(last_indexed)',
        
        'CREATE INDEX IF NOT EXISTS idx_indexing_metadata_object ON indexing_metadata(object_name, object_type, object_model)',
        'CREATE INDEX IF NOT EXISTS idx_indexing_metadata_analyzed ON indexing_metadata(last_analyzed)',
        'CREATE INDEX IF NOT EXISTS idx_indexing_metadata_status ON indexing_metadata(analysis_status)',
        'CREATE INDEX IF NOT EXISTS idx_indexing_metadata_version ON indexing_metadata(analysis_version)'
    ]
};

/**
 * Common search patterns for code analysis queries
 */
export const SEARCH_PATTERNS = {
    METHOD_CALLS: {
        BY_CLASS_METHOD: `
            SELECT mc.*, om.path as filePath 
            FROM method_calls mc 
            LEFT JOIN objects om ON mc.object_name = om.name AND mc.object_type = om.type 
            WHERE mc.called_class = ? AND mc.called_method = ?
            ORDER BY mc.object_name, mc.source_location`,
        
        BY_PATTERN: `
            SELECT mc.*, om.path as filePath 
            FROM method_calls mc 
            LEFT JOIN objects om ON mc.object_name = om.name AND mc.object_type = om.type 
            WHERE (mc.called_class || '::' || mc.called_method) LIKE ?
            ORDER BY mc.object_name, mc.source_location
            LIMIT ?`,
            
        BY_METHOD_NAME: `
            SELECT mc.*, om.path as filePath 
            FROM method_calls mc 
            LEFT JOIN objects om ON mc.object_name = om.name AND mc.object_type = om.type 
            WHERE mc.called_method LIKE ?
            ORDER BY mc.object_name, mc.source_location
            LIMIT ?`,
    },
    
    REFERENCES: {
        BY_OBJECT: `
            SELECT cr.*, om.path as filePath 
            FROM code_references cr 
            LEFT JOIN objects om ON cr.object_name = om.name AND cr.object_type = om.type 
            WHERE cr.referenced_object LIKE ?
            ORDER BY cr.object_name, cr.source_location
            LIMIT ?`,
            
        BY_TYPE: `
            SELECT cr.*, om.path as filePath 
            FROM code_references cr 
            LEFT JOIN objects om ON cr.object_name = om.name AND cr.object_type = om.type 
            WHERE cr.reference_type = ? AND cr.referenced_object LIKE ?
            ORDER BY cr.object_name, cr.source_location
            LIMIT ?`,
    },
    
    SOURCE_CODE: {
        SEARCH_CODE: `
            SELECT oc.*, om.path as filePath 
            FROM object_code oc 
            LEFT JOIN objects om ON oc.object_name = om.name AND oc.object_type = om.type 
            WHERE oc.source_code LIKE ?
            ORDER BY oc.object_name, oc.method_name
            LIMIT ?`,
            
        SEARCH_BY_METHOD: `
            SELECT oc.*, om.path as filePath 
            FROM object_code oc 
            LEFT JOIN objects om ON oc.object_name = om.name AND oc.object_type = om.type 
            WHERE oc.method_name LIKE ? AND oc.source_code LIKE ?
            ORDER BY oc.object_name, oc.method_name
            LIMIT ?`,
    },
    
    METADATA: {
        NEEDS_ANALYSIS: `
            SELECT o.* FROM objects o 
            LEFT JOIN indexing_metadata im ON o.name = im.object_name AND o.type = im.object_type AND o.model = im.object_model 
            WHERE im.id IS NULL 
               OR im.analysis_version != ? 
               OR im.analysis_status = 'error' 
               OR im.last_analyzed < ?
            LIMIT ?`,
            
        GET_STATS: `
            SELECT 
                COUNT(DISTINCT o.name || ':' || o.type || ':' || o.model) as totalObjects,
                COUNT(DISTINCT im.object_name || ':' || im.object_type || ':' || im.object_model) as analyzedObjects,
                COUNT(CASE WHEN im.analysis_status = 'completed' THEN 1 END) as completedObjects,
                COUNT(CASE WHEN im.analysis_status = 'error' THEN 1 END) as errorObjects,
                COUNT(DISTINCT mc.object_name || ':' || mc.object_type || ':' || mc.object_model) as objectsWithCalls,
                COUNT(mc.id) as totalMethodCalls,
                COUNT(cr.id) as totalReferences,
                COUNT(oc.id) as totalMethodsIndexed
            FROM objects o 
            LEFT JOIN indexing_metadata im ON o.name = im.object_name AND o.type = im.object_type AND o.model = im.object_model
            LEFT JOIN method_calls mc ON o.name = mc.object_name AND o.type = mc.object_type AND o.model = mc.object_model
            LEFT JOIN code_references cr ON o.name = cr.object_name AND o.type = cr.object_type AND o.model = cr.object_model  
            LEFT JOIN object_code oc ON o.name = oc.object_name AND o.type = oc.object_type AND o.model = oc.object_model`,
    }
};