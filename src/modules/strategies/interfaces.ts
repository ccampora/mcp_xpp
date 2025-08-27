/**
 * Strategy Pattern Interfaces for D365 Object Creation
 * 
 * Defines the core contracts for implementing different object creation approaches:
 * - Microsoft API Strategy (using Microsoft.Dynamics.AX.Metadata.dll)
 * - Template Strategy (using XML templates) 
 * - Custom Strategy (user-defined implementations)
 */

/**
 * Configuration options for creating a D365 object
 */
export interface D365ObjectOptions {
  /** Name of the object to create */
  objectName: string;
  
  /** Type of D365 object (class, table, enum, form, etc.) */
  objectType: string;
  
  /** Application layer (usr, cus, var, isv, etc.) */
  layer?: string;
  
  /** Publisher name */
  publisher?: string;
  
  /** Version number */
  version?: string;
  
  /** Object dependencies */
  dependencies?: string[];
  
  /** Output path for the object */
  outputPath?: string;
  
  /** Additional properties for object creation */
  properties?: Record<string, any>;
  
  /** Strategy-specific configuration */
  strategyConfig?: Record<string, any>;
}

/**
 * Result of a D365 object creation operation
 */
export interface D365ObjectResult {
  /** Whether the operation was successful */
  success: boolean;
  
  /** Human-readable message describing the result */
  message: string;
  
  /** Full path to the created object(s) */
  filePaths?: string[];
  
  /** Generated object content (for preview/debugging) */
  content?: string;
  
  /** Strategy that was used for creation */
  strategy: string;
  
  /** Time taken for creation in milliseconds */
  executionTime?: number;
  
  /** Any warnings or additional information */
  warnings?: string[];
  
  /** Detailed error information if unsuccessful */
  error?: {
    code: string;
    details: string;
    stack?: string;
  };
}

/**
 * Strategy capabilities and metadata
 */
export interface StrategyCapabilities {
  /** Strategy name identifier */
  name: string;
  
  /** Human-readable strategy description */
  description: string;
  
  /** Object types this strategy can handle */
  supportedObjectTypes: string[];
  
  /** Whether this strategy requires external dependencies */
  requiresExternalDependencies: boolean;
  
  /** List of required external tools/environments */
  externalDependencies?: string[];
  
  /** Estimated performance characteristics */
  performance: {
    /** Average object creation time in ms */
    averageCreationTime: number;
    
    /** Memory usage characteristics */
    memoryUsage: 'low' | 'medium' | 'high';
    
    /** CPU usage characteristics */
    cpuUsage: 'low' | 'medium' | 'high';
  };
  
  /** Strategy priority (lower number = higher priority) */
  priority: number;
}

/**
 * Core strategy interface that all D365 object creation strategies must implement
 */
export interface D365ObjectCreationStrategy {
  /** Get strategy capabilities and metadata */
  getCapabilities(): StrategyCapabilities;
  
  /** Check if this strategy can handle the given object type */
  canHandle(objectType: string, options?: D365ObjectOptions): boolean;
  
  /** Validate that the strategy is properly configured and ready to use */
  isAvailable(): Promise<boolean>;
  
  /** Create a D365 object using this strategy */
  createObject(options: D365ObjectOptions): Promise<D365ObjectResult>;
  
  /** Get configuration requirements for this strategy */
  getConfigurationRequirements(): string[];
  
  /** Validate the provided options for this strategy */
  validateOptions(options: D365ObjectOptions): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * Strategy selection criteria for the strategy manager
 */
export interface StrategySelectionCriteria {
  /** Preferred strategy name (if specified) */
  preferredStrategy?: string;
  
  /** Object type being created */
  objectType: string;
  
  /** Whether to enable fallback to other strategies */
  enableFallback?: boolean;
  
  /** Maximum execution time allowed */
  timeoutMs?: number;
  
  /** Additional selection criteria */
  criteria?: Record<string, any>;
}

/**
 * Strategy manager configuration
 */
export interface StrategyManagerConfig {
  /** Default strategy to try first */
  defaultStrategy?: string;
  
  /** Whether to enable automatic fallback between strategies */
  enableAutoFallback: boolean;
  
  /** Maximum time to spend on strategy selection */
  selectionTimeoutMs: number;
  
  /** Whether to cache strategy availability checks */
  cacheAvailabilityChecks: boolean;
  
  /** Strategy priority order for fallback */
  fallbackOrder: string[];
  
  /** Per-strategy configuration */
  strategyConfigs: Record<string, any>;
}

/**
 * Strategy registration information
 */
export interface StrategyRegistration {
  /** Strategy instance */
  strategy: D365ObjectCreationStrategy;
  
  /** When the strategy was registered */
  registeredAt: Date;
  
  /** Whether the strategy is currently enabled */
  enabled: boolean;
  
  /** Last availability check result */
  lastAvailabilityCheck?: {
    available: boolean;
    checkedAt: Date;
    error?: string;
  };
}