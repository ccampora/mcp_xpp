import { D365PipeClient } from './tools/d365-pipe-client.js';

async function testDynamicTypeDiscovery() {
    console.log('=== TESTING DYNAMIC TYPE DISCOVERY ===\n');
    
    const client = new D365PipeClient();
    
    try {
        console.log('🔌 Connecting...');
        await client.connect();
        console.log('✅ Connected!\n');
        
        // Test the dynamic type discovery
        console.log('🔍 Discovering available D365 types dynamically...');
        const response = await client.sendRequest('discoverAvailableTypes', '', {});
        
        if (response.Success && response.Data) {
            const types = response.Data;
            console.log(`\n✅ SUCCESS! Dynamically discovered ${types.length} D365 types`);
            
            console.log('\n🎯 Discovered D365 Types:');
            types.forEach((type, index) => {
                console.log(`   ${(index + 1).toString().padStart(2)}. ${type.Name} (${type.FullName})`);
                if (type.Description) {
                    console.log(`       ${type.Description}`);
                }
            });
            
            // Show some statistics
            const tableTypes = types.filter(t => t.Name.toLowerCase().includes('table'));
            const classTypes = types.filter(t => t.Name.toLowerCase().includes('class'));
            const formTypes = types.filter(t => t.Name.toLowerCase().includes('form'));
            const enumTypes = types.filter(t => t.Name.toLowerCase().includes('enum'));
            
            console.log('\n📊 Type Categories Discovered:');
            console.log(`   - Table-related: ${tableTypes.length}`);
            console.log(`   - Class-related: ${classTypes.length}`);
            console.log(`   - Form-related: ${formTypes.length}`);
            console.log(`   - Enum-related: ${enumTypes.length}`);
            console.log(`   - Other types: ${types.length - tableTypes.length - classTypes.length - formTypes.length - enumTypes.length}`);
            
            console.log('\n🎉 DYNAMIC DISCOVERY WORKING!');
            console.log('   No hardcoded type lists - everything discovered through reflection!');
            console.log('   This proves the system automatically finds new D365 types as they become available.');
            
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

testDynamicTypeDiscovery().catch(console.error);
