import { createServer } from 'node:http';
import { readConfig } from './config.ts';
import { GatewayClient } from './gateway-client.ts';
import { createMcpListener } from './mcp.ts';

const config = readConfig(process.env);
const listener = createMcpListener({ privateOrigin: config.privateOrigin, gateway: new GatewayClient(config) });
const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 30_000, headersTimeout: 10_000 }, listener);
server.on('error', () => { process.stderr.write('{"event":"listener_failed"}\n'); process.exitCode = 1; });
server.listen(config.port, config.host);
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timer = setTimeout(() => { server.closeAllConnections(); }, 20_000);
  server.close(() => { clearTimeout(timer); });
}
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
