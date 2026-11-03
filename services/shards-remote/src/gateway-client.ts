import { request as httpsRequest, Agent } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import { randomUUID } from 'node:crypto';
import type { ConnectionOptions } from 'node:tls';
import type { Tool, CallToolResult } from '@modelcontextprotocol/server';
import type { Config } from './config.ts';
import { MAX_BYTES, GatewayError, parseLossless } from './protocol.ts';

type ClientConfig = Pick<Config, 'receiverOrigin' | 'vaultId' | 'connectorToken' | 'timeoutMs' | 'proxy'>;
export interface Description { tools: Tool[]; instructions: string }
const kinds = new Map([['unauthorized', 401], ['forbidden', 403], ['invalid_request', 400], ['version_mismatch', 409], ['vault_mismatch', 409], ['busy', 429], ['unavailable', 503], ['deadline_exceeded', 504], ['outcome_unknown', 504], ['payload_too_large', 413], ['response_too_large', 413]]);
export class GatewayClient {
  readonly config: ClientConfig;
  private readonly tls: ConnectionOptions;
  constructor(config: ClientConfig, tls: ConnectionOptions = {}) {
    const origin = new URL(config.receiverOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== config.receiverOrigin || origin.username || origin.password || tls.rejectUnauthorized === false) throw new Error('Invalid receiver TLS configuration');
    this.config = config; this.tls = tls;
  }
  async probe(signal?: AbortSignal): Promise<void> { await this.rpc('probe', undefined, {}, signal); }
  async describe(token: string, signal?: AbortSignal): Promise<Description> {
    const result = await this.rpc('describe', token, {}, signal);
    if (!Array.isArray(result.tools) || typeof result.instructions !== 'string' || result.tools.some((tool: any) => !tool || typeof tool.name !== 'string' || !tool.name.startsWith('shards_') || tool.name === 'shards_note_adopt' || !tool.inputSchema || tool.inputSchema.type !== 'object')) throw new GatewayError('unavailable', 'not_started', 503);
    return result;
  }
  async call(token: string, tool: string, args: unknown, signal?: AbortSignal): Promise<CallToolResult> {
    const result = await this.rpc('call', token, { tool, arguments: args }, signal);
    if (!result.mcp_result || !Array.isArray(result.mcp_result.content)) throw new GatewayError('outcome_unknown', 'unknown', 504);
    return result.mcp_result;
  }
  private async rpc(route: 'probe' | 'describe' | 'call', token: string | undefined, fields: object, signal?: AbortSignal): Promise<any> {
    const requestId = randomUUID();
    const body = JSON.stringify({ v: 1, request_id: requestId, vault_id: this.config.vaultId, deadline_ms: Date.now() + this.config.timeoutMs, ...fields });
    if (Buffer.byteLength(body) > MAX_BYTES) throw new GatewayError('payload_too_large', 'not_started', 413);
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const url = new URL(`/v1/${route}`, this.config.receiverOrigin);
    let possibleDispatch = false;
    let socket: ReturnType<typeof tlsConnect> | undefined;
    let agent: Agent | undefined;
    try {
      socket = this.config.proxy ? await this.tunnel(url, abort) : undefined;
      if (socket) {
        // ClientRequest ignores its createConnection option with agent:false.
        // Supply the tunnel through a dedicated Agent, with no direct fallback.
        agent = new Agent({ keepAlive: false });
        const tunnel = socket;
        agent.createConnection = () => tunnel;
      }
      const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
        const req = httpsRequest(url, { method: 'POST', ...this.tls, rejectUnauthorized: true, signal: abort, agent: agent ?? false, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-shards-connector': this.config.connectorToken, ...(token ? { authorization: `Bearer ${token}` } : {}) } }, async res => {
          try {
            const chunks: Buffer[] = []; let size = 0;
            for await (const chunk of res) { size += chunk.length; if (size > MAX_BYTES) { res.destroy(); throw new GatewayError('response_too_large', route === 'call' && res.statusCode! >= 200 && res.statusCode! < 300 ? 'completed' : 'unknown', 413); } chunks.push(chunk); }
            resolve({ status: res.statusCode ?? 503, text: Buffer.concat(chunks).toString('utf8') });
          } catch (error) { reject(error); }
        });
        req.on('error', reject);
        // Once submitted, a network failure cannot establish whether Rust executed it.
        possibleDispatch = true;
        req.end(body);
      });
      // A redirect is not a verified Rust execution receipt. Never follow it;
      // after submitting a call, its execution state remains unknown.
      if (response.status >= 300 && response.status < 400) throw new Error('Receiver redirect refused');
      const result = parseLossless(response.text);
      if (!result || result.v !== 1) throw new Error('Invalid envelope');
      if (response.status < 200 || response.status >= 300) {
        const error = result.error;
        if (!error || kinds.get(error.kind) !== response.status || !['not_started', 'unknown', 'completed'].includes(error.execution) || (result.request_id !== null && result.request_id !== requestId)) throw new Error('Invalid control failure');
        throw new GatewayError(error.kind, error.execution, response.status);
      }
      if (result.request_id !== requestId) throw new Error('Invalid response correlation');
      if (result.vault_id !== this.config.vaultId) throw new GatewayError('vault_mismatch', route === 'call' ? 'unknown' : 'not_started', 409);
      return result;
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(route === 'call' && possibleDispatch ? 'outcome_unknown' : 'unavailable', route === 'call' && possibleDispatch ? 'unknown' : 'not_started', route === 'call' && possibleDispatch ? 504 : 503);
    } finally { agent?.destroy(); socket?.destroy(); }
  }
  private async tunnel(target: URL, signal: AbortSignal) {
    const proxy = new URL(this.config.proxy!);
    if (proxy.protocol !== 'http:' || proxy.hostname !== '127.0.0.1' || proxy.username || proxy.password) throw new GatewayError('unavailable', 'not_started', 503);
    return new Promise<ReturnType<typeof tlsConnect>>((resolve, reject) => {
      const authority = `${target.hostname}:${target.port || '443'}`;
      const req = httpRequest({ hostname: proxy.hostname, port: proxy.port, method: 'CONNECT', path: authority, headers: { host: authority }, signal });
      req.on('error', reject);
      req.on('connect', (res, socket, head) => {
        if (res.statusCode !== 200 || head.length !== 0) { socket.destroy(); reject(new Error('CONNECT refused')); return; }
        const tls = tlsConnect({ ...this.tls, socket, servername: target.hostname, rejectUnauthorized: true });
        const abort = () => tls.destroy(new Error('Deadline exceeded'));
        signal.addEventListener('abort', abort, { once: true });
        tls.once('close', () => signal.removeEventListener('abort', abort));
        tls.once('error', reject); tls.once('secureConnect', () => resolve(tls));
      });
      req.end();
    });
  }
}
