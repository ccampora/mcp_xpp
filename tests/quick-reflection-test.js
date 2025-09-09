import { D365PipeClient } from './tools/d365-pipe-client.js';

async function testDynamicReflection() {
    console.log('=== TESTING DYNAMIC D365 REFLECTION ===\n');
    
    const client = new D365PipeClient();
    
    try {
        console.log('🔌 Connecting...');
        await client.connect();
        console.log('✅ Connected!\n');
        
        // Test the dynamic discovery
        console.log('🔍 Discovering AxTable capabilities...');
        const response = await client.sendRequest('discoverModificationCapabilities', '', {
            objectType: 'AxTable'
        });
        
        if (response.Success && response.Data) {
            const capabilities = response.Data;
            console.log(`\n✅ SUCCESS! Found ${capabilities.ModificationMethods?.length || 0} methods`);
            
            console.log('\n🎯 Key Methods Discovered:');
            capabilities.ModificationMethods?.slice(0, 7).forEach(method => {
                console.log(`   • ${method.Name}(${method.Parameters?.map(p => p.Type).join(', ') || ''})`);
            });
            
            console.log('\n🏗️  Related Field Types Available:');
            capabilities.RelatedTypeConstructors?.slice(0, 5).forEach(type => {
                console.log(`   • ${type.Name}`);
            });
            
            console.log('\n🎉 DYNAMIC REFLECTION WORKING!');
            console.log('   This proves agents can discover D365 capabilities in real-time');
            console.log('   without any hardcoded abstraction layers!');
            
        } else {
            console.log('❌ Failed:', response.Error);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        client.disconnect();
        console.log('\n🔌 Disconnected');
    }
}

testDynamicReflection().catch(console.error);
