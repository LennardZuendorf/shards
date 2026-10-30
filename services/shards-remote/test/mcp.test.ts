import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { GatewayClient } from '../src/gateway-client.ts';
import { createMcpListener } from '../src/mcp.ts';
import { fixture, tools, close } from './fixture.ts';
import { MAX_BYTES, parseLossless } from '../src/protocol.ts';

export async function setup() {
  const receiver = await fixture();
  const gateway = new GatewayClient({ receiverOrigin: receiver.origin, vaultId: 'fixture-vault', connectorToken: 'connector', timeoutMs: 1000 }, { ca: receiver.ca });
  let privateOrigin = '';
  let listener: ReturnType<typeof createMcpListener>;
  const server = createServer((req, res) => listener(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('address');
  privateOrigin = `http://127.0.0.1:${address.port}`;
  listener = createMcpListener({ privateOrigin, gateway });
  return { receiver, gateway, origin: privateOrigin, cleanup: async () => { await close(server); await receiver.cleanup(); } };
}

test('official SDK client preserves canonical raw tools, read/write, lists and domain errors', async () => {
  const f = await setup();
  const client = new Client({ name: 'acceptance', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: { authorization: 'Bearer alice' } } }));
    assert.deepEqual((await client.listTools()).tools, tools);
    assert.deepEqual((await client.callTool({ name: 'shards_task_get', arguments: { id: 't-one' } })).structuredContent, { result: [{ id: 't-one' }] });
    assert.equal((await client.callTool({ name: 'shards_task_append', arguments: { id: 't-one', text: 'new' } })).content?.[0]?.type, 'text');
    const error = await client.callTool({ name: 'shards_task_get', arguments: { id: 'domain-error' } });
    assert.equal(error.isError, true);
    assert.deepEqual(error.content, [{ type: 'text', text: '{"kind":"not_found","message":"missing","next_action":"list"}' }]);
  } finally { await client.close(); await f.cleanup(); }
});

test('HTTP isolation rejects sessions, authenticates notifications and rechecks revocation', async () => {
  const f = await setup();
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer alice', ...headers }, body: JSON.stringify(body) });
  try {
    for (const method of ['GET', 'DELETE']) assert.equal((await fetch(`${f.origin}/mcp`, { method })).status, 405);
    assert.equal((await post({}, { 'mcp-session-id': 'foreign' })).status, 400);
    assert.equal((await post({}, { 'last-event-id': 'foreign' })).status, 400);
    assert.equal((await post({}, { origin: 'null' })).status, 403);
    assert.equal((await post({}, { authorization: '' })).status, 401);
    const wrongHost = await new Promise(resolve => { const req = request(`${f.origin}/mcp`, { method: 'POST', headers: { host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.end('{}'); });
    assert.equal(wrongHost, 403);
    assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'negative', version: '1' } } }, { authorization: 'Bearer invalid' })).status, 401);
    assert.equal((await post({ content: 'x'.repeat(MAX_BYTES) })).status, 413);
    assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const list = { jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} };
    const a = await post(list); assert.equal(a.headers.get('mcp-session-id'), null); assert.match(a.headers.get('content-type')!, /application\/json/);
    assert.equal(parseLossless(await a.text()).result.tools.length, 2);
    assert.equal(parseLossless(await (await post(list, { authorization: 'Bearer bob' })).text()).result.tools.length, 1);
    f.receiver.revoke();
    assert.equal((await post(list)).status, 401);
    assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 401);
  } finally { await f.cleanup(); }
});

