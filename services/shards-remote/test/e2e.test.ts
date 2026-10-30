import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer as httpsServer } from 'node:https';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { GatewayClient } from '../src/gateway-client.ts';
import { createMcpListener } from '../src/mcp.ts';
import { close } from './fixture.ts';

test('official SDK reaches all 39 real Rust schemas and executes canonical vault operations', { skip: !process.env.SHARDS_GATEWAY_BIN }, async () => {
  const binary = process.env.SHARDS_GATEWAY_BIN!;
  assert.ok(binary.startsWith('/'), 'SHARDS_GATEWAY_BIN must be absolute');
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'shards-real-e2e-')));
  const vault = join(dir, 'vault'); await mkdir(vault);
  const core = join(dir, 'core.toml');
  await writeFile(core, `[core]\nvault_path = ${JSON.stringify(vault)}\n[tasks]\ncollections = ["bot"]\n`);
  const token = 'a'.repeat(64), connector = 'b'.repeat(64);
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const registry = join(dir, 'grants.json');
  await writeFile(registry, JSON.stringify({ schema_version: 1, vault_id: 'real-e2e', members: [{ id: 'bot', kind: 'agent', sponsor: null }], grants: [{ grant_id: 'e2e', token_sha256: digest(token), actor: 'bot', scopes: ['notes:write', 'tasks:write', 'memories:write', 'scratch:write', 'assets:write'], expires_at: '2099-01-01T00:00:00Z', revoked_at: null }], connectors: [{ connector_id: 'e2e', token_sha256: digest(connector), expires_at: '2099-01-01T00:00:00Z', revoked_at: null }] }), { mode: 0o600 });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  const ca = await readFile(join(dir, 'cert.pem'));
  // Reserve a disposable loopback port. No installed service or live vault is touched.
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const rustAddress = reservation.address(); if (!rustAddress || typeof rustAddress === 'string') throw new Error('port');
  const rustPort = rustAddress.port; await close(reservation);
  const tls = httpsServer({ key: await readFile(join(dir, 'key.pem')), cert: ca }, (req, res) => {
    const upstream = request({ host: '127.0.0.1', port: rustPort, method: req.method, path: req.url, headers: req.headers }, result => { res.writeHead(result.statusCode!, result.headers); result.pipe(res); });
    upstream.on('error', () => { res.writeHead(503); res.end(); });
    req.pipe(upstream);
  });
  tls.listen(0, '127.0.0.1'); await once(tls, 'listening');
  const tlsAddress = tls.address(); if (!tlsAddress || typeof tlsAddress === 'string') throw new Error('port');
  const receiverOrigin = `https://localhost:${tlsAddress.port}`;
  const config = join(dir, 'gateway.toml');
  await writeFile(config, `vault_id = "real-e2e"\nvault_path = ${JSON.stringify(vault)}\ncore_config = ${JSON.stringify(core)}\nexternal_origin = ${JSON.stringify(receiverOrigin)}\ngrants_file = ${JSON.stringify(registry)}\nlisten_port = ${rustPort}\n`);
  const rust = spawn(binary, ['serve', '--config', config], { stdio: ['ignore', 'ignore', 'pipe'] });
  const rustClosed = new Promise<void>(resolve => rust.once('close', () => resolve()));
  let diagnostics = ''; rust.stderr.on('data', chunk => { diagnostics += String(chunk); });
  const gateway = new GatewayClient({ receiverOrigin, vaultId: 'real-e2e', connectorToken: connector, timeoutMs: 5000 }, { ca });
  let listener: ReturnType<typeof createMcpListener>;
  const cloud = createServer((req, res) => listener(req, res));
  const client = new Client({ name: 'real-rust-acceptance', version: '1' });
  const wire: string[] = [];
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) { try { await gateway.probe(); ready = true; break; } catch { if (rust.exitCode !== null) break; await delay(20); } }
    assert.ok(ready, `disposable Rust receiver failed to start: ${diagnostics}`);
    const canonical = await gateway.describe(token);
    assert.equal(canonical.tools.length, 39);
    cloud.listen(0, '127.0.0.1'); await once(cloud, 'listening');
    const cloudAddress = cloud.address(); if (!cloudAddress || typeof cloudAddress === 'string') throw new Error('port');
    const privateOrigin = `http://127.0.0.1:${cloudAddress.port}`;
    listener = createMcpListener({ privateOrigin, gateway });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${privateOrigin}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: async (input, init) => { const response = await fetch(input, init); wire.push(await response.clone().text()); return response; },
    }));
    assert.deepEqual((await client.listTools()).tools, canonical.tools);
    assert.ok(!canonical.tools.some(tool => tool.name === 'shards_note_adopt' || tool.name.startsWith('host_')));
    const created = await client.callTool({ name: 'shards_note_new', arguments: { title: 'Synthetic SDK note', body: 'Synthetic SDK body' } });
    assert.equal(created.isError, undefined);
    const id = (created.structuredContent as Record<string, unknown>)?.id;
    assert.equal(typeof id, 'string');
    const read = await client.callTool({ name: 'shards_note_get', arguments: { id } });
    assert.match(String((read.structuredContent as Record<string, unknown>)?.body), /Synthetic SDK body/);
    const list = await client.callTool({ name: 'shards_note_list', arguments: {} });
    assert.ok(Array.isArray((list.structuredContent as Record<string, unknown>)?.result));
    assert.match(String((list.content?.[0] as { text?: string }).text), /^\[/);
    const error = await client.callTool({ name: 'shards_note_get', arguments: {} });
    assert.equal(error.isError, true);
    assert.equal(JSON.parse(String((error.content?.[0] as { text?: string }).text)).kind, 'validation');
    assert.doesNotMatch(JSON.stringify({ read, list, error }), new RegExp(dir));
    // The metadata is synthetic, but the parser and result producer are the real Rust core.
    // No blob with this size exists or is transferred.
    await mkdir(join(vault, 'assets'));
    await writeFile(join(vault, 'assets', 'a-111111111111.md'), '---\nid: a-111111111111\ntype: asset\ntitle: precision.bin\ntags: []\nowner: bot\ncreated: 2026-01-02T03:04:05Z\nupdated: 2026-01-02T03:04:05Z\nrelated: []\nfilename: precision.bin\nmedia_type: application/octet-stream\nbytes: 9007199254740993\nsha256: synthetic\nblob: a-111111111111.bin\n---\nSynthetic caption\n');
    const asset = await client.callTool({ name: 'shards_asset_get', arguments: { asset_id: 'a-111111111111' } });
    assert.equal(asset.isError, undefined);
    assert.match(String((asset.content?.[0] as { text?: string }).text), /"bytes":9007199254740993/);
    assert.ok(wire.some(text => /"bytes":9007199254740993/.test(text)), 'Rust integer token must reach the MCP wire unchanged');
    execFileSync(binary, ['grant', 'revoke', '--config', config, '--grant-id', 'e2e'], { stdio: 'pipe' });
    await assert.rejects(client.listTools());
    assert.doesNotMatch(diagnostics, /Synthetic SDK|a{64}|b{64}/);
  } finally {
    await client.close(); await close(cloud); await close(tls);
    rust.kill('SIGTERM');
    const timer = setTimeout(() => rust.kill('SIGKILL'), 1000); await rustClosed; clearTimeout(timer);
    await rm(dir, { recursive: true, force: true });
  }
});
