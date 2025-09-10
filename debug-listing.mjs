import { D365PipeClient } from './tests/tools/d365-pipe-client.js';

const debugObjectListing = async () => {
    console.log('🔍 Debug Object Listing for Custom Model "cc"...\n');
    
    const client = new D365PipeClient();
    
    try {
        await client.connect();
        console.log('✅ Connected to D365 service');
        
        // Get detailed response for debugging
        const response = await client.sendRequest('list_objects_by_model', '', { model: 'cc' });
        
        console.log('\n📊 FULL RESPONSE STRUCTURE:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(response, null, 2));
        
        await client.disconnect();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        await client.disconnect();
    }
};

debugObjectListing().catch(console.error);