test('all gateway control status families preserve execution state and redact diagnostics', async () => {
  const f = await setup();
  const statuses = [['unauthorized', 401], ['forbidden', 403], ['invalid_request', 400], ['version_mismatch', 409], ['vault_mismatch', 409], ['busy', 429], ['unavailable', 503], ['deadline_exceeded', 504], ['outcome_unknown', 504], ['payload_too_large', 413], ['response_too_large', 413]] as const;
  try {
    for (const [kind, status] of statuses) {
      const execution = kind === 'outcome_unknown' ? 'unknown' : kind === 'response_too_large' ? 'completed' : 'not_started';
      f.receiver.control({ kind, status, execution });
      const response = await fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer alice' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'shards_task_append', arguments: { id: 't-one', text: 'sensitive-content' } } }) });
      const text = await response.text();
      const result = parseLossless(text).result;
      assert.equal(result.isError, true); assert.equal(result.structuredContent.kind, kind); assert.equal(result.structuredContent.execution, execution);
      assert.doesNotMatch(text, /secret|Users|sensitive-content/);
    }
    f.receiver.control(undefined);
    f.receiver.mode('oversized');
    await assert.rejects(f.gateway.call('alice', 'shards_task_get', { id: 't-one' }), (error: any) => error.kind === 'response_too_large' && error.execution === 'completed');
  } finally { await f.cleanup(); }
});

test('wire integers retain decimal tokens and gateway loss never replays a write', async () => {
  const f = await setup();
  const call = (id: string) => fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer alice' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'shards_task_get', arguments: { id } } }) });
  try {
    assert.match(await (await call('large')).text(), /"bytes":9007199254740993/);
    f.receiver.mode('drop');
    const lost = parseLossless(await (await call('t-one')).text());
    assert.equal(lost.result.isError, true);
    assert.equal(lost.result.structuredContent.execution, 'unknown');
    assert.equal(f.receiver.calls.filter(c => c.path === '/v1/call' && c.body.arguments.id === 't-one').length, 1);
    f.receiver.mode('busy');
    assert.equal(parseLossless(await (await call('busy')).text()).result.structuredContent.execution, 'not_started');
  } finally { await f.cleanup(); }
});

test('unsafe integer call arguments retain exact decimal tokens on the Rust RPC wire', async () => {
  const f = await setup();
  try {
    const response = await fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer alice' }, body: '{"jsonrpc":"2.0","id":41,"method":"tools/call","params":{"name":"shards_task_get","arguments":{"id":"t-one","bytes":9007199254740993}}}' });
    assert.equal(response.status, 200); await response.text();
    const calls = f.receiver.calls.filter(call => call.path === '/v1/call');
    assert.equal(calls.length, 1); assert.match(calls[0].raw, /"bytes":9007199254740993(?:[,}])/);
    assert.doesNotMatch(calls[0].raw, /"bytes":(?:9007199254740992|"9007199254740993")/);
  } finally { await f.cleanup(); }
});

test('a cancellation POST cannot cancel another POST with the same request ID', async () => {
  const f = await setup(); const gate = f.receiver.hold();
  const post = (body: unknown, token = 'alice') => fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  try {
    const running = post({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'shards_task_append', arguments: { id: 't-one', text: 'append-once' } } });
    await gate.started;
    const cancel = await post({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 99, reason: 'other POST' } });
    assert.equal(cancel.status, 202); assert.equal(await cancel.text(), '');
    const other = await post({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }, 'bob');
    assert.equal(parseLossless(await other.text()).result.tools.length, 1);
    gate.release();
    assert.equal(parseLossless(await (await running).text()).result.structuredContent.result[0].id, 't-one');
    assert.equal(f.receiver.calls.filter(call => call.path === '/v1/call').length, 1);
  } finally { gate.release(); await f.cleanup(); }
});

test('deadline during admitted call returns unknown execution without replay', async () => {
  const f = await setup(); const gate = f.receiver.hold();
  try {
    const response = fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer alice' }, body: JSON.stringify({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'shards_task_append', arguments: { id: 't-one', text: 'once' } } }) });
    await gate.started;
    const body = parseLossless(await (await response).text());
    assert.equal(body.result.structuredContent.execution, 'unknown');
    assert.equal(f.receiver.calls.filter(call => call.path === '/v1/call').length, 1);
  } finally { gate.release(); await f.cleanup(); }
});
