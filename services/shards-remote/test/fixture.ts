import { createServer as httpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import type { Server } from 'node:http';

export const tools = [{ name: 'shards_task_get', description: 'Get task', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: ['string', 'null'], enum: ['open', null], default: null } }, required: ['id'] }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, { name: 'shards_task_append', description: 'Append task', inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } }];
export async function close(server: Server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
export async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'shards-cloud-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,DNS:receiver.invalid'], { stdio: 'ignore' });
  const ca = await readFile(join(dir, 'cert.pem'));
  let revoked = false;
  let mode = '';
  let control: { kind: string; status: number; execution: string; requestId?: string | null } | undefined;
  let gate: { entered(): void; promise: Promise<void> } | undefined;
  const calls: { path: string; token: string; body: any; raw: string }[] = [];
  const receiver = httpsServer({ key: await readFile(join(dir, 'key.pem')), cert: ca }, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const body = JSON.parse(raw);
    const token = String(req.headers.authorization ?? '');
    calls.push({ path: req.url!, token, body, raw });
    res.setHeader('content-type', 'application/json');
    const envelope = { v: 1, request_id: body.request_id, vault_id: 'fixture-vault' };
    if (req.headers['x-shards-connector'] !== 'connector' || (req.url !== '/v1/probe' && (revoked || !['Bearer alice', 'Bearer bob'].includes(token)))) {
      res.writeHead(401); res.end(JSON.stringify({ ...envelope, request_id: null, error: { kind: 'unauthorized', execution: 'not_started', message: 'secret /Users/fixture' } })); return;
    }
    if (req.url === '/v1/call' && gate) { const waiting = gate; gate = undefined; waiting.entered(); await waiting.promise; }
    if (mode === 'redirect') { res.writeHead(307, { location: 'https://public.invalid/' }); res.end(); return; }
    if (mode === 'drop' && req.url === '/v1/call') { req.socket.destroy(); return; }
    if (mode === 'busy' && req.url === '/v1/call') { res.writeHead(429); res.end(JSON.stringify({ ...envelope, error: { kind: 'busy', execution: 'not_started', message: 'secret' } })); return; }
    if (control && req.url === '/v1/call') { res.writeHead(control.status); res.end(JSON.stringify({ ...envelope, request_id: control.requestId === undefined ? body.request_id : control.requestId, error: { kind: control.kind, execution: control.execution, message: 'secret /Users/fixture' } })); return; }
    if (mode === 'oversized' && req.url === '/v1/call') { res.end(JSON.stringify({ ...envelope, mcp_result: { content: [{ type: 'text', text: 'x'.repeat(16 * 1024 * 1024) }] } })); return; }
    if (req.url === '/v1/probe') res.end(JSON.stringify(envelope));
    else if (req.url === '/v1/describe') res.end(JSON.stringify({ ...envelope, tools: token === 'Bearer bob' ? tools.slice(0, 1) : tools, instructions: 'Canonical receiver instructions' }));
    else if (body.arguments.id === 'domain-error') res.end(JSON.stringify({ ...envelope, mcp_result: { isError: true, content: [{ type: 'text', text: '{"kind":"not_found","message":"missing","next_action":"list"}' }] } }));
    else if (body.arguments.id === 'large') res.end(JSON.stringify({ ...envelope, mcp_result: { content: [{ type: 'text', text: '{"bytes":9007199254740993}' }], structuredContent: { bytes: JSON.rawJSON('9007199254740993') } } }));
    else res.end(JSON.stringify({ ...envelope, mcp_result: { content: [{ type: 'text', text: '[{"id":"t-one"}]' }], structuredContent: { result: [{ id: 't-one' }] } } }));
  });
  receiver.listen(0, '127.0.0.1'); await once(receiver, 'listening');
  const address = receiver.address(); if (!address || typeof address === 'string') throw new Error('fixture address');
  return { origin: `https://localhost:${address.port}`, ca, calls, revoke: () => { revoked = true; }, mode: (value: string) => { mode = value; }, control: (value: typeof control) => { control = value; }, hold() { let entered!: () => void; let release!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); const promise = new Promise<void>(resolve => { release = resolve; }); gate = { entered, promise }; return { started, release }; }, cleanup: async () => { await close(receiver); await rm(dir, { recursive: true, force: true }); } };
}
