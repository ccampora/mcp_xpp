import { promises as fs } from "fs";
import { join } from "path";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";

/**
 * Object creation handlers for different D365 object types
 */
export class ObjectCreators {
  
  /**
   * Create a model with all required structure
   */
  static async createModel(modelName: string, options: {
    layer?: string;
    publisher: string;
    version: string;
    dependencies: string[];
    outputPath: string;
  }): Promise<string> {
    const { layer = "usr", publisher, version, dependencies, outputPath } = options;
    
    // Use the writable metadata folder, not the read-only codebase path
    const metadataPath = AppConfig.getXppMetadataFolder();
    if (!metadataPath) {
      throw new Error("X++ metadata folder not configured. Use --xpp-metadata-folder argument when starting the server.");
    }
    
    const fullOutputPath = join(metadataPath, modelName);
    
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
      await fs.writeFile(join(fullOutputPath, "Descriptor", `${modelName}.xml`), descriptorXml, 'utf8');
      
      // Create basic AOT folder structure in XppMetadata
      const aotFolders = [
        "Classes", "Tables", "Forms", "Reports", "Enums", "ExtendedDataTypes",
        "Views", "Maps", "Services", "Workflows", "Queries", "Menus", "MenuItems"
      ];
      
      for (const folder of aotFolders) {
        await fs.mkdir(join(fullOutputPath, "XppMetadata", folder), { recursive: true });
        await fs.mkdir(join(fullOutputPath, "XppSource", folder), { recursive: true });
      }
      
      return `Successfully created model: ${modelName}

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
      
    } catch (error) {
      throw new Error(`Failed to create model structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a class (placeholder implementation)
   */
  static async createClass(className: string, options: { layer?: string; outputPath: string }): Promise<string> {
    return `Class creation for ${className} not yet implemented. Layer: ${options.layer || 'usr'}`;
  }

  /**
   * Create a table (placeholder implementation)
   */
  static async createTable(tableName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    return `Table creation for ${tableName} not yet implemented. Layer: ${options.layer || 'usr'}`;
  }

  /**
   * Create an enum (placeholder implementation)
   */
  static async createEnum(enumName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    return `Enum creation for ${enumName} not yet implemented. Layer: ${options.layer || 'usr'}`;
  }
}
