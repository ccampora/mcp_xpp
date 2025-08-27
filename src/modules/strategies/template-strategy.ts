/**
 * Template-Based D365 Object Creation Strategy
 * 
 * Uses XML templates and the existing AOTStructureManager to create D365 objects.
 * This strategy ports the existing template-based model creation functionality
 * and provides fallback capabilities for objects not supported by other strategies.
 */

import { promises as fs } from "fs";
import { join } from "path";
import { 
  D365ObjectCreationStrategy, 
  D365ObjectOptions, 
  D365ObjectResult,
  StrategyCapabilities 
} from './interfaces.js';
import { AOTStructureManager } from '../aot-structure.js';
import { AppConfig } from '../app-config.js';
import { DiskLogger } from '../logger.js';

/**
 * Strategy that uses XML templates for D365 object creation
 */
export class TemplateStrategy implements D365ObjectCreationStrategy {
  private capabilities: StrategyCapabilities = {
    name: 'template',
    description: 'XML template-based object creation using AOTStructureManager',
    supportedObjectTypes: ['model'], // Will be expanded based on available templates
    requiresExternalDependencies: false,
    performance: {
      averageCreationTime: 500,
      memoryUsage: 'low',
      cpuUsage: 'low'
    },
    priority: 20 // Lower priority than Microsoft API strategy
  };

  constructor() {
    this.initializeCapabilities();
  }

  /**
   * Initialize capabilities based on available templates
   */
  private async initializeCapabilities(): Promise<void> {
    try {
      const availableObjectTypes = await AOTStructureManager.getAvailableObjectTypes();
      this.capabilities.supportedObjectTypes = availableObjectTypes;
      await DiskLogger.logDebug(`Template strategy supports: ${availableObjectTypes.join(', ')}`);
    } catch (error) {
      await DiskLogger.logError(error, 'Failed to initialize template strategy capabilities');
      // Keep default capabilities on error
    }
  }

  /**
   * Get strategy capabilities and metadata
   */
  getCapabilities(): StrategyCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if this strategy can handle the given object type
   */
  canHandle(objectType: string, options?: D365ObjectOptions): boolean {
    return this.capabilities.supportedObjectTypes.includes(objectType.toLowerCase());
  }

