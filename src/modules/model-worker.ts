/**
 * Worker thread for processing individual D365 models
 * Each worker connects to the C# service and processes one model independently
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { D365ServiceClient } from './d365-service-client.js';

export interface ModelProcessingTask {
    modelName: string;
    requestId: string;
}

export interface ModelProcessingResult {
    modelName: string;
    success: boolean;
    objects: Array<{
        name: string;
        path: string;
        model: string;
        type: string;
        lastModified: string;
    }>;
    objectCount: number;
    processingTime: number;
    error?: string;
}

// Worker thread execution
if (!isMainThread && parentPort) {
    const task = workerData as ModelProcessingTask;
    
    async function processModel(): Promise<void> {
        const startTime = Date.now();
        const result: ModelProcessingResult = {
            modelName: task.modelName,
            success: false,
            objects: [],
            objectCount: 0,
            processingTime: 0,
            error: undefined
        };

        try {
            console.log(`🔍 Worker processing model: ${task.modelName}`);
            
            // Create independent connection to C# service
            const client = new D365ServiceClient();
            await client.connect();
            
            try {
                // Get objects for this model
                const response = await client.sendRequest('list_objects_by_model', undefined, {
                    model: task.modelName
                });

                if (!response.Success) {
                    throw new Error(response.Error || 'Unknown error from C# service');
                }

                const modelData = response.Data.models[0];
                if (!modelData || !modelData.objects) {
                    console.log(`   ⚠️  No objects found in model ${task.modelName}`);
                    result.success = true;
                    result.processingTime = Date.now() - startTime;
                    parentPort!.postMessage(result);
                    return;
                }

                // Convert model data to object array
                const objects: ModelProcessingResult['objects'] = [];
                
                for (const [objectType, objectNames] of Object.entries(modelData.objects)) {
                    const objectArray = objectNames as string[];
                    
                    for (const objectName of objectArray) {
                        objects.push({
                            name: objectName,
                            path: `${task.modelName}/${objectType}/${objectName}`,
                            model: task.modelName,
                            type: objectType,
                            lastModified: new Date().toISOString()
                        });
                    }
                }

                result.objects = objects;
                result.objectCount = objects.length;
                result.success = true;
                result.processingTime = Date.now() - startTime;

                console.log(`   ✅ Worker completed ${task.modelName}: ${result.objectCount} objects (${result.processingTime}ms)`);
                
            } finally {
                await client.disconnect();
            }
        } catch (error) {
            result.error = (error as Error).message;
            result.processingTime = Date.now() - startTime;
            console.error(`   ❌ Worker error processing ${task.modelName}:`, result.error);
        }

        // Send result back to main thread
        parentPort!.postMessage(result);
    }

    processModel().catch(error => {
        console.error(`💥 Worker fatal error for ${task.modelName}:`, error);
        process.exit(1);
    });
}

/**
 * Create a worker to process a single model
 */
export function createModelWorker(task: ModelProcessingTask): Promise<ModelProcessingResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
            workerData: task
        });

        worker.on('message', (result: ModelProcessingResult) => {
            resolve(result);
        });

        worker.on('error', (error) => {
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}
