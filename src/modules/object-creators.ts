import { promises as fs } from "fs";
import { join } from "path";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { D365ServiceClient } from "./d365-service-client.js";
import { DiskLogger } from "./logger.js";

/**
 * Object creation handlers for different D365 object types
 * 
 * This class uses direct VS2022 extension integration for object creation.
 */
export class ObjectCreators {
  /**
   * Get VS2022 service client
   */
  private static getServiceClient(timeoutMs: number = 10000): D365ServiceClient {
    return new D365ServiceClient('mcp-xpp-d365-service', timeoutMs, timeoutMs);
  }

  /**
   * Create any D365 object type using VS2022 service (supports all 544+ object types)
   */
  static async createGenericObject(objectType: string, objectName: string, options: {
    layer?: string;
    publisher?: string;
    version?: string;
    dependencies?: string[];
    outputPath?: string;
    properties?: Record<string, any>;
  }): Promise<string> {
    try {
      const client = this.getServiceClient();
      await client.connect();
      
      // Build parameters dynamically based on object type and options
      const parameters: Record<string, any> = {
        ObjectName: objectName,
        OutputPath: options.outputPath || 'Models',
        Layer: options.layer || 'usr'
      };

      // Add optional parameters if provided
      if (options.publisher) parameters.Publisher = options.publisher;
      if (options.version) parameters.Version = options.version;
      if (options.dependencies) parameters.Dependencies = options.dependencies;
      if (options.properties) {
        // Merge custom properties
        Object.assign(parameters, options.properties);
      }
      
      const result = await client.createObject(objectType, parameters);
      
      await client.disconnect();
      
      if (result.Success) {
        return `${objectType} '${objectName}' created successfully`;
      } else {
        return `ERROR: ${objectType} creation for ${objectName} failed: ${result.Message || 'Unknown error'}`;
      }
    } catch (error) {
      await DiskLogger.logError(error, `${objectType} creation failed`);
      return `ERROR: ${objectType} creation for ${objectName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
  
  /**
   * Create a model with all required structure using VS2022 service
   */
  static async createModel(modelName: string, options: {
    layer?: string;
    publisher: string;
    version: string;
    dependencies: string[];
    outputPath: string;
  }): Promise<string> {
    try {
      const client = this.getServiceClient();
      await client.connect();
      
      const result = await client.createObject('AxModel', {
        ObjectName: modelName,
        Publisher: options.publisher,
        Version: options.version,
        Dependencies: options.dependencies,
        OutputPath: options.outputPath,
        Layer: options.layer || 'usr'
      });
      
      await client.disconnect();
      
      if (result.Success) {
        return `Model '${modelName}' created successfully`;
      } else {
        throw new Error(result.Message || 'Model creation failed');
      }
    } catch (error) {
      await DiskLogger.logError(error, 'Model creation failed');
      throw new Error(`Failed to create model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a class using VS2022 service
   */
  static async createClass(className: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const client = this.getServiceClient();
      await client.connect();
      
      const result = await client.createObject('AxClass', {
        ObjectName: className,
        OutputPath: options.outputPath,
        Layer: options.layer || 'usr'
      });
      
      await client.disconnect();
      
      if (result.Success) {
        return `Class '${className}' created successfully`;
      } else {
        return `ERROR: Class creation for ${className} failed: ${result.Message || 'Unknown error'}`;
      }
    } catch (error) {
      await DiskLogger.logError(error, 'Class creation failed');
      return `ERROR: Class creation for ${className} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Create a table using VS2022 service
   */
  static async createTable(tableName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const client = this.getServiceClient();
      await client.connect();
      
      const result = await client.createObject('AxTable', {
        ObjectName: tableName,
        OutputPath: options.outputPath,
        Layer: options.layer || 'usr'
      });
      
      await client.disconnect();
      
      if (result.Success) {
        return `Table '${tableName}' created successfully`;
      } else {
        return `ERROR: Table creation for ${tableName} failed: ${result.Message || 'Unknown error'}`;
      }
    } catch (error) {
      await DiskLogger.logError(error, 'Table creation failed');
      return `ERROR: Table creation for ${tableName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Create an enum using VS2022 service
   */
  static async createEnum(enumName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const client = this.getServiceClient();
      await client.connect();
      
      const result = await client.createObject('AxEnum', {
        ObjectName: enumName,
        OutputPath: options.outputPath,
        Layer: options.layer || 'usr'
      });
      
      await client.disconnect();
      
      if (result.Success) {
        return `Enum '${enumName}' created successfully`;
      } else {
        return `ERROR: Enum creation for ${enumName} failed: ${result.Message || 'Unknown error'}`;
      }
    } catch (error) {
      await DiskLogger.logError(error, 'Enum creation failed');
      return `ERROR: Enum creation for ${enumName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Create a form using VS2022 service
   */
  static async createForm(formName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const client = this.getServiceClient();
      await client.connect();
      
      const result = await client.createObject('AxForm', {
        ObjectName: formName,
        OutputPath: options.outputPath,
        Layer: options.layer || 'usr'
      });
      
      await client.disconnect();
      
      if (result.Success) {
        return `Form '${formName}' created successfully`;
      } else {
        return `ERROR: Form creation for ${formName} failed: ${result.Message || 'Unknown error'}`;
      }
    } catch (error) {
      await DiskLogger.logError(error, 'Form creation failed');
      return `ERROR: Form creation for ${formName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Discover available parameters for a specific D365 object type
   */
  static async discoverParameters(objectType: string): Promise<{
    success: boolean;
    schema?: any;
    errorMessage?: string;
    discoveryTime?: string;
  }> {
    try {
      const client = this.getServiceClient(15000); // Longer timeout for discovery
      await client.connect();
      
      const result = await client.createObject(objectType, {
        discoverParameters: true
      });
      
      await client.disconnect();
      
      if (result.Success) {
        return {
          success: true,
          schema: result.Data,
          discoveryTime: result.ExecutionTime || '0ms'
        };
      } else {
        return {
          success: false,
          errorMessage: result.Message || 'Parameter discovery failed'
        };
      }
    } catch (error) {
      await DiskLogger.logError(error, `Parameter discovery failed for ${objectType}`);
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
