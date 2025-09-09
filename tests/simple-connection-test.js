import { D365PipeClient } from './tools/d365-pipe-client.js';

async function simpleTest() {
    console.log('=== SIMPLE CONNECTION TEST ===\n');
    
    const client = new D365PipeClient();
    
    try {
        console.log('🔌 Connecting to D365 service...');
        await client.connect();
        console.log('✅ Connected successfully!\n');
        
        // Test basic ping first
        console.log('📡 Testing basic ping...');
        
        const response = await client.sendRequest('ping', '', {});
        console.log('Received response:', JSON.stringify(response, null, 2));
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        if (client.isConnected) {
            client.disconnect();
            console.log('\n🔌 Disconnected from service');
        }
    }
}

simpleTest().catch(console.error);
