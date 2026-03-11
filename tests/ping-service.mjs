import { createConnection } from 'net';

const pipePath = String.raw`\\.\pipe\mcp-xpp-d365-service`;
console.log('Connecting to:', pipePath);

const client = createConnection(pipePath);
const timer = setTimeout(() => {
  console.log('TIMEOUT (5s) - pipe is not accepting connections');
  client.destroy();
  process.exit(1);
}, 5000);

client.on('connect', () => {
  clearTimeout(timer);
  console.log('CONNECTED to named pipe!');
  const req = JSON.stringify({ Id: 'ping-test', Action: 'ping', ObjectType: '', Parameters: {} }) + '\n';
  client.write(req);
  client.setTimeout(5000);
  client.on('data', d => {
    console.log('RESPONSE:', d.toString().trim());
    client.end();
    process.exit(0);
  });
  client.on('timeout', () => {
    console.log('Request timeout after 5s');
    client.end();
    process.exit(1);
  });
});

client.on('error', e => {
  clearTimeout(timer);
  console.log('ERROR:', e.code, e.message);
  process.exit(1);
});
