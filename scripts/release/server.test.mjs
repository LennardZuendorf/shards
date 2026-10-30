import test from 'node:test';
import assert from 'node:assert/strict';
import { feature, workspace, put, configFixture } from './test-support.mjs';

test('server preflight fails closed for absent or incomplete real package', async t => {
  const { preflightServer } = await feature('server');
  const root = workspace(t), config = configFixture();
  assert.throws(() => preflightServer(root, config), /server_not_implemented/);
  config.variants.server.enabled = true; delete config.variants.server.reason;
  assert.throws(() => preflightServer(root, config), /crates\/shards-server\/Cargo.toml/);
  put(root, 'crates/shards-server/scripts/release-smoke.sh', '#!/bin/sh\nexit 0\n');
  put(root, 'packaging/server/Dockerfile', 'FROM scratch\n');
  put(root, 'crates/shards-server/Cargo.toml', '[package]\nname = "shards-host"\n');
  assert.throws(() => preflightServer(root, config), /package must be shards-server/);
});

test('real server Cargo metadata must match product version', async () => {
  const { validateServerMetadata } = await feature('server');
  assert.equal(typeof validateServerMetadata, 'function');
  const metadata = { packages: [{ name: 'shards-server', version: '0.2.0', targets: [{ name: 'shards-server', kind: ['bin'] }] }] };
  assert.doesNotThrow(() => validateServerMetadata(metadata, '0.2.0'));
  metadata.packages[0].version = '0.1.0';
  assert.throws(() => validateServerMetadata(metadata, '0.2.0'), /server version mismatch/);
});
