const net = require('net');
const path = require('path');

// Test to debug assembly discovery in D365 reflection service
async function testAssemblyDiscovery() {
    console.log('=== DEBUGGING ASSEMBLY DISCOVERY ===\n');

    let client;
    try {
        console.log('🔌 Connecting...');
        client = new net.Socket();
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);

            client.connect('\\\\.\\pipe\\mcp-xpp-d365-service', () => {
                clearTimeout(timeout);
                resolve();
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        console.log('✅ Connected!');

        // Custom request to debug assembly discovery
        const debugRequest = {
            method: 'debugAssemblyDiscovery',
            params: {}
        };

        // Send the request
        const requestJson = JSON.stringify(debugRequest) + '\n';
        client.write(requestJson);

        // Wait for response
        const response = await new Promise((resolve, reject) => {
            let buffer = '';
            const timeout = setTimeout(() => {
                reject(new Error('Response timeout'));
            }, 10000);

            client.on('data', (data) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                
                for (let i = 0; i < lines.length - 1; i++) {
                    const line = lines[i].trim();
                    if (line) {
                        try {
                            const response = JSON.parse(line);
                            clearTimeout(timeout);
                            resolve(response);
                            return;
                        } catch (e) {
                            // Continue reading
                        }
                    }
                }
                
                buffer = lines[lines.length - 1];
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        console.log('📊 Debug Response:', JSON.stringify(response, null, 2));

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (client) {
            console.log('🔌 Disconnected');
            client.destroy();
        }
    }
}

testAssemblyDiscovery();
