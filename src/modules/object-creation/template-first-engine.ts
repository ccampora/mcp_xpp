/**
 * Template-First Engine - Core Object Creation Engine
 * 
 * High-performance template-based object creation engine.
 * Performance target: <100ms per object creation using templates only.
 * 
 * ARCHITECTURAL PRINCIPLE: Templates over API calls
 * This engine creates D365 objects using pre-defined templates without
 * requiring any external API calls or dependencies.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { 
    ObjectDescription, 
    ObjectParams, 
    GeneratedFiles, 
    ValidationResult,
    ObjectDescriptionManager 
} from './object-description-manager.js';

export interface TemplateContext {
    objectName: string;
    objectType: string;
    properties: Record<string, any>;
    timestamp: string;
    generator: string;
    [key: string]: any;
}

export interface ObjectCreationResult {
    success: boolean;
    objectType: string;
    objectName: string;
    filesGenerated?: string[];
    executionTime: number;
    strategy: string;
    metadata?: Record<string, any>;
    error?: string;
    troubleshooting?: string[];
}

/**
 * Template-First Engine - Primary strategy for object creation
 * Performance: 50-100ms per object (excellent UX)
 */
export class TemplateFirstEngine {
    private descriptionManager: ObjectDescriptionManager;
    private compiledTemplates = new Map<string, Handlebars.TemplateDelegate>();
    private initialized = false;

    constructor(descriptionManager: ObjectDescriptionManager) {
        this.descriptionManager = descriptionManager;
        this.setupHandlebarsHelpers();
    }

    /**
     * Initialize the template engine
     */
    async initialize(): Promise<void> {
        if (!this.descriptionManager.isInitialized()) {
            await this.descriptionManager.initialize();
        }
        
        this.initialized = true;
        console.log('🎯 Template-First Engine initialized');
    }

