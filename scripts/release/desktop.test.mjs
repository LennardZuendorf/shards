import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { feature, workspace, put } from './test-support.mjs';

test('native desktop builds allow cold compilation within the CI job budget', async () => {
  const { runDesktopBuild } = await feature('desktop');
  assert.equal(typeof runDesktopBuild, 'function');
  for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    const result = runDesktopBuild(target, (command, args, options) => {
      assert.equal(command, 'pnpm');
      assert.deepEqual(args, ['-C', 'apps/desktop', 'exec', 'tauri', 'build', '--target', target, '--bundles', 'app,dmg', '--', '--locked']);
      assert.equal(options.timeout, 40 * 60_000);
      assert.ok(options.timeout < 60 * 60_000);
      assert.equal(options.stdio, 'inherit');
      assert.equal(options.env.SHARDS_RELEASE_TARGET, target);
      assert.equal(options.env.CI, 'true');
      assert.equal(options.env.TAURI_BUNDLER_DMG_IGNORE_CI, 'false');
      return 'compiled';
    });
    assert.equal(result, 'compiled');
  }
});

test('release packaging disables interactive Finder layout even with inherited override', async () => {
  const { desktopBuildEnv } = await feature('desktop');
  assert.equal(typeof desktopBuildEnv, 'function');
  const env = desktopBuildEnv('aarch64-apple-darwin', { TAURI_BUNDLER_DMG_IGNORE_CI: 'true' });
  assert.equal(env.CI, 'true');
  assert.equal(env.TAURI_BUNDLER_DMG_IGNORE_CI, 'false');
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
