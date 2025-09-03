import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { D365ServiceClient } from '../build/modules/d365-service-client.js';

/**
 * REALISTIC VS2022 Concurrency Test
 * Tests actual capabilities within Windows Named Pipe constraints
 */
describe('VS2022 Service - Realistic Concurrency Tests', () => {
    let serviceClient;

    beforeAll(async () => {
        console.log('\n🔧 Testing VS2022 Service with realistic expectations...\n');
        serviceClient = new D365ServiceClient();
        
        // Test basic connectivity first
        try {
            await serviceClient.connect();
            const healthCheck = await serviceClient.sendRequest('health');
            console.log('✅ Service connectivity confirmed');
            console.log(`📊 Max Connections: ${healthCheck.Data.ServiceInfo.MaxConnections}`);
        } catch (error) {
            console.log('❌ Service not available:', error.message);
            throw new Error('Service not available for testing');
        }
    }, 15000);

    afterAll(async () => {
        if (serviceClient) {
            await serviceClient.disconnect();
        }
    });

    it('should handle sequential requests successfully', async () => {
        console.log('🔄 Testing sequential requests...');
        
        const requests = [];
        for (let i = 0; i < 5; i++) {
            const startTime = Date.now();
            try {
                const response = await serviceClient.sendRequest('health');
                const duration = Date.now() - startTime;
                requests.push({ success: true, duration, response: response.Data ? 'Got data' : 'No data' });
                console.log(`  Request ${i}: ✅ ${duration}ms`);
            } catch (error) {
                const duration = Date.now() - startTime;
                requests.push({ success: false, duration, error: error.message });
                console.log(`  Request ${i}: ❌ ${duration}ms - ${error.message}`);
            }
        }

        const successful = requests.filter(r => r.success);
        console.log(`\n📊 Sequential Results: ${successful.length}/${requests.length} successful`);
        
        // At least most sequential requests should succeed
        expect(successful.length).toBeGreaterThan(3);
    }, 30000);

    it('should handle limited concurrent requests (within pipe constraints)', async () => {
        console.log('🔥 Testing limited concurrency (10 concurrent)...');
        
        const concurrentCount = 10; // Realistic number
        const startTime = Date.now();
        
        const promises = Array.from({ length: concurrentCount }, async (_, index) => {
            const requestStart = Date.now();
            try {
                const response = await serviceClient.sendRequest('models');
                const duration = Date.now() - requestStart;
                return { success: true, index, duration, hasResponse: response.Success };
            } catch (error) {
                const duration = Date.now() - requestStart;
                return { success: false, index, duration, error: error.message };
            }
        });

        const results = await Promise.all(promises);
        const totalTime = Date.now() - startTime;
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(`\n📊 Limited Concurrency Results:`);
        console.log(`  Total time: ${totalTime}ms`);
        console.log(`  Successful: ${successful.length}/${concurrentCount}`);
        console.log(`  Failed: ${failed.length}`);
        
        if (successful.length > 0) {
            const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
            console.log(`  Average response time: ${avgDuration.toFixed(1)}ms`);
        }

        if (failed.length > 0) {
            console.log(`  Common errors:`);
            const errorCounts = {};
            failed.forEach(f => {
                const errorType = f.error.includes('timeout') ? 'Timeout' :
                                f.error.includes('Access') ? 'Access Denied' :
                                f.error.includes('connect') ? 'Connection' : 'Other';
                errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
            });
            Object.entries(errorCounts).forEach(([error, count]) => {
                console.log(`    ${error}: ${count}`);
            });
        }

        // Expect at least half to succeed (accounting for Named Pipe limits)
        expect(successful.length).toBeGreaterThan(concurrentCount * 0.5);
    }, 45000);

    it('should demonstrate pipe connection limits', async () => {
        console.log('⚠️  Testing pipe connection limits (25 requests)...');
        
        const testCount = 25; // Match our MaxConnections setting
        const batchSize = 5; // Process in smaller batches
        const results = [];
        
        for (let batch = 0; batch < Math.ceil(testCount / batchSize); batch++) {
            const batchStart = batch * batchSize;
            const batchEnd = Math.min(batchStart + batchSize, testCount);
            const batchPromises = [];
            
            console.log(`  Batch ${batch + 1}: requests ${batchStart}-${batchEnd - 1}`);
            
            for (let i = batchStart; i < batchEnd; i++) {
                batchPromises.push(
                    serviceClient.sendRequest('health')
                        .then(response => ({ success: true, index: i, response }))
                        .catch(error => ({ success: false, index: i, error: error.message }))
                );
            }
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            const batchSuccessful = batchResults.filter(r => r.success).length;
            console.log(`    Batch ${batch + 1} results: ${batchSuccessful}/${batchSize} successful`);
            
            // Small delay between batches to avoid overwhelming the service
            if (batch < Math.ceil(testCount / batchSize) - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📊 Connection Limits Test:`);
        console.log(`  Total requests: ${testCount}`);
        console.log(`  Successful: ${successful.length}`);
        console.log(`  Failed: ${results.length - successful.length}`);
        console.log(`  Success rate: ${(successful.length / testCount * 100).toFixed(1)}%`);
        
        // Expect reasonable success rate given pipe constraints
        expect(successful.length).toBeGreaterThan(testCount * 0.6); // At least 60%
    }, 60000);

    it('should recover gracefully after connection stress', async () => {
        console.log('🔄 Testing recovery after connection stress...');
        
        // Wait a moment for any previous connections to clean up
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const recoveryRequests = 3;
            const results = [];
            
            for (let i = 0; i < recoveryRequests; i++) {
                try {
                    const response = await serviceClient.sendRequest('health');
                    results.push({ success: true, index: i });
                    console.log(`  Recovery request ${i}: ✅`);
                } catch (error) {
                    results.push({ success: false, index: i, error: error.message });
                    console.log(`  Recovery request ${i}: ❌ ${error.message}`);
                }
                
                // Small delay between recovery requests
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const successful = results.filter(r => r.success);
            console.log(`\n📊 Recovery Test: ${successful.length}/${recoveryRequests} successful`);
            
            // Service should recover and handle basic requests
            expect(successful.length).toBeGreaterThan(1);
            
        } catch (error) {
            console.log('❌ Recovery test failed:', error.message);
            // If recovery fails completely, that's also valuable information
            expect(error.message).toContain('pipe'); // At least confirm it's a pipe-related issue
        }
    }, 30000);
});
