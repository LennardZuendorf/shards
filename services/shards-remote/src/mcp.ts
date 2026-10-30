import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { GatewayClient } from './gateway-client.ts';
import { MAX_BYTES, GatewayError, controlResult, parseLossless } from './protocol.ts';

export function createMcpListener(options: { privateOrigin: string; gateway: GatewayClient; maxConcurrent?: number }) {
  let active = 0;
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number) => { if (res.writableEnded) return; if (!res.headersSent) { if (status === 401) res.setHeader('www-authenticate', 'Bearer realm="shards-private"'); res.writeHead(status); } res.end(); };
    const origin = new URL(options.privateOrigin);
    if (req.headers.host !== origin.host || (req.headers.origin !== undefined && req.headers.origin !== origin.origin)) { reply(403); return; }
    if (req.url !== '/mcp') { reply(404); return; }
    if (req.method !== 'POST') { res.setHeader('allow', 'POST'); reply(405); return; }
    if (req.headers['mcp-session-id'] !== undefined || req.headers['last-event-id'] !== undefined) { reply(400); return; }
    const bearer = req.headers.authorization?.match(/^Bearer ([^\s]+)$/);
    if (!bearer) { reply(401); return; }
    if (active >= (options.maxConcurrent ?? 64)) { reply(429); return; }
    active++;
    const abort = new AbortController();
    let sdkHandling = false;
    let readingBody = true;
    const deadline = setTimeout(() => {
      abort.abort();
      // After SDK dispatch, the call handler owns the JSON-RPC reply and maps
      // the abort to an explicit unknown execution result.
      if (!sdkHandling) { reply(504); if (readingBody) req.destroy(); }
    }, options.gateway.config.timeoutMs);
    const disconnect = () => { if (!res.writableFinished) abort.abort(); };
    res.once('close', disconnect);
    let server: Server | undefined;
    try {
      const chunks: Buffer[] = []; let size = 0;
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) { reply(415); return; }
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) { reply(413); return; } chunks.push(chunk); }
      readingBody = false;
      let body;
      try { body = parseLossless(Buffer.concat(chunks).toString('utf8')); } catch { reply(400); return; }
      // No authority survives this POST. Even initialize and notifications call Rust.
      const description = await options.gateway.describe(bearer[1], abort.signal);
      abort.signal.throwIfAborted();
      server = new Server({ name: 'shards-private', version: '0.1.0' }, { capabilities: { tools: {} }, instructions: description.instructions });
      server.setRequestHandler('tools/list', async () => ({ tools: description.tools }));
      server.setRequestHandler('tools/call', async request => {
        if (!description.tools.some(tool => tool.name === request.params.name)) return controlResult(new GatewayError('forbidden', 'not_started', 403));
        try { return await options.gateway.call(bearer[1], request.params.name, request.params.arguments ?? {}, abort.signal); }
        catch (error) { return controlResult(error instanceof GatewayError ? error : new GatewayError('outcome_unknown', 'unknown', 504)); }
      });
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      sdkHandling = true;
      await transport.handleRequest(req, res, body);
    } catch (error) { reply(error instanceof GatewayError ? error.status : 503); }
    finally { clearTimeout(deadline); res.off('close', disconnect); active--; await server?.close(); }
  };
}
