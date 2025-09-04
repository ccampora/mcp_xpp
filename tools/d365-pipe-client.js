// =============================================================================
// D365 PIPE CLIENT - Professional VS2022 Service Integration
// =============================================================================
// Purpose: Direct named pipe communication with VS2022 D365 service
// Architecture: Template-First with robust error handling and validation
// Focus: Production-ready client for object creation and management

import { createConnection } from 'net';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CLIENT_CONFIG = {
  pipeName: '\\\\.\\pipe\\mcp-xpp-d365-service',
  connection: {
    timeout: 30000,      // 30 seconds connection timeout
    responseTimeout: 60000, // 60 seconds response timeout
    retryAttempts: 3,
    retryDelay: 1000     // 1 second between retries
  },
  validation: {
    maxNameLength: 50,
    minNameLength: 1,
    allowedModels: ['cc', 'ApplicationSuite', 'ApplicationPlatform', 'ApplicationFoundation'],
    supportedObjectTypes: ['AxClass', 'AxEnum', 'AxTable', 'AxForm', 'AxView', 'AxMenu', 'AxModel']
  }
};

// =============================================================================
// D365 PIPE CLIENT CLASS
// =============================================================================

export class D365PipeClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...CLIENT_CONFIG, ...options };
    this.connection = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.responseBuffer = '';
  }

  /**
   * Connect to VS2022 service pipe with retry logic
   */
  async connect() {
    if (this.isConnected) {
      return true;
    }

    for (let attempt = 1; attempt <= this.config.connection.retryAttempts; attempt++) {
      try {
        await this._attemptConnection();
        this.isConnected = true;
        this.emit('connected');
        return true;
      } catch (error) {
        if (attempt === this.config.connection.retryAttempts) {
          throw new Error(`Failed to connect after ${attempt} attempts: ${error.message}`);
        }
        await this._delay(this.config.connection.retryDelay);
      }
    }
  }

  /**
   * Single connection attempt
   */
  _attemptConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.connection.timeout);

      this.connection = createConnection(this.config.pipeName);

      this.connection.on('connect', () => {
        clearTimeout(timeout);
        this._setupConnectionHandlers();
        resolve();
      });

      this.connection.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Setup connection event handlers
   */
  _setupConnectionHandlers() {
    this.connection.on('data', (data) => {
      this._handleResponse(data.toString());
    });

    this.connection.on('close', () => {
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.connection.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming response data
   */
  _handleResponse(data) {
    this.responseBuffer += data;
    
    // Look for complete JSON responses
    let startIndex = 0;
    while (true) {
      const jsonStart = this.responseBuffer.indexOf('{', startIndex);
      if (jsonStart === -1) break;

      try {
        // Try to parse JSON starting from this position
        const potentialJson = this.responseBuffer.substring(jsonStart);
        const parsed = JSON.parse(potentialJson);
        
        // If successful, we found a complete response
        const endIndex = jsonStart + JSON.stringify(parsed).length;
        this.responseBuffer = this.responseBuffer.substring(endIndex);
        
        // Find matching request and resolve it
        const requestId = parsed.Id;
        if (this.pendingRequests.has(requestId)) {
          const { resolve } = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          resolve(parsed);
        }
        
        startIndex = 0; // Reset to look for more responses
      } catch (parseError) {
        // Not a complete JSON yet, try next position
        startIndex = jsonStart + 1;
      }
    }
  }

  /**
   * Send request to VS2022 service
   */
  async sendRequest(action, objectType = '', parameters = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to VS2022 service');
    }

    const requestId = this._generateRequestId();
    const request = {
      Id: requestId,
      Action: action,
      ObjectType: objectType,
      Parameters: parameters,
      Timestamp: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${this.config.connection.responseTimeout}ms`));
      }, this.config.connection.responseTimeout);

      this.pendingRequests.set(requestId, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.connection.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Create D365 object with validation
   */
  async createObject(objectType, parameters) {
    // Validate object type
    if (!this.config.validation.supportedObjectTypes.includes(objectType)) {
      throw new Error(`Unsupported object type: ${objectType}`);
    }

    // Validate parameters
    this._validateObjectParameters(objectType, parameters);

    // Send creation request with correct protocol format
    const response = await this.sendRequest('create', objectType, parameters);

    if (!response.Success) {
      throw new Error(`Object creation failed: ${response.Error || 'Unknown error'}`);
    }

    return response;
  }

  /**
   * Create AxClass with specific validation
   */
  async createClass(name, options = {}) {
    const parameters = {
      name,
      model: options.model || 'cc',
      extends: options.extends || '',
      description: options.description || `Auto-generated test class: ${name}`,
      ...options
    };

    return this.createObject('AxClass', parameters);
  }

  /**
   * Create AxEnum with specific validation
   */
  async createEnum(name, options = {}) {
    const parameters = {
      name,
      model: options.model || 'cc',
      description: options.description || `Auto-generated test enum: ${name}`,
      ...options
    };

    return this.createObject('AxEnum', parameters);
  }

  /**
   * Create AxTable with specific validation
   */
  async createTable(name, options = {}) {
    const parameters = {
      name,
      model: options.model || 'cc',
      description: options.description || `Auto-generated test table: ${name}`,
      ...options
    };

    return this.createObject('AxTable', parameters);
  }

  /**
   * Create AxForm with specific validation
   */
  async createForm(name, options = {}) {
    const parameters = {
      name,
      model: options.model || 'cc',
      description: options.description || `Auto-generated test form: ${name}`,
      ...options
    };

    return this.createObject('AxForm', parameters);
  }

  /**
   * Create AxView with specific validation
   */
  async createView(name, options = {}) {
    const parameters = {
      name,
      model: options.model || 'cc',
      description: options.description || `Auto-generated test view: ${name}`,
      ...options
    };

    return this.createObject('AxView', parameters);
  }

  /**
   * Create AxMenu with specific validation
   */
  async createMenu(name, options = {}) {
    const parameters = {
      name,
      model: options.model || 'cc',
      description: options.description || `Auto-generated test menu: ${name}`,
      ...options
    };

    return this.createObject('AxMenu', parameters);
  }

  /**
   * Create AxModel with specific validation
   */
  async createModel(name, options = {}) {
    const parameters = {
      name,
      layer: options.layer || 'usr',
      description: options.description || `Auto-generated test model: ${name}`,
      ...options
    };

    return this.createObject('AxModel', parameters);
  }

  /**
   * Delete D365 object
   */
  async deleteObject(objectType, name) {
    const response = await this.sendRequest('DeleteObject', {
      ObjectType: objectType,
      Name: name
    });

    if (!response.Success) {
      throw new Error(`Object deletion failed: ${response.Error || 'Unknown error'}`);
    }

    return response;
  }

  /**
   * Get service status
   */
  async getServiceStatus() {
    return this.sendRequest('GetStatus');
  }

  /**
   * Get supported object types
   */
  async getSupportedObjectTypes() {
    const response = await this.sendRequest('GetSupportedTypes');
    return response.Data || this.config.validation.supportedObjectTypes;
  }

  /**
   * Generate random object name with prefix
   */
  generateRandomName(prefix = 'Test', suffix = '') {
    const randomPart = randomBytes(4).toString('hex').toLowerCase();
    const timestamp = Date.now().toString().slice(-8);
    return `${prefix}_${randomPart}_${timestamp}${suffix}`;
  }

  /**
   * Validate object parameters
   */
  _validateObjectParameters(objectType, parameters) {
    if (!parameters.name) {
      throw new Error('Object name is required');
    }

    if (parameters.name.length < this.config.validation.minNameLength ||
        parameters.name.length > this.config.validation.maxNameLength) {
      throw new Error(`Object name must be between ${this.config.validation.minNameLength} and ${this.config.validation.maxNameLength} characters`);
    }

    if (parameters.model && !this.config.validation.allowedModels.includes(parameters.model)) {
      throw new Error(`Invalid model: ${parameters.model}. Allowed: ${this.config.validation.allowedModels.join(', ')}`);
    }
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return `req_${randomBytes(8).toString('hex')}_${Date.now()}`;
  }

  /**
   * Utility delay function
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from service
   */
  async disconnect() {
    if (this.connection && this.isConnected) {
      this.connection.end();
      this.isConnected = false;
      this.emit('disconnected');
    }
  }

  /**
   * Check if connected
   */
  get connected() {
    return this.isConnected;
  }
}

// =============================================================================
// VALIDATION HELPER CLASS
// =============================================================================

export class ObjectCreationValidator {
  constructor(client) {
    this.client = client;
    this.results = [];
  }

  /**
   * Run comprehensive validation across multiple object types
   */
  async runComprehensiveValidation(objectTypes = CLIENT_CONFIG.validation.supportedObjectTypes) {
    this.results = [];
    const startTime = Date.now();

    // Ensure connection
    if (!this.client.connected) {
      await this.client.connect();
    }

    for (const objectType of objectTypes) {
      if (objectType === 'AxModel') {
        continue; // Skip models in batch validation
      }

      const testResult = await this._testObjectType(objectType);
      this.results.push(testResult);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      results: this.results,
      summary: this._generateSummary(duration),
      success: this.results.filter(r => r.success).length >= Math.floor(this.results.length * 0.8) // 80% success rate
    };
  }

  /**
   * Test single object type creation
   */
  async _testObjectType(objectType) {
    const startTime = Date.now();
    const testName = this.client.generateRandomName(objectType.replace('Ax', ''));

    try {
      let response;
      switch (objectType) {
        case 'AxClass':
          response = await this.client.createClass(testName);
          break;
        case 'AxEnum':
          response = await this.client.createEnum(testName);
          break;
        case 'AxTable':
          response = await this.client.createTable(testName);
          break;
        case 'AxForm':
          response = await this.client.createForm(testName);
          break;
        case 'AxView':
          response = await this.client.createView(testName);
          break;
        case 'AxMenu':
          response = await this.client.createMenu(testName);
          break;
        default:
          throw new Error(`Unsupported object type: ${objectType}`);
      }

      const duration = Date.now() - startTime;

      return {
        objectType,
        name: testName,
        success: true,
        duration,
        response
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        objectType,
        name: testName,
        success: false,
        duration,
        error: error.message
      };
    }
  }

  /**
   * Generate test summary
   */
  _generateSummary(totalDuration) {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    return {
      total,
      passed,
      failed,
      successRate: parseFloat(successRate),
      totalDuration,
      averageDuration: total > 0 ? Math.round(totalDuration / total) : 0
    };
  }

  /**
   * Get detailed results
   */
  getResults() {
    return this.results;
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    return this._generateSummary(0);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default D365PipeClient;
