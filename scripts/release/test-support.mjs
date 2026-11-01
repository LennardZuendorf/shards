import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function feature(name) {
  const url = new URL(`./${name}.mjs`, import.meta.url);
  assert.ok(existsSync(url), `${name} release feature is not implemented`);
  return import(url.href);
}
export function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'shards-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
export function put(root, path, content) {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
  return file;
}
export const configFixture = () => ({
  schema_version: 1, macos_minimum: '13.3',
  release_repository: 'LennardZuendorf/shards', tap_repository: 'LennardZuendorf/homebrew-tap',
  variants: {
    cli: { enabled: true, targets: ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu'] },
    desktop: { enabled: true, targets: ['aarch64-apple-darwin', 'x86_64-apple-darwin'] },
    server: { enabled: false, reason: 'server_not_implemented', targets: ['x86_64-unknown-linux-gnu'] },
  },
});
export function versionFixture(root, version = '0.2.0') {
  for (const [path, name] of [['Cargo.toml', 'shards'], ['crates/shards-host/Cargo.toml', 'shards-host'], ['apps/desktop/src-tauri/Cargo.toml', 'shards-desktop']])
    put(root, path, `[package]\nname = "${name}"\nversion = "${version}"\n`);
  put(root, 'Cargo.lock', ['shards', 'shards-host', 'shards-desktop'].map(name => `[[package]]\nname = "${name}"\nversion = "${version}"\n`).join('\n'));
  for (const path of ['apps/desktop/package.json', 'apps/desktop/src-tauri/tauri.conf.json', 'plugins/shards/.claude-plugin/plugin.json'])
    put(root, path, JSON.stringify({ version }));
}