  /**
   * Validate that the strategy is properly configured and ready to use
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if metadata folder is configured
      const metadataPath = AppConfig.getXppMetadataFolder();
      if (!metadataPath) {
        await DiskLogger.logDebug('Template strategy unavailable: No XppMetadataFolder configured');
        return false;
      }

      // Check if AOTStructureManager can load structure
      await AOTStructureManager.loadStructure();
      const structure = AOTStructureManager.getRawStructure();
      if (!structure) {
        await DiskLogger.logDebug('Template strategy unavailable: AOT structure not loaded');
        return false;
      }

      // Try to get model templates
      const templates = await AOTStructureManager.getObjectTemplates();
      if (!templates) {
        await DiskLogger.logDebug('Template strategy unavailable: Object templates not available');
        return false;
      }

      await DiskLogger.logDebug('Template strategy is available');
      return true;
    } catch (error) {
      await DiskLogger.logError(error, 'Template strategy availability check failed');
      return false;
    }
  }

  /**
   * Create a D365 object using template-based approach
   */
  async createObject(options: D365ObjectOptions): Promise<D365ObjectResult> {
    const startTime = Date.now();
    const { objectName, objectType, layer = 'usr', publisher = 'YourCompany', version = '1.0.0.0', dependencies = ['ApplicationPlatform', 'ApplicationFoundation'], outputPath = 'Models' } = options;

    try {
      await DiskLogger.logDebug(`Creating ${objectType} '${objectName}' using template strategy`);

      // Route to appropriate creation method based on object type
      let content: string;
      let filePaths: string[] = [];

      switch (objectType.toLowerCase()) {
        case 'model':
          const result = await this.createModel(objectName, {
            layer,
            publisher,
            version,
            dependencies,
            outputPath
          });
          content = result.content;
          filePaths = result.filePaths;
          break;
          
        case 'class':
          content = await this.createClass(objectName, { layer, outputPath });
          break;
          
        case 'table':
          content = await this.createTable(objectName, { layer, outputPath });
          break;
          
        case 'enum':
          content = await this.createEnum(objectName, { layer, outputPath });
          break;
          
        case 'form':
          content = await this.createForm(objectName, { layer, outputPath });
          break;
          
        default:
          throw new Error(`Template strategy does not support object type: ${objectType}`);
      }

      const executionTime = Date.now() - startTime;
      await DiskLogger.logDebug(`Template object creation completed in ${executionTime}ms`);

      return {
        success: true,
        message: content,
        filePaths,
        content,
        strategy: this.capabilities.name,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await DiskLogger.logError(error, 'Template object creation failed');

      return {
        success: false,
        message: `Template creation failed: ${errorMessage}`,
        strategy: this.capabilities.name,
        executionTime,
        error: {
          code: 'TEMPLATE_CREATION_FAILED',
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Get configuration requirements for this strategy
   */
  getConfigurationRequirements(): string[] {
    return [
      'xppMetadataFolder - Path to writable X++ metadata folder',
      'AOT structure configuration in config/aot-structure.json',
      'Object templates in config/d365-object-templates.json'
    ];
  }

  /**
   * Validate the provided options for this strategy
   */
  async validateOptions(options: D365ObjectOptions): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!options.objectName || options.objectName.trim() === '') {
      errors.push('Object name is required');
    }

    if (!options.objectType || options.objectType.trim() === '') {
      errors.push('Object type is required');
    }

    if (options.objectType && !this.canHandle(options.objectType, options)) {
      errors.push(`Object type '${options.objectType}' is not supported by template strategy`);
    }

    // Validate object name format (basic validation)
    if (options.objectName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.objectName)) {
      errors.push('Object name must be a valid identifier (letters, numbers, underscore, must start with letter or underscore)');
    }

    // Check that metadata folder is configured
    const metadataPath = AppConfig.getXppMetadataFolder();
    if (!metadataPath) {
      errors.push('X++ metadata folder not configured. Use --xpp-metadata-folder argument when starting the server.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a model using the existing template-based approach
   */
  private async createModel(modelName: string, options: {
    layer?: string;
    publisher: string;
    version: string;
    dependencies: string[];
    outputPath: string;
  }): Promise<{ content: string; filePaths: string[] }> {
    const { layer = "usr", publisher, version, dependencies, outputPath } = options;
    
    // Use the writable metadata folder, not the read-only codebase path
    const metadataPath = AppConfig.getXppMetadataFolder();
    if (!metadataPath) {
      throw new Error("X++ metadata folder not configured. Use --xpp-metadata-folder argument when starting the server.");
    }
    
    const fullOutputPath = join(metadataPath, modelName);
    const filePaths: string[] = [];
    
    try {
      // Create directory structure
      await fs.mkdir(fullOutputPath, { recursive: true });
      await fs.mkdir(join(fullOutputPath, "XppMetadata"), { recursive: true });
      await fs.mkdir(join(fullOutputPath, "XppSource"), { recursive: true });
      await fs.mkdir(join(fullOutputPath, "Descriptor"), { recursive: true });
      
      // Generate model descriptor XML using template system
      const descriptorXml = await AOTStructureManager.generateModelDescriptorXml({
        modelName,
        layer: layer.toUpperCase(),
        publisher,
        version,
        dependencies
      });
      
      // Write descriptor file
      const descriptorPath = join(fullOutputPath, "Descriptor", `${modelName}.xml`);
      await fs.writeFile(descriptorPath, descriptorXml, 'utf8');
      filePaths.push(descriptorPath);
      
      // Create basic AOT folder structure in XppMetadata
      const aotFolders = [
        "Classes", "Tables", "Forms", "Reports", "Enums", "ExtendedDataTypes",
        "Views", "Maps", "Services", "Workflows", "Queries", "Menus", "MenuItems"
      ];
      
      for (const folder of aotFolders) {
        await fs.mkdir(join(fullOutputPath, "XppMetadata", folder), { recursive: true });
        await fs.mkdir(join(fullOutputPath, "XppSource", folder), { recursive: true });
      }
      
      const content = `Successfully created model: ${modelName}

Location: ${fullOutputPath}

Model Details:
- Publisher: ${publisher}
- Version: ${version}
- Layer: ${layer.toUpperCase()}
- Dependencies: ${dependencies.join(', ')}

Created Structure:
✓ Descriptor/${modelName}.xml - Model descriptor with dependencies
✓ XppMetadata/ - Folder for compiled metadata
✓ XppSource/ - Folder for X++ source files
✓ AOT folder structure for all object types

The model is ready for development. Add your X++ objects to the appropriate folders.`;
      
      return { content, filePaths };
      
    } catch (error) {
      throw new Error(`Failed to create model structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a class using templates (placeholder - to be implemented)
   */
  private async createClass(className: string, options: { layer?: string; outputPath: string }): Promise<string> {
    // TODO: Implement class creation using templates
    return `Class creation for ${className} not yet implemented in template strategy. Layer: ${options.layer || 'usr'}`;
  }

  /**
   * Create a table using templates (placeholder - to be implemented)
   */
  private async createTable(tableName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    // TODO: Implement table creation using templates
    return `Table creation for ${tableName} not yet implemented in template strategy. Layer: ${options.layer || 'usr'}`;
  }

  /**
   * Create an enum using templates (placeholder - to be implemented)
   */
  private async createEnum(enumName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    // TODO: Implement enum creation using templates
    return `Enum creation for ${enumName} not yet implemented in template strategy. Layer: ${options.layer || 'usr'}`;
  }

  /**
   * Create a form using templates (placeholder - to be implemented)
   */
  private async createForm(formName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    // TODO: Implement form creation using templates
    return `Form creation for ${formName} not yet implemented in template strategy. Layer: ${options.layer || 'usr'}`;
  }
}