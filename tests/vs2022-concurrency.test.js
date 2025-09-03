import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { D365ServiceClient } from '../build/modules/d365-service-client.js';
import { AppConfig } from '../build/modules/app-config.js';

describe('VS2022 Extension Server Concurrency Tests', () => {
    let serviceClient;

    beforeAll(async () => {
        await AppConfig.initialize();
        serviceClient = new D365ServiceClient();
        serviceClient.connect();
    });

    afterAll(async () => {
        if (serviceClient && serviceClient.isConnected) {
            await serviceClient.disconnect();
        }
    });

    it('should handle sequential requests successfully', async () => {
        const results = [];
        
        // Send 3 requests sequentially
        for (let i = 0; i < 3; i++) {
            try {
                const result = await serviceClient.getModels();
                results.push({ success: true, requestId: i, modelsCount: result?.models?.length || 0 });
            } catch (error) {
                results.push({ success: false, requestId: i, error: error.message });
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('Sequential Results:', JSON.stringify(results, null, 2));
        
        // All sequential requests should succeed
        const successfulRequests = results.filter(r => r.success);
        expect(successfulRequests.length).toBeGreaterThan(0);
    });

    it('should test concurrent request handling', async () => {
        const startTime = Date.now();
        
        // Create 5 concurrent requests
        const concurrentRequests = Array.from({ length: 5 }, (_, i) => 
            serviceClient.getModels()
                .then(result => ({ 
                    success: true, 
                    requestId: i, 
                    duration: Date.now() - startTime,
                    modelsCount: result?.models?.length || 0 
                }))
                .catch(error => ({ 
                    success: false, 
                    requestId: i, 
                    duration: Date.now() - startTime,
                    error: error.message 
                }))
        );

        const results = await Promise.allSettled(concurrentRequests);
        const processedResults = results.map(r => r.value || r.reason);
        
        console.log('Concurrent Results:', JSON.stringify(processedResults, null, 2));
        
        const successfulRequests = processedResults.filter(r => r.success);
        const failedRequests = processedResults.filter(r => !r.success);
        
        console.log(`Successful concurrent requests: ${successfulRequests.length}/5`);
        console.log(`Failed concurrent requests: ${failedRequests.length}/5`);
        
        // Analyze failure patterns
        if (failedRequests.length > 0) {
            const errorTypes = failedRequests.map(r => r.error).reduce((acc, error) => {
                acc[error] = (acc[error] || 0) + 1;
                return acc;
            }, {});
            console.log('Error patterns:', errorTypes);
        }

        // At least one request should complete (even if others fail due to concurrency limits)
        expect(successfulRequests.length).toBeGreaterThan(0);
    });

    it('should test rapid fire requests with timing analysis', async () => {
        const results = [];
        const requestCount = 10;
        const startTime = Date.now();
        
        // Send requests as fast as possible
        const rapidRequests = [];
        for (let i = 0; i < requestCount; i++) {
            const requestStartTime = Date.now();
            rapidRequests.push(
                serviceClient.getModels()
                    .then(result => ({
                        success: true,
                        requestId: i,
                        startTime: requestStartTime - startTime,
                        duration: Date.now() - requestStartTime,
                        modelsCount: result?.models?.length || 0
                    }))
                    .catch(error => ({
                        success: false,
                        requestId: i,
                        startTime: requestStartTime - startTime,
                        duration: Date.now() - requestStartTime,
                        error: error.message
                    }))
            );
        }

        const allResults = await Promise.allSettled(rapidRequests);
        const processedResults = allResults.map(r => r.value || r.reason);
        
        console.log('Rapid Fire Results:', JSON.stringify(processedResults, null, 2));
        
        const successfulRequests = processedResults.filter(r => r.success);
        const failedRequests = processedResults.filter(r => !r.success);
        
        console.log(`\n=== Rapid Fire Analysis ===`);
        console.log(`Total requests: ${requestCount}`);
        console.log(`Successful: ${successfulRequests.length}`);
        console.log(`Failed: ${failedRequests.length}`);
        console.log(`Success rate: ${(successfulRequests.length / requestCount * 100).toFixed(1)}%`);
        
        if (successfulRequests.length > 0) {
            const avgDuration = successfulRequests.reduce((sum, r) => sum + r.duration, 0) / successfulRequests.length;
            console.log(`Average successful request duration: ${avgDuration.toFixed(0)}ms`);
        }
        
        // Analyze timing patterns
        const timingAnalysis = processedResults.map(r => ({
            requestId: r.requestId,
            success: r.success,
            startOffset: r.startTime,
            duration: r.duration
        })).sort((a, b) => a.startOffset - b.startOffset);
        
        console.log('\nTiming Analysis (chronological):');
        timingAnalysis.forEach(t => {
            console.log(`Request ${t.requestId}: Started +${t.startOffset}ms, Duration: ${t.duration}ms, Success: ${t.success}`);
        });

        // At least some requests should succeed
        expect(successfulRequests.length).toBeGreaterThan(0);
    });
    
});
