import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLossless, controlResult, GatewayError } from '../src/protocol.ts';
import { readConfig } from '../src/config.ts';

test('unsafe integer tokens survive JSON decoding and serialization exactly', () => {
  const value = parseLossless('{"bytes":9007199254740993,"max":18446744073709551615,"ordinary":42}');
  assert.equal(JSON.stringify(value), '{"bytes":9007199254740993,"max":18446744073709551615,"ordinary":42}');
});

test('control errors retain execution states without leaking receiver diagnostics', () => {
  for (const execution of ['not_started', 'unknown', 'completed'] as const) {
    const result = controlResult(new GatewayError('outcome_unknown', execution, 504));
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).execution, execution);
  }
});

test('configuration requires private HTTPS origins and runtime credentials', () => {
  const env = { SHARDS_PRIVATE_ORIGIN: 'https://shards.example.ts.net', SHARDS_RECEIVER_ORIGIN: 'https://vault.example.ts.net', SHARDS_VAULT_ID: 'test-vault', SHARDS_CONNECTOR_TOKEN: 'connector', TS_AUTHKEY: 'enrollment', TS_SERVICE: 'svc:shards', TS_HOSTNAME: 'shards-cloud', TS_TAGS: 'tag:shards-cloud' };
  assert.equal(readConfig(env).host, '127.0.0.1');
  for (const key of Object.keys(env)) {
    assert.throws(() => readConfig({ ...env, [key]: '' }));
  }
  assert.throws(() => readConfig({ ...env, SHARDS_RECEIVER_ORIGIN: 'http://vault.example.ts.net' }));
  assert.throws(() => readConfig({ ...env, SHARDS_RECEIVER_ORIGIN: 'https://public.example.com' }));
  assert.throws(() => readConfig({ ...env, SHARDS_OUTBOUND_PROXY: 'http://public.example.com:1055' }));
});
