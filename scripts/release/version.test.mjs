import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { feature, workspace, put, versionFixture } from './test-support.mjs';

test('one authority validates all consumers and tag', async t => {
  const { checkVersions } = await feature('version');
  const root = workspace(t); versionFixture(root);
  assert.equal(checkVersions(root, 'v0.2.0').version, '0.2.0');
  assert.throws(() => checkVersions(root, 'v0.3.0'), /tag/);
  put(root, 'apps/desktop/package.json', '{"version":"0.1.0"}');
  assert.throws(() => checkVersions(root), /apps\/desktop\/package.json/);
});
test('preparation updates only owned package versions, accepts prerelease and rejects injection', async t => {
  const { prepareVersion, checkVersions } = await feature('version');
  const root = workspace(t); versionFixture(root);
  put(root, 'Cargo.toml', '[package]\nname = "shards"\nversion = "0.2.0"\n[dependencies]\nother = { version = "0.1.0" }\n');
  prepareVersion(root, '0.3.0-rc.1');
  assert.equal(checkVersions(root).version, '0.3.0-rc.1');
  assert.match(readFileSync(`${root}/Cargo.toml`, 'utf8'), /other = \{ version = "0.1.0" \}/);
  assert.throws(() => prepareVersion(root, '1.0.0\n$(id)'), /version/);
});

test('future server joins version validation and preparation when its manifest exists', async t => {
  const { checkVersions, prepareVersion } = await feature('version');
  const root = workspace(t); versionFixture(root);
  const server = put(root, 'crates/shards-server/Cargo.toml', '[package]\nname = "shards-server"\nversion = "0.2.0"\n');
  appendFileSync(`${root}/Cargo.lock`, '\n[[package]]\nname = "shards-server"\nversion = "0.2.0"\n');
  assert.equal(checkVersions(root).version, '0.2.0');
  put(root, 'crates/shards-server/Cargo.toml', '[package]\nname = "shards-server"\nversion = "0.1.0"\n');
  assert.throws(() => checkVersions(root), /version mismatch.*shards-server/);
  prepareVersion(root, '0.3.0');
  assert.match(readFileSync(server, 'utf8'), /version = "0.3.0"/);
  assert.equal(checkVersions(root).version, '0.3.0');
});
