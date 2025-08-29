import * as net from 'net';
import { EventEmitter } from 'events';

export interface ServiceRequest {
    action: string;
    objectType?: string;
    parameters?: Record<string, any>;
}

export interface ServiceResponse {
    success: boolean;
    data?: any;
    error?: string;
    processingTimeMs?: number;
}

export interface ObjectCreationResult {
    objectType: string;
    name: string;
    xmlContent: string;
    xmlPath?: string;
    properties: Record<string, any>;
}

export interface HealthCheckResult {
    status: string;
    timestamp: string;
    activeConnections: number;
    maxConnections: number;
    serviceInfo: Record<string, any>;
}

export class D365ServiceClient extends EventEmitter {
    private socket: net.Socket | null = null;
    private isConnected = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private messageBuffer = '';
    private pendingRequests = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();
    private requestId = 0;

    constructor(
        private readonly host: string = '127.0.0.1',
        private readonly port: number = 7890,
        private readonly options: {
            reconnectDelay?: number;
            requestTimeout?: number;
            maxRetries?: number;
        } = {}
    ) {
        super();
        this.options = {
            reconnectDelay: 2000,
            requestTimeout: 30000,
            maxRetries: 3,
            ...options
        };
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                resolve();
                return;
            }

            this.socket = new net.Socket();

            this.socket.on('connect', () => {
                this.isConnected = true;
                this.messageBuffer = '';
                console.log(`Connected to D365 Service at ${this.host}:${this.port}`);
                this.emit('connected');
                resolve();
            });

            this.socket.on('data', (data: Buffer) => {
                this.handleIncomingData(data.toString('utf8'));
            });

            this.socket.on('close', () => {
                this.handleDisconnection();
            });

            this.socket.on('error', (error: Error) => {
                console.error('D365 Service connection error:', error);
                this.emit('error', error);
                if (!this.isConnected) {
                    reject(error);
                } else {
                    this.handleDisconnection();
                }
            });

            this.socket.connect(this.port, this.host);
        });
    }

    async disconnect(): Promise<void> {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Reject all pending requests
        for (const [requestId, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Client disconnected'));
        }
        this.pendingRequests.clear();

        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }

        this.isConnected = false;
        this.emit('disconnected');
    }

    async sendRequest(request: ServiceRequest): Promise<ServiceResponse> {
        if (!this.isConnected) {
            throw new Error('Not connected to D365 Service');
        }

        return new Promise((resolve, reject) => {
            const id = (++this.requestId).toString();
            const message = JSON.stringify({ id, ...request }) + '\n';

            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout after ${this.options.requestTimeout}ms`));
            }, this.options.requestTimeout);

            // Store pending request
            this.pendingRequests.set(id, { resolve, reject, timeout });

            // Send message
            try {
                this.socket!.write(message, 'utf8');
            } catch (error) {
                this.pendingRequests.delete(id);
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    async createObject(objectType: string, parameters: Record<string, any>): Promise<ObjectCreationResult> {
        const response = await this.sendRequest({
            action: 'create',
            objectType,
            parameters
        });

        if (!response.success) {
            throw new Error(response.error || 'Object creation failed');
        }

        return response.data as ObjectCreationResult;
    }

    async healthCheck(): Promise<HealthCheckResult> {
        const response = await this.sendRequest({
            action: 'health'
        });

        if (!response.success) {
            throw new Error(response.error || 'Health check failed');
        }

        return response.data as HealthCheckResult;
    }

    async ping(): Promise<{ status: string; timestamp: string }> {
        const response = await this.sendRequest({
            action: 'ping'
        });

        if (!response.success) {
            throw new Error(response.error || 'Ping failed');
        }

        return response.data;
    }

    private handleIncomingData(data: string): void {
        this.messageBuffer += data;

        // Process complete messages (delimited by newlines)
        let newlineIndex: number;
        while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
            const messageStr = this.messageBuffer.substring(0, newlineIndex).trim();
            this.messageBuffer = this.messageBuffer.substring(newlineIndex + 1);

            if (messageStr) {
                this.processMessage(messageStr);
            }
        }
    }

    private processMessage(messageStr: string): void {
        try {
            const message = JSON.parse(messageStr);
            
            if (message.id && this.pendingRequests.has(message.id)) {
                const pending = this.pendingRequests.get(message.id)!;
                this.pendingRequests.delete(message.id);
                clearTimeout(pending.timeout);

                // Remove the id from the response before resolving
                const { id, ...response } = message;
                pending.resolve(response as ServiceResponse);
            } else {
                console.warn('Received message without matching request ID:', message);
            }
        } catch (error) {
            console.error('Error parsing message from D365 Service:', error);
            console.error('Raw message:', messageStr);
        }
    }

    private handleDisconnection(): void {
        const wasConnected = this.isConnected;
        this.isConnected = false;

        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket = null;
        }

        if (wasConnected) {
            console.log('Disconnected from D365 Service');
            this.emit('disconnected');

            // Auto-reconnect
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            return; // Already scheduled
        }

        console.log(`Attempting reconnection in ${this.options.reconnectDelay}ms...`);
        
        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = null;
            
            try {
                await this.connect();
                console.log('Reconnected to D365 Service');
            } catch (error) {
                console.error('Reconnection failed:', error);
                // Schedule another reconnect attempt
                this.scheduleReconnect();
            }
        }, this.options.reconnectDelay);
    }

    get connected(): boolean {
        return this.isConnected;
    }
}
