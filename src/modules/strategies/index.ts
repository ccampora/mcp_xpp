/**
 * Strategy Pattern Module for D365 Object Creation
 * 
 * Exports all strategy-related interfaces, classes, and utilities for D365 object creation.
 * This module provides a flexible, enterprise-grade architecture for supporting multiple
 * D365 object creation approaches with intelligent strategy selection and fallback.
 */

// Core interfaces and types
export type {
  D365ObjectOptions,
  D365ObjectResult,
  StrategyCapabilities,
  D365ObjectCreationStrategy,
  StrategySelectionCriteria,
  StrategyManagerConfig,
  StrategyRegistration
} from './interfaces.js';

// Strategy manager
export { D365ObjectCreationManager } from './manager.js';

// Concrete strategy implementations
export { TemplateStrategy } from './template-strategy.js';
export { MicrosoftApiStrategy } from './microsoft-api-strategy.js';
export { CustomStrategy } from './custom-strategy.js';

// Import types and classes for the convenience functions
import { StrategyManagerConfig } from './interfaces.js';
import { D365ObjectCreationManager } from './manager.js';
import { TemplateStrategy } from './template-strategy.js';
import { MicrosoftApiStrategy } from './microsoft-api-strategy.js';
import { CustomStrategy } from './custom-strategy.js';

/**
 * Convenience function to create and configure a strategy manager with default strategies
 */
export async function createDefaultStrategyManager(config?: Partial<StrategyManagerConfig>): Promise<D365ObjectCreationManager> {
  const manager = new D365ObjectCreationManager(config);
  
  // Register default strategies in priority order
  await manager.registerStrategy('microsoft-api', new MicrosoftApiStrategy());
  await manager.registerStrategy('template', new TemplateStrategy());
  await manager.registerStrategy('custom', new CustomStrategy());
  
  return manager;
}

/**
 * Convenience function to create a strategy manager with only template strategy
 * Useful for environments without Microsoft API access
 */
export async function createTemplateOnlyManager(config?: Partial<StrategyManagerConfig>): Promise<D365ObjectCreationManager> {
  const manager = new D365ObjectCreationManager({
    ...config,
    fallbackOrder: ['template']
  });
  
  await manager.registerStrategy('template', new TemplateStrategy());
  
  return manager;
}

/**
 * Convenience function to create a strategy manager with custom strategy priorities
 */
export async function createCustomOrderManager(
  strategyOrder: Array<'microsoft-api' | 'template' | 'custom'>,
  config?: Partial<StrategyManagerConfig>
): Promise<D365ObjectCreationManager> {
  const manager = new D365ObjectCreationManager({
    ...config,
    fallbackOrder: strategyOrder
  });
  
  // Register strategies in the specified order
  for (const strategyName of strategyOrder) {
    switch (strategyName) {
      case 'microsoft-api':
        await manager.registerStrategy('microsoft-api', new MicrosoftApiStrategy());
        break;
      case 'template':
        await manager.registerStrategy('template', new TemplateStrategy());
        break;
      case 'custom':
        await manager.registerStrategy('custom', new CustomStrategy());
        break;
    }
  }
  
  return manager;
}