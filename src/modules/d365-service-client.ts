import { createConnection } from 'net';
import { EventEmitter } from 'events';

/**
 * Named Pipe client for communicating with the C# D365 Metadata Service
 * Provides high-performance Windows IPC communication
 */
export class D365ServiceClient extends EventEmitter {
    private connection: any = null;
    private isConnected: boolean = false;
    private responseBuffer: string = '';
    private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
    private requestId: number = 0;

    constructor(
        private pipeName: string = 'mcp-xpp-d365-service',
        private connectionTimeout: number = 30000,
        private requestTimeout: number = 60000
    ) {
        super();
    }

    /**
     * Connect to the Named Pipe server
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                resolve();
                return;
            }

            // Windows Named Pipe path format
            const pipePath = `\\\\.\\pipe\\${this.pipeName}`;
            
            this.connection = createConnection(pipePath);
            
            const connectionTimer = setTimeout(() => {
                this.connection?.destroy();
                reject(new Error(`Connection timeout after ${this.connectionTimeout}ms`));
            }, this.connectionTimeout);

            this.connection.on('connect', () => {
                clearTimeout(connectionTimer);
                this.isConnected = true;
                this.setupEventHandlers();
                this.emit('connected');
                resolve();
            });

            this.connection.on('error', (error: Error) => {
                clearTimeout(connectionTimer);
                this.isConnected = false;
                this.emit('error', error);
                reject(error);
            });
        });
    }

    /**
     * Disconnect from the Named Pipe server
     */
    async disconnect(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.isConnected || !this.connection) {
                resolve();
                return;
            }

            // Cancel all pending requests
            for (const [id, request] of this.pendingRequests) {
                clearTimeout(request.timeout);
                request.reject(new Error('Connection closed'));
            }
            this.pendingRequests.clear();

            this.connection.on('close', () => {
                this.isConnected = false;
                this.emit('disconnected');
                resolve();
            });

            this.connection.end();
        });
    }

    /**
     * Send a request to the server and wait for response
     */
    async sendRequest(action: string, objectType?: string, parameters?: Record<string, any>): Promise<any> {
        if (!this.isConnected) {
            throw new Error('Not connected to Named Pipe server');
        }

        const requestId = (++this.requestId).toString();
        const request = {
            id: requestId,
            action,
            objectType,
            parameters: parameters || {}
        };

        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout after ${this.requestTimeout}ms`));
            }, this.requestTimeout);

            // Store the request
            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            // Send the request
            const message = JSON.stringify(request) + '\n';
            this.connection.write(message, 'utf8', (error: Error) => {
                if (error) {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    reject(error);
                }
            });
        });
    }

    /**
     * Create a D365 object
     */
    async createObject(objectType: string, parameters: Record<string, any>): Promise<any> {
        return this.sendRequest('create', objectType, parameters);
    }

    /**
     * Get parameter schemas for object types
     */
    async getParameterSchemas(): Promise<any> {
        return this.sendRequest('schemas');
    }

    /**
     * Validate parameters for an object type
     */
    async validateParameters(objectType: string, parameters: Record<string, any>): Promise<any> {
        return this.sendRequest('validate', objectType, parameters);
    }

    /**
     * Associate object to project
     */
    async associateObjectToProject(parameters: Record<string, any>): Promise<any> {
        return this.sendRequest('associate', undefined, parameters);
    }

    /**
     * Get all available models
     */
    async getModels(): Promise<any> {
        return this.sendRequest('models');
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<any> {
        return this.sendRequest('health');
    }

    /**
     * Ping the server
     */
    async ping(): Promise<any> {
        return this.sendRequest('ping');
    }

    /**
     * Check if connected
     */
    get connected(): boolean {
        return this.isConnected;
    }

    private setupEventHandlers(): void {
        this.connection.on('data', (data: Buffer) => {
            this.responseBuffer += data.toString('utf8');
            this.processResponseBuffer();
        });

        this.connection.on('close', () => {
            this.isConnected = false;
            this.emit('disconnected');
        });

        this.connection.on('error', (error: Error) => {
            this.isConnected = false;
            this.emit('error', error);
        });
    }

    private processResponseBuffer(): void {
        const lines = this.responseBuffer.split('\n');
        this.responseBuffer = lines.pop() || ''; // Keep the incomplete line

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const response = JSON.parse(line);
                    this.handleResponse(response);
                } catch (error) {
                    this.emit('error', new Error(`Invalid JSON response: ${line}`));
                }
            }
        }
    }

    private handleResponse(response: any): void {
        const requestId = response.id;
        if (requestId && this.pendingRequests.has(requestId)) {
            const request = this.pendingRequests.get(requestId)!;
            clearTimeout(request.timeout);
            this.pendingRequests.delete(requestId);

            if (response.success) {
                request.resolve(response.data);
            } else {
                request.reject(new Error(response.error || 'Unknown error'));
            }
        } else {
            // Unmatched response
            this.emit('unmatchedResponse', response);
        }
    }
}
