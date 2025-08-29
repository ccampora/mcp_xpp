/**
 * Real-time XML Element Validation Module
 * 
 * Uses confirmed Microsoft API values for D365 object validation
 * Integrates with Strategy Pattern for real-time validation
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { AppConfig } from './app-config.js';
import { DiskLogger } from './logger.js';

/**
 * Element validation result
 */
export interface ElementValidationResult {
  valid: boolean;
  elementName: string;
  providedValue: string;
  validValues?: string[];
  suggestions?: string[];
  apiConfirmed: boolean;
  errorMessage?: string;
}

/**
 * XML Element validator using confirmed Microsoft API values
 */
export class XmlElementValidator {
  private static apiValues: any = null;
  private static lastLoadTime = 0;
  private static readonly CACHE_DURATION = 60000; // 1 minute cache

  /**
   * Load confirmed Microsoft API values
   */
  private static async loadApiValues(): Promise<void> {
    const now = Date.now();
    if (this.apiValues && (now - this.lastLoadTime) < this.CACHE_DURATION) {
      return; // Use cached values
    }

    try {
      const configPath = join(process.cwd(), 'config', 'microsoft-api-confirmed-values.json');
      const content = await fs.readFile(configPath, 'utf8');
      this.apiValues = JSON.parse(content);
      this.lastLoadTime = now;
      
      await DiskLogger.logDebug('Loaded Microsoft API confirmed values for validation');
    } catch (error) {
      await DiskLogger.logError(error, 'Failed to load Microsoft API values');
      throw new Error('Cannot load Microsoft API validation data');
    }
  }

  /**
   * Validate XML element value in real-time
   */
  static async validateElement(elementName: string, value: string): Promise<ElementValidationResult> {
    await this.loadApiValues();

    // Check confirmed enum elements first
    const confirmedElement = this.apiValues.confirmedElements[elementName];
    if (confirmedElement) {
      const isValid = confirmedElement.possibleValues.includes(value);
      
      return {
        valid: isValid,
        elementName,
        providedValue: value,
        validValues: confirmedElement.possibleValues,
        suggestions: isValid ? undefined : this.getSuggestions(value, confirmedElement.possibleValues),
        apiConfirmed: true,
        errorMessage: isValid ? undefined : `Invalid ${elementName} value. Must be one of: ${confirmedElement.possibleValues.join(', ')}`
      };
    }

    // Check string properties
    const stringProperty = this.apiValues.stringProperties[elementName];
    if (stringProperty) {
      // For string properties, basic validation only
      const isValid = Boolean(value && value.trim().length > 0);
      
      return {
        valid: isValid,
        elementName,
        providedValue: value,
        apiConfirmed: true,
        errorMessage: isValid ? undefined : `${elementName} cannot be empty`
      };
    }

    // Check boolean properties
    const booleanProperty = this.apiValues.booleanProperties[elementName];
    if (booleanProperty) {
      const normalizedValue = value.toLowerCase();
      const isValid = ['yes', 'no', 'true', 'false'].includes(normalizedValue);
      
      return {
        valid: isValid,
        elementName,
        providedValue: value,
        validValues: ['Yes', 'No'],
        apiConfirmed: true,
        errorMessage: isValid ? undefined : `${elementName} must be 'Yes' or 'No'`
      };
    }

    // Element not found in Microsoft API
    return {
      valid: true, // Don't block unknown elements
      elementName,
      providedValue: value,
      apiConfirmed: false,
      errorMessage: `Warning: ${elementName} not found in Microsoft API definitions`
    };
  }

  /**
   * Get suggestions for similar valid values
   */
  private static getSuggestions(input: string, validValues: string[]): string[] {
    const inputLower = input.toLowerCase();
    
    // Find exact matches or similar values
    const suggestions = validValues.filter(value => 
      value.toLowerCase().includes(inputLower) || 
      inputLower.includes(value.toLowerCase()) ||
      this.levenshteinDistance(inputLower, value.toLowerCase()) <= 2
    );

    // If no close matches, return the first few valid options
    return suggestions.length > 0 ? suggestions.slice(0, 3) : validValues.slice(0, 3);
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Validate entire XML object structure
   */
  static async validateXmlStructure(xmlElements: Record<string, string>): Promise<{
    valid: boolean;
    results: ElementValidationResult[];
    errors: string[];
    warnings: string[];
  }> {
    const results: ElementValidationResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [elementName, value] of Object.entries(xmlElements)) {
      const result = await this.validateElement(elementName, value);
      results.push(result);

      if (!result.valid) {
        errors.push(result.errorMessage || `Invalid value for ${elementName}`);
      }

      if (!result.apiConfirmed) {
        warnings.push(`${elementName}: Not confirmed in Microsoft API`);
      }
    }

    return {
      valid: errors.length === 0,
      results,
      errors,
      warnings
    };
  }

  /**
   * Get all valid values for auto-completion
   */
  static async getValidValues(elementName: string): Promise<{
    values: string[];
    type: string;
    apiConfirmed: boolean;
    description?: string;
  }> {
    await this.loadApiValues();

    // Check confirmed elements
    const confirmedElement = this.apiValues.confirmedElements[elementName];
    if (confirmedElement) {
      return {
        values: confirmedElement.possibleValues,
        type: confirmedElement.type,
        apiConfirmed: true,
        description: confirmedElement.description
      };
    }

    // Check boolean properties
    const booleanProperty = this.apiValues.booleanProperties[elementName];
    if (booleanProperty) {
      return {
        values: ['Yes', 'No'],
        type: 'Boolean',
        apiConfirmed: true,
        description: booleanProperty.description
      };
    }

    // Check string properties
    const stringProperty = this.apiValues.stringProperties[elementName];
    if (stringProperty) {
      return {
        values: [], // Strings have no predefined values
        type: 'String',
        apiConfirmed: true,
        description: stringProperty.description
      };
    }

    return {
      values: [],
      type: 'Unknown',
      apiConfirmed: false,
      description: `${elementName} not found in Microsoft API definitions`
    };
  }

  /**
   * Get validation summary for diagnostics
   */
  static async getValidationSummary(): Promise<{
    totalElements: number;
    confirmedEnums: number;
    stringProperties: number;
    booleanProperties: number;
    lastUpdated: string;
  }> {
    await this.loadApiValues();

    const metadata = this.apiValues.metadata;
    
    return {
      totalElements: metadata.totalElements,
      confirmedEnums: Object.keys(this.apiValues.confirmedElements).length,
      stringProperties: Object.keys(this.apiValues.stringProperties).length,
      booleanProperties: Object.keys(this.apiValues.booleanProperties).length,
      lastUpdated: metadata.generatedAt
    };
  }
}
