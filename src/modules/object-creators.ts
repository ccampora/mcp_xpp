import { promises as fs } from "fs";
import { join } from "path";
import { AppConfig } from "./app-config.js";
import { AOTStructureManager } from "./aot-structure.js";
import { 
  D365ObjectCreationManager, 
  createDefaultStrategyManager, 
  D365ObjectOptions,
  StrategySelectionCriteria
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
      
      // Get configuration from AppConfig
      const preferredStrategy = AppConfig.getObjectCreationStrategy();
      const enableFallback = AppConfig.isStrategyFallbackEnabled();
      const strategyTimeout = AppConfig.getStrategyTimeout();
      const verboseLogging = AppConfig.isVerboseStrategyLoggingEnabled();
      
      // Determine fallback order based on preferred strategy
      let fallbackOrder: string[] = ['template', 'microsoft-api', 'custom']; // Default order
      if (preferredStrategy && preferredStrategy !== 'auto') {
        // Put preferred strategy first, then others
        fallbackOrder = [preferredStrategy, ...fallbackOrder.filter(s => s !== preferredStrategy)];
      }
      
      this.strategyManager = await createDefaultStrategyManager({
        defaultStrategy: preferredStrategy && preferredStrategy !== 'auto' ? preferredStrategy : undefined,
        enableAutoFallback: enableFallback,
        selectionTimeoutMs: strategyTimeout,
        cacheAvailabilityChecks: true,
        fallbackOrder: fallbackOrder
      });
      
      if (verboseLogging) {
        await DiskLogger.logDebug(`Strategy manager initialized with preferences: strategy=${preferredStrategy}, fallback=${enableFallback}, timeout=${strategyTimeout}ms`);
      }
    }
    return this.strategyManager!; // Non-null assertion since we just created it
  }

  /**
   * Create selection criteria based on app configuration
   */
  private static createSelectionCriteria(objectType: string): StrategySelectionCriteria {
    return {
      preferredStrategy: AppConfig.getObjectCreationStrategy(),
      objectType: objectType,
      enableFallback: AppConfig.isStrategyFallbackEnabled(),
      timeoutMs: AppConfig.getStrategyTimeout()
    };
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

      // Create selection criteria based on app configuration
      const selectionCriteria = this.createSelectionCriteria('model');

      const result = await manager.createObject(objectOptions, selectionCriteria);
      
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

      const selectionCriteria = this.createSelectionCriteria('class');
      const result = await manager.createObject(objectOptions, selectionCriteria);
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

      const selectionCriteria = this.createSelectionCriteria('table');
      const result = await manager.createObject(objectOptions, selectionCriteria);
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

      const selectionCriteria = this.createSelectionCriteria('enum');
      const result = await manager.createObject(objectOptions, selectionCriteria);
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
