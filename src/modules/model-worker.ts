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
                    model: task.modelName,
                    // Ensure we include data types (EDTs) in the enumeration when the service supports category filters.
                    // Older service versions will ignore unknown keys.
                    includeCategories: ['All', 'Data Types'],
                    includeTypePatterns: ['^AxEdt', '^Edt'],
                    // Back-compat aliases (service may accept different casing)
                    IncludeCategories: ['All', 'Data Types'],
                    IncludeTypePatterns: ['^AxEdt', '^Edt']
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
                    // Normalize common EDT type keys into a consistent index type.
                    // The service may return EDTs as AxEdt, Edt*, or other variants depending on enumeration strategy.
                    const normalizedType = ((): string => {
                        const t = String(objectType);
                        if (/^AxEdt$/i.test(t)) return 'AxEdt';
                        if (/^Edt/i.test(t)) return 'AxEdt';
                        return t;
                    })();

                    const objectArray = objectNames as string[];
                    
                    for (const objectName of objectArray) {
                        objects.push({
                            name: objectName,
                            path: `${task.modelName}/${normalizedType}/${objectName}`,
                            model: task.modelName,
                            type: normalizedType,
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
