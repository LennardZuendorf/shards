import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { feature, workspace, put } from './test-support.mjs';

test('packaged archive includes both binaries and rejects absent or non-executable shim', async t => {
  const { packageCli } = await feature('cli');
  const { extractArchive } = await feature('verify');
  const root = workspace(t), binaries = join(root, 'binaries'), staging = join(root, 'staging'), out = join(root, 'out');
  for (const name of ['shards', 'shards-mcp']) chmodSync(put(binaries, name, '#!/bin/sh\necho shards 0.2.0\n'), 0o755);
  put(root, 'LICENSE', 'license'); put(root, 'README.md', 'readme');
  const result = packageCli({ root, binaryDir: binaries, staging, outDir: out, version: '0.2.0', target: 'aarch64-apple-darwin', generateCompletions: false });
  const extracted = extractArchive(result, join(root, 'extracted'));
  assert.ok(existsSync(join(extracted, 'bin/shards-mcp')));
  chmodSync(join(binaries, 'shards-mcp'), 0o644);
  assert.throws(() => packageCli({ root, binaryDir: binaries, staging: join(root, 'bad'), outDir: out, version: '0.2.0', target: 'aarch64-apple-darwin' }), /executable/);
});
