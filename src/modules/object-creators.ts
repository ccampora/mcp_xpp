import { promises as fs } from "fs";
import { join } from "path";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { D365ServiceClient } from "./d365-service-client.js";
import { DiskLogger } from "./logger.js";

/**
 * Object creation handlers for different D365 object types
 * 
 * This class uses direct VS2022 extension integration for object creation,
 * maintaining backward compatibility with existing MCP tool interfaces.
 */
export class ObjectCreators {
  /**
   * Get VS2022 service client
   */
  private static getServiceClient(timeoutMs: number = 10000): D365ServiceClient {
    return new D365ServiceClient('mcp-xpp-d365-service', timeoutMs, timeoutMs);
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
}
