import { promises as fs } from "fs";
import { join } from "path";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { 
  D365ObjectCreationManager, 
  createDefaultStrategyManager, 
  D365ObjectOptions 
} from "./strategies/index.js";
import { DiskLogger } from "./logger.js";

/**
 * Object creation handlers for different D365 object types
 * 
 * This class now uses the Strategy Pattern for flexible object creation
 * while maintaining backward compatibility with existing MCP tool interfaces.
 */
export class ObjectCreators {
  private static strategyManager: D365ObjectCreationManager | null = null;

  /**
   * Get or create the strategy manager instance
   */
  private static async getStrategyManager(): Promise<D365ObjectCreationManager> {
    if (!this.strategyManager) {
      await DiskLogger.logDebug('Initializing D365 object creation strategy manager');
      this.strategyManager = await createDefaultStrategyManager({
        enableAutoFallback: true,
        selectionTimeoutMs: 10000,
        cacheAvailabilityChecks: true
      });
    }
    return this.strategyManager!; // Non-null assertion since we just created it
  }
  
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
    try {
      const manager = await this.getStrategyManager();
      
      const objectOptions: D365ObjectOptions = {
        objectName: modelName,
        objectType: 'model',
        layer: options.layer,
        publisher: options.publisher,
        version: options.version,
        dependencies: options.dependencies,
        outputPath: options.outputPath
      };

      const result = await manager.createObject(objectOptions);
      
      if (result.success) {
        return result.message;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      await DiskLogger.logError(error, 'Model creation failed');
      throw new Error(`Failed to create model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a class using the strategy pattern
   */
  static async createClass(className: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const manager = await this.getStrategyManager();
      
      const objectOptions: D365ObjectOptions = {
        objectName: className,
        objectType: 'class',
        layer: options.layer,
        outputPath: options.outputPath
      };

      const result = await manager.createObject(objectOptions);
      return result.message;
    } catch (error) {
      await DiskLogger.logError(error, 'Class creation failed');
      return `Class creation for ${className} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Create a table using the strategy pattern
   */
  static async createTable(tableName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const manager = await this.getStrategyManager();
      
      const objectOptions: D365ObjectOptions = {
        objectName: tableName,
        objectType: 'table',
        layer: options.layer,
        outputPath: options.outputPath
      };

      const result = await manager.createObject(objectOptions);
      return result.message;
    } catch (error) {
      await DiskLogger.logError(error, 'Table creation failed');
      return `Table creation for ${tableName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Create an enum using the strategy pattern
   */
  static async createEnum(enumName: string, options: { layer?: string; outputPath: string }): Promise<string> {
    try {
      const manager = await this.getStrategyManager();
      
      const objectOptions: D365ObjectOptions = {
        objectName: enumName,
        objectType: 'enum',
        layer: options.layer,
        outputPath: options.outputPath
      };

      const result = await manager.createObject(objectOptions);
      return result.message;
    } catch (error) {
      await DiskLogger.logError(error, 'Enum creation failed');
      return `Enum creation for ${enumName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Get strategy manager status and diagnostics
   */
  static async getStrategyStatus() {
    try {
      const manager = await this.getStrategyManager();
      return await manager.getStrategyStatus();
    } catch (error) {
      await DiskLogger.logError(error, 'Failed to get strategy status');
      return {
        error: 'Failed to get strategy status',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
