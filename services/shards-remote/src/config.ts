export interface Config {
  host: '127.0.0.1'; port: number; privateOrigin: string; receiverOrigin: string;
  vaultId: string; connectorToken: string; proxy?: string; timeoutMs: number;
  authKey: string; service: string; hostname: string; tags: string;
}
export function readConfig(env: Record<string, string | undefined>): Config {
  const required = (key: string) => { const value = env[key]; if (!value || /[\r\n]/.test(value)) throw new Error(`Invalid ${key}`); return value; };
  const origin = (key: string) => {
    const value = required(key); const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net') || url.origin !== value || url.username || url.password) throw new Error(`Invalid ${key}`);
    return value;
  };
  const proxy = env.SHARDS_OUTBOUND_PROXY ?? 'http://127.0.0.1:1055';
  const proxyUrl = new URL(proxy);
  if (proxyUrl.protocol !== 'http:' || proxyUrl.hostname !== '127.0.0.1' || proxyUrl.pathname !== '/' || proxyUrl.username || proxyUrl.password || proxyUrl.search || proxyUrl.hash) throw new Error('Invalid SHARDS_OUTBOUND_PROXY');
  const service = required('TS_SERVICE');
  const hostname = required('TS_HOSTNAME');
  const tags = required('TS_TAGS');
  if (!/^svc:[a-z][a-z0-9-]*$/.test(service) || !/^[a-z][a-z0-9-]*$/.test(hostname) || !/^tag:[a-z][a-z0-9-]*(,tag:[a-z][a-z0-9-]*)*$/.test(tags)) throw new Error('Invalid Tailscale names');
  return { host: '127.0.0.1', port: 8787, privateOrigin: origin('SHARDS_PRIVATE_ORIGIN'), receiverOrigin: origin('SHARDS_RECEIVER_ORIGIN'), vaultId: required('SHARDS_VAULT_ID'), connectorToken: required('SHARDS_CONNECTOR_TOKEN'), proxy, timeoutMs: 30_000, authKey: required('TS_AUTHKEY'), service, hostname, tags };
}
