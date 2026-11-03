import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { connect } from 'node:net';
import type { Config } from './config.ts';
import { readConfig } from './config.ts';
import { GatewayClient } from './gateway-client.ts';
export interface ManagedChild extends EventEmitter { pid?: number; stop(): Promise<void> }
export interface Runtime { start(program: string, args: string[], env?: NodeJS.ProcessEnv): ManagedChild; command(program: string, args: string[], signal?: AbortSignal): Promise<void>; socketReady(path: string, signal: AbortSignal): Promise<void>; listenerReady(signal: AbortSignal): Promise<void>; probe(signal: AbortSignal): Promise<void> }
export async function supervise(config: Config, signal: AbortSignal, runtime: Runtime): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'shards-runtime-'));
  const socket = join(directory, 'tailscaled.sock');
  const keyFile = join(directory, 'enrollment');
  const proxy = new URL(config.proxy ?? 'http://127.0.0.1:1055');
  const proxyListener = `${proxy.hostname}:${proxy.port || '80'}`;
  const failureAbort = new AbortController();
  const startup = AbortSignal.timeout(60_000);
  const startupSignal = AbortSignal.any([signal, failureAbort.signal, startup]);
  let failure: Error | undefined;
  let advertisementAttempted = false;
  const children: ManagedChild[] = [];
  const handlers: (() => void)[] = [];
  const check = () => { if (failure) throw failure; startupSignal.throwIfAborted(); };
  const start = (program: string, args: string[]) => {
    const child = runtime.start(program, args, { ...process.env, TS_EXPERIMENTAL_SERVICE_AUTO_ADVERTISEMENT: 'false' });
    const exited = () => { failure = new Error('Managed child exited'); failureAbort.abort(); };
    child.once('exit', exited); child.once('error', exited);
    children.push(child); handlers.push(exited); return child;
  };
  try {
    check();
    await writeFile(keyFile, config.authKey, { mode: 0o600, flag: 'wx' });
    start('tailscaled', ['--tun=userspace-networking', '--state=mem:', `--socket=${socket}`, `--outbound-http-proxy-listen=${proxyListener}`]);
    await runtime.socketReady(socket, startupSignal); check();
    await runtime.command('tailscale', [`--socket=${socket}`, 'up', `--auth-key=file:${keyFile}`, `--hostname=${config.hostname}`, `--advertise-tags=${config.tags}`, '--accept-dns=false', '--accept-routes=false', '--timeout=30s'], startupSignal); check();
    await rm(keyFile);
    start('node', [fileURLToPath(new URL('./main.js', import.meta.url))]);
    await runtime.listenerReady(startupSignal); check();
    await runtime.probe(startupSignal); check();
    // Bare tailscaled has no containerboot auto-advertisement. Serve is the
    // first command that publishes this Service and only runs after the probe.
    advertisementAttempted = true;
    await runtime.command('tailscale', [`--socket=${socket}`, 'serve', `--service=${config.service}`, '--https=443', '--bg', `http://127.0.0.1:${config.port}`], startupSignal);
    if (failure) throw failure;
    if (!signal.aborted) await new Promise<void>(resolve => {
      const stop = () => { signal.removeEventListener('abort', stop); failureAbort.signal.removeEventListener('abort', stop); resolve(); };
      signal.addEventListener('abort', stop, { once: true }); failureAbort.signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted || failureAbort.signal.aborted) stop();
    });
    if (failure) throw failure;
  } catch (error) { if (failure) throw failure; if (!signal.aborted) throw error; }
  finally {
    // Withdraw before draining admitted work. Failed withdrawal still shuts
    // tailscaled down, removing this host from the Service.
    if (advertisementAttempted) {
      try { await runtime.command('tailscale', [`--socket=${socket}`, 'serve', 'drain', config.service], AbortSignal.timeout(2000)); } catch { /* Child termination remains mandatory. */ }
    }
    for (let i = 0; i < children.length; i++) { children[i].off('exit', handlers[i]); children[i].off('error', handlers[i]); }
    for (const child of children.toReversed()) { await child.stop(); }
    await rm(directory, { recursive: true, force: true });
  }
}

export function nativeRuntime(config: Config): Runtime {
  const gateway = new GatewayClient(config);
  return {
    start(program, args, env) {
      const child = spawn(program, args, { env, stdio: 'ignore' });
      const managed = new EventEmitter() as ManagedChild;
      managed.pid = child.pid;
      let closed = false;
      const done = new Promise<void>(resolve => child.once('close', () => { closed = true; resolve(); }));
      child.once('exit', () => managed.emit('exit'));
      child.once('error', () => managed.emit('error', new Error('Managed child failed')));
      managed.stop = async () => {
        if (closed) return;
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), program === 'tailscaled' ? 1000 : 21_000);
        await done; clearTimeout(timer);
      };
      return managed;
    },
    async listenerReady(signal) {
      for (;;) {
        signal.throwIfAborted();
        const ready = await new Promise<boolean>(resolve => {
          const socket = connect({ host: config.host, port: config.port, signal });
          socket.once('connect', () => { socket.destroy(); resolve(true); });
          socket.once('error', () => { socket.destroy(); resolve(false); });
        });
        if (ready) return;
        await delay(50, undefined, { signal });
      }
    },
    async command(program, args, signal) {
      signal?.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const child = spawn(program, args, { stdio: 'ignore', env: { ...process.env, TS_EXPERIMENTAL_SERVICE_AUTO_ADVERTISEMENT: 'false' } });
        let failed = false;
        let force: ReturnType<typeof setTimeout> | undefined;
        const abort = () => { child.kill('SIGTERM'); force = setTimeout(() => child.kill('SIGKILL'), 500); };
        signal?.addEventListener('abort', abort, { once: true });
        child.once('error', () => { failed = true; });
        child.once('close', code => {
          if (force) clearTimeout(force);
          signal?.removeEventListener('abort', abort);
          if (!failed && !signal?.aborted && code === 0) resolve(); else reject(new Error('Tailscale command failed'));
        });
        if (signal?.aborted) abort();
      });
    },
    async socketReady(path, signal) {
      for (;;) {
        signal.throwIfAborted();
        try { if ((await lstat(path)).isSocket()) return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await delay(50, undefined, { signal });
      }
    },
    probe: signal => gateway.probe(signal),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const shutdown = new AbortController();
  process.once('SIGTERM', () => shutdown.abort()); process.once('SIGINT', () => shutdown.abort());
  try { const config = readConfig(process.env); await supervise(config, shutdown.signal, nativeRuntime(config)); }
  catch { process.stderr.write('{"event":"supervisor_failed"}\n'); process.exitCode = 1; }
}
