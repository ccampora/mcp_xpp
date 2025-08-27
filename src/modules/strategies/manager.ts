/**
 * D365 Object Creation Strategy Manager
 * 
 * Orchestrates strategy selection, registration, and execution for D365 object creation.
 * Provides intelligent strategy selection with configurable fallback chains.
 */

import { 
  D365ObjectCreationStrategy, 
  D365ObjectOptions, 
  D365ObjectResult, 
  StrategySelectionCriteria,
  StrategyManagerConfig,
  StrategyRegistration 
} from './interfaces.js';
import { DiskLogger } from '../logger.js';

/**
 * Manages multiple D365 object creation strategies and handles intelligent selection
 */
export class D365ObjectCreationManager {
  private strategies: Map<string, StrategyRegistration> = new Map();
  private config: StrategyManagerConfig;
  private availabilityCache: Map<string, { available: boolean; expiry: number }> = new Map();
  
  constructor(config?: Partial<StrategyManagerConfig>) {
    this.config = {
      enableAutoFallback: true,
      selectionTimeoutMs: 5000,
      cacheAvailabilityChecks: true,
      fallbackOrder: ['microsoft-api', 'template', 'custom'],
      strategyConfigs: {},
      ...config
    };
  }

  /**
   * Register a strategy with the manager
   */
  async registerStrategy(name: string, strategy: D365ObjectCreationStrategy): Promise<void> {
    await DiskLogger.logDebug(`Registering strategy: ${name}`);
    
    const registration: StrategyRegistration = {
      strategy,
      registeredAt: new Date(),
      enabled: true
    };
    
    this.strategies.set(name, registration);
    
    // Perform initial availability check
    try {
      const available = await strategy.isAvailable();
      registration.lastAvailabilityCheck = {
        available,
        checkedAt: new Date()
      };
      
      await DiskLogger.logDebug(`Strategy ${name} availability: ${available}`);
    } catch (error) {
      registration.lastAvailabilityCheck = {
        available: false,
        checkedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      await DiskLogger.logError(error, `Strategy availability check for ${name}`);
    }
  }

  /**
   * Unregister a strategy
   */
  unregisterStrategy(name: string): void {
    this.strategies.delete(name);
    this.availabilityCache.delete(name);
    DiskLogger.logDebug(`Unregistered strategy: ${name}`);
  }

  /**
   * Get all registered strategies
   */
  getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get strategy capabilities
   */
  getStrategyCapabilities(name: string) {
    const registration = this.strategies.get(name);
    return registration?.strategy.getCapabilities();
  }

  /**
   * Create a D365 object using intelligent strategy selection
   */
  async createObject(options: D365ObjectOptions, selectionCriteria?: StrategySelectionCriteria): Promise<D365ObjectResult> {
    const startTime = Date.now();
    
    try {
      await DiskLogger.logDebug(`Creating object: ${options.objectName} (type: ${options.objectType})`);
      
      // Validate input options
      if (!options.objectName || !options.objectType) {
        throw new Error('Object name and type are required');
      }

      // Select appropriate strategy
      const strategy = await this.selectStrategy(options, selectionCriteria);
      if (!strategy) {
        return {
          success: false,
          message: `No available strategy found for object type: ${options.objectType}`,
          strategy: 'none',
          executionTime: Date.now() - startTime,
          error: {
            code: 'NO_STRATEGY_AVAILABLE',
            details: `No strategy could handle object type ${options.objectType}`
          }
        };
      }

      // Validate options with selected strategy
      const validation = await strategy.validateOptions(options);
      if (!validation.valid) {
        return {
          success: false,
          message: `Invalid options for strategy: ${validation.errors.join(', ')}`,
          strategy: strategy.getCapabilities().name,
          executionTime: Date.now() - startTime,
          error: {
            code: 'INVALID_OPTIONS',
            details: validation.errors.join(', ')
          }
        };
      }

      // Execute object creation
      const result = await strategy.createObject(options);
      result.executionTime = Date.now() - startTime;
      
      await DiskLogger.logDebug(`Object creation completed in ${result.executionTime}ms using strategy: ${result.strategy}`);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await DiskLogger.logError(error, 'Object creation failed');
      
      return {
        success: false,
        message: `Object creation failed: ${errorMessage}`,
        strategy: 'unknown',
        executionTime: Date.now() - startTime,
        error: {
          code: 'CREATION_FAILED',
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Select the best strategy for the given options and criteria
   */
  private async selectStrategy(
    options: D365ObjectOptions, 
    criteria?: StrategySelectionCriteria
  ): Promise<D365ObjectCreationStrategy | null> {
    const startTime = Date.now();
    const objectType = options.objectType;
    
    await DiskLogger.logDebug(`Selecting strategy for object type: ${objectType}`);

    // Check if a preferred strategy is specified and available
    if (criteria?.preferredStrategy) {
      const preferredStrategy = await this.tryStrategy(criteria.preferredStrategy, objectType, options);
      if (preferredStrategy) {
        await DiskLogger.logDebug(`Using preferred strategy: ${criteria.preferredStrategy}`);
        return preferredStrategy;
      } else if (!criteria.enableFallback) {
        await DiskLogger.logDebug(`Preferred strategy ${criteria.preferredStrategy} not available and fallback disabled`);
        return null;
      }
    }

    // Try default strategy if configured
    if (this.config.defaultStrategy) {
      const defaultStrategy = await this.tryStrategy(this.config.defaultStrategy, objectType, options);
      if (defaultStrategy) {
        await DiskLogger.logDebug(`Using default strategy: ${this.config.defaultStrategy}`);
        return defaultStrategy;
      }
    }

    // Try strategies in fallback order
    if (this.config.enableAutoFallback || criteria?.enableFallback) {
      for (const strategyName of this.config.fallbackOrder) {
        if (Date.now() - startTime > this.config.selectionTimeoutMs) {
          await DiskLogger.logDebug(`Strategy selection timeout reached`);
          break;
        }

        const strategy = await this.tryStrategy(strategyName, objectType, options);
        if (strategy) {
          await DiskLogger.logDebug(`Using fallback strategy: ${strategyName}`);
          return strategy;
        }
      }
    }

    // Try all remaining strategies as last resort
    for (const [strategyName] of this.strategies) {
      if (Date.now() - startTime > this.config.selectionTimeoutMs) {
        break;
      }

      if (!this.config.fallbackOrder.includes(strategyName)) {
        const strategy = await this.tryStrategy(strategyName, objectType, options);
        if (strategy) {
          await DiskLogger.logDebug(`Using last resort strategy: ${strategyName}`);
          return strategy;
        }
      }
    }

    await DiskLogger.logDebug(`No suitable strategy found for object type: ${objectType}`);
    return null;
  }

  /**
   * Try a specific strategy and return it if suitable
   */
  private async tryStrategy(
    strategyName: string, 
    objectType: string, 
    options: D365ObjectOptions
  ): Promise<D365ObjectCreationStrategy | null> {
    const registration = this.strategies.get(strategyName);
    if (!registration || !registration.enabled) {
      return null;
    }

    const strategy = registration.strategy;

    // Check if strategy can handle this object type
    if (!strategy.canHandle(objectType, options)) {
      return null;
    }

    // Check strategy availability (with caching)
    const available = await this.isStrategyAvailable(strategyName, strategy);
    if (!available) {
      return null;
    }

    return strategy;
  }

  /**
   * Check if a strategy is available, with optional caching
   */
  private async isStrategyAvailable(strategyName: string, strategy: D365ObjectCreationStrategy): Promise<boolean> {
    if (this.config.cacheAvailabilityChecks) {
      const cached = this.availabilityCache.get(strategyName);
      if (cached && cached.expiry > Date.now()) {
        return cached.available;
      }
    }

    try {
      const available = await strategy.isAvailable();
      
      if (this.config.cacheAvailabilityChecks) {
        // Cache result for 5 minutes
        this.availabilityCache.set(strategyName, {
          available,
          expiry: Date.now() + 5 * 60 * 1000
        });
      }

      // Update registration with latest check
      const registration = this.strategies.get(strategyName);
      if (registration) {
        registration.lastAvailabilityCheck = {
          available,
          checkedAt: new Date()
        };
      }

      return available;
    } catch (error) {
      await DiskLogger.logError(error, `Strategy availability check for ${strategyName}`);
      
      // Update registration with error
      const registration = this.strategies.get(strategyName);
      if (registration) {
        registration.lastAvailabilityCheck = {
          available: false,
          checkedAt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
      
      return false;
    }
  }

  /**
   * Get strategy status and diagnostics
   */
  async getStrategyStatus() {
    const status: any = {
      totalStrategies: this.strategies.size,
      availableStrategies: 0,
      strategyDetails: []
    };

    for (const [name, registration] of this.strategies) {
      const capabilities = registration.strategy.getCapabilities();
      const available = await this.isStrategyAvailable(name, registration.strategy);
      
      if (available) {
        status.availableStrategies++;
      }

      status.strategyDetails.push({
        name,
        description: capabilities.description,
        available,
        enabled: registration.enabled,
        supportedObjectTypes: capabilities.supportedObjectTypes,
        priority: capabilities.priority,
        lastCheck: registration.lastAvailabilityCheck?.checkedAt,
        registeredAt: registration.registeredAt
      });
    }

    // Sort by priority
    status.strategyDetails.sort((a: any, b: any) => a.priority - b.priority);

    return status;
  }

  /**
   * Update strategy manager configuration
   */
  updateConfig(newConfig: Partial<StrategyManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    DiskLogger.logDebug(`Strategy manager configuration updated`);
  }

  /**
   * Clear availability cache
   */
  clearAvailabilityCache(): void {
    this.availabilityCache.clear();
    DiskLogger.logDebug(`Strategy availability cache cleared`);
  }
}