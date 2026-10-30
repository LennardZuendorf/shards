import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { feature, workspace, put } from './test-support.mjs';

test('CLI version output is the bare version contract', async () => {
  const { assertCliVersion } = await feature('verify');
  assert.equal(typeof assertCliVersion, 'function');
  assert.doesNotThrow(() => assertCliVersion('0.2.0\n', '0.2.0'));
  assert.throws(() => assertCliVersion('shards 0.2.0\n', '0.2.0'), /version/);
});

test('runtime evidence refuses a target different from the executing architecture', async () => {
  const { assertNativeTarget } = await feature('verify');
  assert.equal(typeof assertNativeTarget, 'function');
  assert.doesNotThrow(() => assertNativeTarget('aarch64-apple-darwin', 'darwin', 'arm64'));
  assert.throws(() => assertNativeTarget('x86_64-apple-darwin', 'darwin', 'arm64'), /native/);
  assert.doesNotThrow(() => assertNativeTarget('x86_64-unknown-linux-gnu', 'linux', 'x64'));
});

test('verification rejects missing actual MCP shim even if CLI exists', async t => {
  const { verifyCli } = await feature('verify');
  const dir = workspace(t); chmodSync(put(dir, 'bin/shards', '#!/bin/sh\necho shards 0.2.0\n'), 0o755);
  assert.throws(() => verifyCli({ directory: dir, version: '0.2.0', target: 'aarch64-apple-darwin' }), /shards-mcp/);
});
test('archive extraction rejects traversal and symlinks before extraction', async t => {
  const { validateArchiveEntries } = await feature('verify');
  assert.doesNotThrow(() => validateArchiveEntries(['./bin/shards', './bin/shards-mcp', './completions/_shards', './LICENSE']));
  for (const names of [['../../escape'], ['/tmp/escape'], ['./bin/../escape'], ['bin/evil\nname']])
    assert.throws(() => validateArchiveEntries(names), /unsafe/);
});
