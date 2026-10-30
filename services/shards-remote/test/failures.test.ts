import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect, type Socket } from 'node:net';
import { once } from 'node:events';
import { GatewayClient } from '../src/gateway-client.ts';
import { GatewayError, MAX_BYTES } from '../src/protocol.ts';
import { fixture, close } from './fixture.ts';

test('HTTPS receiver connection passes through the explicitly configured CONNECT proxy', async () => {
  const f = await fixture(); let tunnels = 0;
  const proxy = createServer();
  const sockets = new Set<Socket>();
  proxy.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  proxy.on('connect', (req, socket, head) => {
    tunnels++;
    const target = new URL(`https://${req.url}`);
    const upstream = connect(Number(target.port), '127.0.0.1', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket); });
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.on('close', () => upstream.destroy());
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('address');
  // This target cannot resolve locally. Success proves HTTPS uses CONNECT,
  // rather than opening an unused tunnel then falling back to direct DNS.
  const client = new GatewayClient({ receiverOrigin: f.origin.replace('localhost', 'receiver.invalid'), connectorToken: 'connector', vaultId: 'fixture-vault', timeoutMs: 1000, proxy: `http://127.0.0.1:${address.port}` }, { ca: f.ca });
  try { await client.probe(); assert.equal(tunnels, 1); assert.equal(f.calls[0].token, ''); await client.describe('alice'); assert.equal(tunnels, 2); }
  finally { for (const socket of sockets) socket.destroy(); await close(proxy); await f.cleanup(); }
});

test('default HTTPS origin uses an explicit port in the CONNECT authority and Host', async () => {
  const f = await fixture();
  const proxy = createServer();
  const sockets = new Set<Socket>();
  proxy.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  proxy.on('connect', (req, socket, head) => {
    if (req.url !== 'receiver.invalid:443' || req.headers.host !== 'receiver.invalid:443') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const upstream = connect(Number(new URL(f.origin).port), '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.on('close', () => upstream.destroy());
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('address');
  const client = new GatewayClient({ receiverOrigin: 'https://receiver.invalid', connectorToken: 'connector', vaultId: 'fixture-vault', timeoutMs: 1000, proxy: `http://127.0.0.1:${address.port}` }, { ca: f.ca });
  try { await client.probe(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, '/v1/probe'); }
  finally { for (const socket of sockets) socket.destroy(); await close(proxy); await f.cleanup(); }
});

test('redirects, wrong vault, transport loss and oversized request fail without replay', async () => {
  const f = await fixture();
  const client = new GatewayClient({ receiverOrigin: f.origin, connectorToken: 'connector', vaultId: 'fixture-vault', timeoutMs: 1000 }, { ca: f.ca });
  try {
    f.mode('redirect');
    await assert.rejects(client.describe('alice'), (error: GatewayError) => error.kind === 'unavailable');
    assert.equal(f.calls.length, 1);
    await assert.rejects(client.call('alice', 'shards_task_append', { text: 'x'.repeat(MAX_BYTES) }), (error: GatewayError) => error.kind === 'payload_too_large' && error.execution === 'not_started');
    assert.equal(f.calls.length, 1);
    f.mode('');
    const wrong = new GatewayClient({ ...client.config, vaultId: 'wrong' }, { ca: f.ca });
    await assert.rejects(wrong.probe(), (error: GatewayError) => error.kind === 'vault_mismatch');
    const untrusted = new GatewayClient(client.config);
    await assert.rejects(untrusted.probe(), (error: GatewayError) => error.kind === 'unavailable');
    assert.throws(() => new GatewayClient(client.config, { rejectUnauthorized: false }));
  } finally { await f.cleanup(); }
});

test('a redirected call has unknown execution and never follows or replays the request', async () => {
  const f = await fixture();
  const client = new GatewayClient({ receiverOrigin: f.origin, connectorToken: 'connector', vaultId: 'fixture-vault', timeoutMs: 1000 }, { ca: f.ca });
  try {
    f.mode('redirect');
    await assert.rejects(client.call('alice', 'shards_task_append', { id: 't-one', text: 'one append' }), (error: GatewayError) => error.kind === 'outcome_unknown' && error.execution === 'unknown');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, '/v1/call');
    await assert.rejects(client.probe(), (error: GatewayError) => error.kind === 'unavailable' && error.execution === 'not_started');
    assert.equal(f.calls.length, 2);
  } finally { await f.cleanup(); }
});

test('early authentication errors allow a null correlation ID; wrong non-null IDs fail closed', async () => {
  const f = await fixture();
  const client = new GatewayClient({ receiverOrigin: f.origin, connectorToken: 'connector', vaultId: 'fixture-vault', timeoutMs: 1000 }, { ca: f.ca });
  try {
    await assert.rejects(client.describe('invalid'), (error: GatewayError) => error.kind === 'unauthorized' && error.execution === 'not_started');
    f.control({ kind: 'forbidden', execution: 'not_started', status: 403, requestId: null });
    await assert.rejects(client.call('alice', 'shards_task_get', { id: 't-one' }), (error: GatewayError) => error.kind === 'forbidden' && error.execution === 'not_started');
    f.control({ kind: 'forbidden', execution: 'not_started', status: 403, requestId: 'wrong-request' });
    await assert.rejects(client.call('alice', 'shards_task_get', { id: 't-one' }), (error: GatewayError) => error.kind === 'outcome_unknown' && error.execution === 'unknown');
  } finally { await f.cleanup(); }
});
