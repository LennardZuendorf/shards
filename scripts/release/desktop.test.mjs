import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { feature, workspace, put } from './test-support.mjs';

test('release packaging disables interactive Finder layout even with inherited override', async () => {
  const { desktopBuildEnv } = await feature('desktop');
  assert.equal(typeof desktopBuildEnv, 'function');
  const env = desktopBuildEnv('aarch64-apple-darwin', { TAURI_BUNDLER_DMG_IGNORE_CI: 'true' });
  assert.equal(env.CI, 'true');
  assert.equal(env.TAURI_BUNDLER_DMG_IGNORE_CI, 'false');
});

test('the DMG build runs under a build-sized timeout, not the child default', async () => {
  const { desktopBuildRun, DESKTOP_BUILD_TIMEOUT_MS } = await feature('desktop');
  const { DEFAULT_TIMEOUT_MS } = await feature('common');
  assert.ok(DESKTOP_BUILD_TIMEOUT_MS >= 45 * 60_000, `desktop build timeout too small: ${DESKTOP_BUILD_TIMEOUT_MS}`);
  assert.ok(DESKTOP_BUILD_TIMEOUT_MS > DEFAULT_TIMEOUT_MS);
  const options = desktopBuildRun('x86_64-apple-darwin');
  assert.equal(options.timeout, DESKTOP_BUILD_TIMEOUT_MS);
  assert.equal(options.stdio, 'inherit');
  assert.equal(options.env.SHARDS_RELEASE_TARGET, 'x86_64-apple-darwin');
});

test('sidecars use explicit target and contain both tools without development host', async t => {
  const { stageSidecars } = await feature('desktop');
  const root = workspace(t), binaries = join(root, 'bin');
  for (const name of ['shards', 'shards-mcp']) chmodSync(put(binaries, name, 'binary'), 0o755);
  const paths = stageSidecars({ target: 'x86_64-apple-darwin', binaryDir: binaries, tauriDir: root });
  assert.equal(paths.length, 2);
  assert.ok(existsSync(join(root, 'binaries/shards-mcp-x86_64-apple-darwin')));
  assert.ok(!existsSync(join(root, 'binaries/shards-host-x86_64-apple-darwin')));
  assert.throws(() => stageSidecars({ target: '../escape', binaryDir: binaries, tauriDir: root }), /target/);
});
