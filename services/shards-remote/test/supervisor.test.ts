import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { supervise, nativeRuntime, type Runtime, type ManagedChild } from '../src/supervisor.ts';
import { readConfig } from '../src/config.ts';

const config = readConfig({ SHARDS_PRIVATE_ORIGIN: 'https://shards.example.ts.net', SHARDS_RECEIVER_ORIGIN: 'https://vault.example.ts.net', SHARDS_VAULT_ID: 'fixture', SHARDS_CONNECTOR_TOKEN: 'fixture-connector', TS_AUTHKEY: 'fixture-enrollment', TS_SERVICE: 'svc:shards', TS_HOSTNAME: 'shards-cloud', TS_TAGS: 'tag:shards-cloud' });
function harness(fail?: 'enroll' | 'probe') {
  const events: string[] = []; const children: ManagedChild[] = [];
  const abort = new AbortController();
  const runtime: Runtime = {
    start(program) {
      events.push(`start:${program}`);
      const child = new EventEmitter() as ManagedChild;
      child.stop = async () => { events.push(`stop:${program}`); child.emit('exit', 0); };
      children.push(child); return child;
    },
    socketReady: async () => { events.push('socket-ready'); },
    listenerReady: async () => { events.push('listener-ready'); },
    command: async (_program, args) => {
      if (args.includes('up')) { events.push('enroll'); if (fail === 'enroll') throw new Error('fixture enrollment secret'); }
      else if (args.includes('drain')) events.push('withdraw');
      else { events.push('advertise'); abort.abort(); }
    },
    probe: async () => { events.push('probe'); if (fail === 'probe') throw new Error('fixture probe secret'); },
  };
  return { events, children, runtime, abort };
}

test('supervisor probes before advertising and withdraws before draining both children', async () => {
  const f = harness(); await supervise(config, f.abort.signal, f.runtime);
  assert.deepEqual(f.events, ['start:tailscaled', 'socket-ready', 'enroll', 'start:node', 'listener-ready', 'probe', 'advertise', 'withdraw', 'stop:node', 'stop:tailscaled']);
});

test('a configured loopback proxy port also sets the tailscaled listener port', async () => {
  const f = harness();
  const custom = readConfig({ SHARDS_PRIVATE_ORIGIN: 'https://shards.example.ts.net', SHARDS_RECEIVER_ORIGIN: 'https://vault.example.ts.net', SHARDS_VAULT_ID: 'fixture', SHARDS_CONNECTOR_TOKEN: 'fixture-connector', TS_AUTHKEY: 'fixture-enrollment', TS_SERVICE: 'svc:shards', TS_HOSTNAME: 'shards-cloud', TS_TAGS: 'tag:shards-cloud', SHARDS_OUTBOUND_PROXY: 'http://127.0.0.1:11055' });
  let listenerArgs: string[] = [];
  const start = f.runtime.start;
  f.runtime.start = (program, args, env) => { if (program === 'tailscaled') listenerArgs = args; return start(program, args, env); };
  await supervise(custom, f.abort.signal, f.runtime);
  assert.ok(listenerArgs.includes('--outbound-http-proxy-listen=127.0.0.1:11055'));
});

test('native child shutdown reaps its process', async () => {
  const child = nativeRuntime(config).start(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  assert.ok(child.pid);
  await child.stop();
  assert.throws(() => process.kill(child.pid!, 0), { code: 'ESRCH' });
});

test('aborted enrollment commands reap children that ignore SIGTERM', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shards-command-'));
  const file = join(dir, 'pid');
  const abort = new AbortController();
  const command = nativeRuntime(config).command(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); require("fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)', file], abort.signal);
  let pid: number | undefined;
  try {
    for (let attempt = 0; attempt < 100; attempt++) { try { pid = Number(await readFile(file, 'utf8')); break; } catch { await delay(10); } }
    assert.ok(pid, 'child must install its signal handler before cancellation');
    abort.abort();
    await assert.rejects(command);
    assert.throws(() => process.kill(pid!, 0), { code: 'ESRCH' });
  } finally { abort.abort(); if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* Already reaped. */ } } await command.catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});
test('enrollment and receiver failures never advertise and stop all started children', async () => {
  for (const fail of ['enroll', 'probe'] as const) {
    const f = harness(fail);
    await assert.rejects(supervise(config, f.abort.signal, f.runtime));
    assert.equal(f.events.includes('advertise'), false);
    assert.equal(f.events.filter(e => e.startsWith('stop:')).length, f.children.length);
  }
});
test('unexpected child exit aborts startup and terminates the other child', async () => {
  const f = harness();
  f.runtime.probe = async () => { f.children[0].emit('exit', 1); await new Promise(resolve => setImmediate(resolve)); };
  await assert.rejects(supervise(config, f.abort.signal, f.runtime));
  assert.equal(f.events.includes('advertise'), false);
  assert.equal(f.events.filter(e => e.startsWith('stop:')).length, 2);
});
