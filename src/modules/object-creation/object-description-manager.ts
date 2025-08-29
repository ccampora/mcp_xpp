/**
 * Object Description Manager - Template-First Architecture
 * 
 * Manages loading and caching of object description files that contain
 * complete knowledge about each D365 object type including templates.
 * 
 * ARCHITECTURAL PRINCIPLE: Single Source of Truth per object type
 * Each *_description.json file contains ALL knowledge needed for that object type.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface ObjectDescription {
    objectType: string;
    metadata: {
        lastSynchronized: string;
        vs2022ExtensionVersion?: string;
        syncSource?: string;
        templateVersion: string;
    };
    structure: {
        elements: Record<string, any>;
        properties: Record<string, any>;
        validation: Record<string, any>;
    };
    templates?: {
        xml?: {
            metadata?: string;
            primary?: string;
        };
        xpp?: {
            class?: string;
            methods?: string;
        };
        project?: {
            references?: string;
        };
    };
    generation: {
        requiredParameters: string[];
        optionalParameters: string[];
        defaultValues: Record<string, any>;
        validationRules: Record<string, string>;
    };
    synchronization?: {
        powershellScript?: string;
        dependencies?: string[];
        frequency: string;
        lastSync?: string;
    };
    extensibility?: {
        customTemplates?: Record<string, any>;
        additionalProperties?: Record<string, any>;
        futureEnhancements?: Record<string, any>;
    };
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}

export interface ObjectParams {
    objectName: string;
    objectType: string;
    properties?: Record<string, any>;
    outputPath?: string;
    [key: string]: any;
}

export interface GeneratedFiles {
    files: Array<{
        path: string;
        content: string;
        type: 'xml' | 'xpp' | 'project' | 'metadata';
    }>;
    summary: {
        objectType: string;
        objectName: string;
        filesCount: number;
        executionTime: number;
    };
}

export class ObjectDescriptionManager {
    private descriptions = new Map<string, ObjectDescription>();
    private descriptionPath: string;
    private initialized = false;

    constructor(descriptionPath = 'config/object_descriptions') {
        this.descriptionPath = path.resolve(descriptionPath);
    }

    /**
     * Initialize the manager by scanning available description files
     * Performance target: <100ms for complete initialization
     */
    async initialize(): Promise<void> {
        const startTime = performance.now();

        try {
            console.log('🏛️ Initializing Template-First Object Description Manager...');
            
            // Scan description directory
            const files = await fs.readdir(this.descriptionPath);
            const descriptionFiles = files.filter(file => 
                file.endsWith('_description.json') && !file.startsWith('.')
            );

            console.log(`📁 Found ${descriptionFiles.length} object description files`);

            // Pre-load critical object types for performance
            const criticalTypes = ['AxClass', 'AxTable', 'AxForm', 'AxEnum'];
            let loadedCount = 0;

            for (const file of descriptionFiles) {
                const objectType = file.replace('_description.json', '');
                
                // Pre-load critical types immediately
                if (criticalTypes.some(critical => file.startsWith(critical))) {
                    try {
                        await this.loadDescription(objectType);
                        loadedCount++;
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.warn(`⚠️ Failed to pre-load ${objectType}: ${errorMsg}`);
                    }
                }
            }

            const executionTime = performance.now() - startTime;
            this.initialized = true;

            console.log(`✅ Template-First Architecture initialized in ${Math.round(executionTime)}ms`);
            console.log(`📊 Pre-loaded ${loadedCount} critical object types`);
            console.log(`🎯 Available object types: ${descriptionFiles.length}`);
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ Failed to initialize ObjectDescriptionManager:', error);
            throw new Error(`Initialization failed: ${errorMsg}`);
        }
    }

    /**
     * Load object description with caching
     * Performance target: <10ms for cached, <50ms for fresh load
     */
    async loadDescription(objectType: string): Promise<ObjectDescription> {
        // Check cache first
        if (this.descriptions.has(objectType)) {
            return this.descriptions.get(objectType)!;
        }

        const startTime = performance.now();
        const descriptionFile = path.join(this.descriptionPath, `${objectType}_description.json`);

        try {
            const content = await fs.readFile(descriptionFile, 'utf8');
            const description = JSON.parse(content) as ObjectDescription;

            // Ensure required structure
            this.validateDescriptionStructure(description);

            // Cache the description
            this.descriptions.set(objectType, description);

            const executionTime = performance.now() - startTime;
            console.log(`📖 Loaded ${objectType} description in ${Math.round(executionTime)}ms`);

            return description;
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
                throw new Error(`Object type '${objectType}' not found. Available types can be listed with get_current_config tool.`);
            }
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to load ${objectType} description: ${errorMsg}`);
        }
    }

    /**
     * Get all available object types
     */
    async getAvailableObjectTypes(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.descriptionPath);
            return files
                .filter(file => file.endsWith('_description.json'))
                .map(file => file.replace('_description.json', ''))
                .sort();
        } catch (error) {
            console.error('Failed to scan object descriptions:', error);
            return [];
        }
    }

    /**
     * Validate parameters against object description
     * Performance target: <5ms
     */
    validateParameters(description: ObjectDescription, params: ObjectParams): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required parameters
        for (const required of description.generation.requiredParameters) {
            if (!params[required] && params[required] !== 0) {
                errors.push(`Missing required parameter: ${required}`);
            }
        }

        // Validate parameter values against rules
        for (const [param, rule] of Object.entries(description.generation.validationRules)) {
            if (params[param]) {
                const regex = new RegExp(rule);
                if (!regex.test(String(params[param]))) {
                    errors.push(`Parameter '${param}' does not match pattern: ${rule}`);
                }
            }
        }

        // Check object name convention
        if (params.objectName && !/^[A-Z][A-Za-z0-9_]*$/.test(params.objectName)) {
            warnings.push('Object name should follow D365 naming convention: PascalCase starting with uppercase letter');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Apply default values from description
     */
    applyDefaults(description: ObjectDescription, params: ObjectParams): ObjectParams {
        const result = { ...params };

        // Apply default values
        for (const [param, defaultValue] of Object.entries(description.generation.defaultValues)) {
            if (result[param] === undefined) {
                result[param] = defaultValue;
            }
        }

        return result;
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { cached: number; available: number; hitRate: string } {
        return {
            cached: this.descriptions.size,
            available: 553, // Total known object types
            hitRate: `${Math.round((this.descriptions.size / 553) * 100)}%`
        };
    }

    /**
     * Clear cache (useful for development/testing)
     */
    clearCache(): void {
        this.descriptions.clear();
        console.log('🗑️ Object description cache cleared');
    }

    /**
     * Validate description file structure
     */
    private validateDescriptionStructure(description: ObjectDescription): void {
        if (!description.objectType) {
            throw new Error(`Invalid description structure: missing 'objectType' field`);
        }
        
        if (!description.structure) {
            throw new Error(`Invalid description structure: missing 'structure' field`);
        }
        
        if (!description.generation) {
            throw new Error(`Invalid description structure: missing 'generation' field`);
        }

        if (!description.generation.requiredParameters || !Array.isArray(description.generation.requiredParameters)) {
            throw new Error('Invalid description structure: generation.requiredParameters must be an array');
        }

        if (!description.generation.optionalParameters || !Array.isArray(description.generation.optionalParameters)) {
            throw new Error('Invalid description structure: generation.optionalParameters must be an array');
        }
    }

    /**
     * Check if manager is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}
