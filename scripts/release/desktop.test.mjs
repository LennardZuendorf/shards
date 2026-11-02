import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { feature, workspace, put } from './test-support.mjs';

test('release packaging disables interactive Finder layout even with inherited override', async () => {
  const { desktopBuildEnv } = await feature('desktop');
  assert.equal(typeof desktopBuildEnv, 'function');
  const env = desktopBuildEnv('aarch64-apple-darwin', { TAURI_BUNDLER_DMG_IGNORE_CI: 'true' });
  assert.equal(env.CI, 'true');
  assert.equal(env.TAURI_BUNDLER_DMG_IGNORE_CI, 'false');
});

test('native desktop builds allow cold compilation within the CI job budget', async () => {
  const { runDesktopBuild, DESKTOP_BUILD_TIMEOUT_MS } = await feature('desktop');
  const { DEFAULT_TIMEOUT_MS } = await feature('common');
  assert.equal(typeof runDesktopBuild, 'function');
  assert.ok(DESKTOP_BUILD_TIMEOUT_MS > DEFAULT_TIMEOUT_MS);
  for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    const result = runDesktopBuild(target, (command, args, options) => {
      assert.equal(command, 'pnpm');
      assert.deepEqual(args, ['-C', 'apps/desktop', 'exec', 'tauri', 'build', '--target', target, '--bundles', 'app', '--', '--locked']);
      assert.equal(options.timeout, 45 * 60_000);
      assert.equal(options.timeout, DESKTOP_BUILD_TIMEOUT_MS);
      assert.ok(options.timeout < 60 * 60_000);
      assert.equal(options.stdio, 'inherit');
      assert.equal(options.env.SHARDS_RELEASE_TARGET, target);
      assert.equal(options.env.MACOSX_DEPLOYMENT_TARGET, '13.3');
      assert.equal(options.env.CI, 'true');
      assert.equal(options.env.TAURI_BUNDLER_DMG_IGNORE_CI, 'false');
      return 'compiled';
    });
    assert.equal(result, 'compiled');
  }
});

test('DMG creation preserves the signed app and needs no writable volume mount', async t => {
  const { createDesktopDmg } = await feature('desktop');
  const root = workspace(t), appPath = join(root, 'Shards.app'), filename = join(root, 'Shards.dmg');
  put(appPath, 'Contents/marker', 'signed app bytes');
  let staging, commands = [];
  createDesktopDmg({ appPath, filename }, (command, args) => {
    commands.push(command);
    if (command === 'ditto') {
      assert.deepEqual(args.slice(0, 4), ['--rsrc', '--extattr', '--acl', appPath]);
      cpSync(appPath, args[4], { recursive: true });
    } else {
      assert.equal(command, 'hdiutil');
      const volume = args[4]; staging = dirname(volume);
      assert.deepEqual(args, ['create', '-volname', 'Shards', '-srcfolder', volume, '-format', 'UDZO', '-fs', 'HFS+', join(staging, 'Shards.dmg')]);
      assert.deepEqual(readdirSync(volume).sort(), ['Applications', 'Shards.app']);
      assert.equal(readlinkSync(join(volume, 'Applications')), '/Applications');
      assert.equal(readFileSync(join(volume, 'Shards.app/Contents/marker'), 'utf8'), 'signed app bytes');
      writeFileSync(args.at(-1), 'verified image candidate');
    }
  });
  assert.deepEqual(commands, ['ditto', 'hdiutil']);
  assert.equal(readFileSync(filename, 'utf8'), 'verified image candidate');
  assert.equal(existsSync(staging), false);
});

test('failed DMG creation cleans staging and preserves the previous output', async t => {
  const { createDesktopDmg } = await feature('desktop');
  for (const failedCommand of ['ditto', 'hdiutil']) {
    const root = workspace(t), appPath = join(root, 'Shards.app'), filename = put(root, 'Shards.dmg', 'previous image');
    put(appPath, 'Contents/marker', 'app');
    let staging;
    const failure = new Error(`failed ${failedCommand}`);
    assert.throws(() => createDesktopDmg({ appPath, filename }, (command, args) => {
      if (command === 'ditto') staging = dirname(dirname(args[4]));
      if (command === failedCommand) throw failure;
      cpSync(appPath, args[4], { recursive: true });
    }), error => error === failure);
    assert.equal(existsSync(staging), false);
    assert.equal(readFileSync(filename, 'utf8'), 'previous image');
    assert.equal(existsSync(`${filename}.json`), false);
  }
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