    /**
     * Create object using template-first approach
     * Performance target: <100ms
     */
    async createObject(params: ObjectParams): Promise<ObjectCreationResult> {
        const startTime = performance.now();
        
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            console.log(`🏗️ Creating ${params.objectType} '${params.objectName}' using Template-First strategy...`);

            // Load object description
            const description = await this.descriptionManager.loadDescription(params.objectType);
            
            // Apply defaults
            const normalizedParams = this.descriptionManager.applyDefaults(description, params);
            
            // Validate parameters
            const validation = this.descriptionManager.validateParameters(description, normalizedParams);
            if (!validation.valid) {
                return {
                    success: false,
                    objectType: params.objectType,
                    objectName: params.objectName,
                    executionTime: performance.now() - startTime,
                    strategy: 'template-first',
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    troubleshooting: [
                        'Check required parameters',
                        'Verify parameter naming conventions',
                        'Use get_current_config tool to see object requirements'
                    ]
                };
            }

            // Generate files from templates
            const generatedFiles = await this.generateFromTemplates(description, normalizedParams);
            
            // Write files to disk
            const writtenFiles = await this.writeFiles(generatedFiles, normalizedParams.outputPath || './output');

            const executionTime = performance.now() - startTime;
            
            console.log(`✅ ${params.objectType} '${params.objectName}' created in ${Math.round(executionTime)}ms`);
            
            return {
                success: true,
                objectType: params.objectType,
                objectName: params.objectName,
                filesGenerated: writtenFiles,
                executionTime: Math.round(executionTime),
                strategy: 'template-first',
                metadata: {
                    validation: validation.warnings || [],
                    filesCount: writtenFiles.length,
                    templateVersion: description.metadata.templateVersion
                }
            };

        } catch (error) {
            const executionTime = performance.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            console.error(`❌ Template-First creation failed: ${errorMsg}`);
            
            return {
                success: false,
                objectType: params.objectType,
                objectName: params.objectName,
                executionTime: Math.round(executionTime),
                strategy: 'template-first',
                error: errorMsg,
                troubleshooting: [
                    'Check if object type is supported',
                    'Verify description file exists',
                    'Ensure output directory is writable'
                ]
            };
        }
    }

    /**
     * Generate files from templates in description
     */
    private async generateFromTemplates(description: ObjectDescription, params: ObjectParams): Promise<GeneratedFiles> {
        const files: Array<{ path: string; content: string; type: 'xml' | 'xpp' | 'project' | 'metadata' }> = [];
        
        // Create template context
        const context: TemplateContext = {
            ...params,
            objectName: params.objectName,
            objectType: params.objectType,
            properties: params.properties || {},
            timestamp: new Date().toISOString(),
            generator: 'MCP X++ Server - Template-First Engine'
        };

        // Generate XML metadata if template exists
        if (description.templates?.xml?.metadata) {
            const content = await this.renderTemplate(description.templates.xml.metadata, context);
            files.push({
                path: `${params.objectName}.xml`,
                content,
                type: 'xml'
            });
        }

        // Generate primary XML if template exists  
        if (description.templates?.xml?.primary) {
            const content = await this.renderTemplate(description.templates.xml.primary, context);
            files.push({
                path: `${params.objectName}_primary.xml`,
                content,
                type: 'xml'
            });
        }

        // Generate XPP class file if template exists
        if (description.templates?.xpp?.class) {
            const content = await this.renderTemplate(description.templates.xpp.class, context);
            files.push({
                path: `${params.objectName}.xpp`,
                content,
                type: 'xpp'
            });
        }

        // Generate XPP methods if template exists
        if (description.templates?.xpp?.methods) {
            const content = await this.renderTemplate(description.templates.xpp.methods, context);
            files.push({
                path: `${params.objectName}_methods.xpp`,
                content,
                type: 'xpp'
            });
        }

        // Generate project references if template exists
        if (description.templates?.project?.references) {
            const content = await this.renderTemplate(description.templates.project.references, context);
            files.push({
                path: `${params.objectName}.project`,
                content,
                type: 'project'
            });
        }

        // If no templates exist in description, generate basic templates
        if (files.length === 0) {
            files.push(...await this.generateBasicTemplates(description, context));
        }

        return {
            files,
            summary: {
                objectType: params.objectType,
                objectName: params.objectName,
                filesCount: files.length,
                executionTime: 0 // Will be set by caller
            }
        };
    }

    /**
     * Generate basic templates when description doesn't have templates yet
     */
    private async generateBasicTemplates(description: ObjectDescription, context: TemplateContext): Promise<Array<{ path: string; content: string; type: 'xml' | 'xpp' | 'project' | 'metadata' }>> {
        const files: Array<{ path: string; content: string; type: 'xml' | 'xpp' | 'project' | 'metadata' }> = [];
        
        // Basic XML metadata template
        const xmlContent = this.generateBasicXml(context, description);
        files.push({
            path: `${context.objectName}.xml`,
            content: xmlContent,
            type: 'xml'
        });

        // Basic XPP template for classes
        if (context.objectType.toLowerCase().includes('class')) {
            const xppContent = this.generateBasicClass(context);
            files.push({
                path: `${context.objectName}.xpp`,
                content: xppContent,
                type: 'xpp'
            });
        }

        return files;
    }

    /**
     * Render template with context using Handlebars
     */
    private async renderTemplate(template: string, context: TemplateContext): Promise<string> {
        const templateKey = this.hashTemplate(template);
        
        // Check compiled template cache
        let compiledTemplate = this.compiledTemplates.get(templateKey);
        
        if (!compiledTemplate) {
            compiledTemplate = Handlebars.compile(template);
            this.compiledTemplates.set(templateKey, compiledTemplate);
        }
        
        return compiledTemplate(context);
    }

    /**
     * Write generated files to disk
     */
    private async writeFiles(generatedFiles: GeneratedFiles, outputPath: string): Promise<string[]> {
        const writtenFiles: string[] = [];
        
        // Ensure output directory exists
        await fs.mkdir(outputPath, { recursive: true });
        
        for (const file of generatedFiles.files) {
            const fullPath = path.join(outputPath, file.path);
            
            // Ensure subdirectory exists
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            
            // Write file
            await fs.writeFile(fullPath, file.content, 'utf8');
            writtenFiles.push(fullPath);
        }
        
        return writtenFiles;
    }

    /**
     * Generate basic XML metadata
     */
    private generateBasicXml(context: TemplateContext, description: ObjectDescription): string {
        return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by ${context.generator} -->
<!-- Timestamp: ${context.timestamp} -->
<AxMetadata>
  <${context.objectType}>
    <Name>${context.objectName}</Name>
    <ObjectType>${context.objectType}</ObjectType>
    <CreatedBy>MCP_XPP_Server</CreatedBy>
    <CreatedDateTime>${context.timestamp}</CreatedDateTime>
    <Properties>
      ${Object.entries(context.properties || {}).map(([key, value]) => 
        `<${key}>${value}</${key}>`
      ).join('\n      ')}
    </Properties>
  </${context.objectType}>
</AxMetadata>`;
    }

    /**
     * Generate basic class XPP code
     */
    private generateBasicClass(context: TemplateContext): string {
        const className = context.objectName;
        const extendsClause = context.properties?.extends ? ` extends ${context.properties.extends}` : '';
        
        return `/// <summary>
/// ${className} - Generated by MCP X++ Server Template-First Engine
/// Created: ${context.timestamp}
/// </summary>
public class ${className}${extendsClause}
{
    /// <summary>
    /// Constructor for ${className}
    /// </summary>
    public void new()
    {
        super();
        // TODO: Add initialization code
    }

    /// <summary>
    /// Main method for ${className}
    /// </summary>
    public static void main(Args _args)
    {
        ${className} instance = new ${className}();
        // TODO: Add main method implementation
    }
}`;
    }

    /**
     * Setup Handlebars helpers for D365-specific formatting
     */
    private setupHandlebarsHelpers(): void {
        // Helper for PascalCase formatting
        Handlebars.registerHelper('pascalCase', function(str: string) {
            if (!str) return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        });

        // Helper for camelCase formatting
        Handlebars.registerHelper('camelCase', function(str: string) {
            if (!str) return '';
            return str.charAt(0).toLowerCase() + str.slice(1);
        });

        // Helper for timestamp formatting
        Handlebars.registerHelper('timestamp', function() {
            return new Date().toISOString();
        });

        // Helper for D365 XML element formatting
        Handlebars.registerHelper('xmlElement', function(name: string, value: any) {
            if (value === null || value === undefined) return '';
            return `<${name}>${value}</${name}>`;
        });

        // Helper for conditional content
        Handlebars.registerHelper('ifEquals', function(this: any, arg1: any, arg2: any, options: any) {
            return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
        });
    }

    /**
     * Create hash for template caching
     */
    private hashTemplate(template: string): string {
        // Simple hash function for template caching
        let hash = 0;
        for (let i = 0; i < template.length; i++) {
            const char = template.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    /**
     * Get template cache statistics
     */
    getTemplateStats(): { compiled: number; hitRate: string } {
        return {
            compiled: this.compiledTemplates.size,
            hitRate: 'N/A' // Would need to track hits vs misses
        };
    }

    /**
     * Clear template cache
     */
    clearTemplateCache(): void {
        this.compiledTemplates.clear();
        console.log('🗑️ Template cache cleared');
    }
}
