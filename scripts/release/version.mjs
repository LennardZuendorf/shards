import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, invariant, json, main, version } from './common.mjs';

const manifests = ['Cargo.toml', 'crates/shards-host/Cargo.toml', 'apps/desktop/src-tauri/Cargo.toml'];
const metadata = ['apps/desktop/package.json', 'apps/desktop/src-tauri/tauri.conf.json', 'plugins/shards/.claude-plugin/plugin.json'];
const packagePattern = /(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
function ownedManifests(root) {
  return existsSync(join(root, 'crates/shards-server/Cargo.toml')) ? [...manifests, 'crates/shards-server/Cargo.toml'] : manifests;
}
function packageNames(root) { return ownedManifests(root).map(path => readFileSync(join(root, path), 'utf8').match(/^name\s*=\s*"([^"]+)"/m)?.[1]); }
export function checkVersions(root = ROOT, expectedTag) {
  const authority = readFileSync(join(root, 'Cargo.toml'), 'utf8').match(packagePattern)?.[2];
  version(authority);
  for (const path of ownedManifests(root)) invariant(readFileSync(join(root, path), 'utf8').match(packagePattern)?.[2] === authority, `version mismatch: ${path}`);
  for (const path of metadata) invariant(json(join(root, path)).version === authority, `version mismatch: ${path}`);
  const lock = readFileSync(join(root, 'Cargo.lock'), 'utf8');
  for (const name of packageNames(root)) {
    const block = lock.split('[[package]]').find(b => b.match(/^name = "([^"]+)"/m)?.[1] === name);
    invariant(block?.match(/^version = "([^"]+)"/m)?.[1] === authority, `version mismatch: Cargo.lock ${name}`);
  }
  const tag = `v${authority}`;
  invariant(expectedTag === undefined || expectedTag === tag, `tag ${expectedTag} does not match ${tag}`);
  return { version: authority, tag };
}
export function prepareVersion(root, next) {
  version(next);
  const writes = [];
  for (const path of ownedManifests(root)) {
    const text = readFileSync(join(root, path), 'utf8'); invariant(packagePattern.test(text), `missing package version: ${path}`);
    writes.push([path, text.replace(packagePattern, (_, a, _v, b) => `${a}${next}${b}`)]);
  }
  for (const path of metadata) writes.push([path, `${JSON.stringify({ ...json(join(root, path)), version: next }, null, 2)}\n`]);
  const lock = readFileSync(join(root, 'Cargo.lock'), 'utf8').split('[[package]]').map(block => {
    if (packageNames(root).includes(block.match(/^name = "([^"]+)"/m)?.[1]))
      return block.replace(/^version = "[^"]+"/m, `version = "${next}"`);
    return block;
  }).join('[[package]]');
  writes.push(['Cargo.lock', lock]);
  for (const [path, content] of writes) writeFileSync(join(root, path), content);
  return checkVersions(root);
}
main(import.meta.url, () => {
  const [command = 'check', value] = process.argv.slice(2);
  invariant(['check', 'prepare'].includes(command), 'use version.mjs check [tag] | prepare VERSION');
  console.log(JSON.stringify(command === 'prepare' ? prepareVersion(ROOT, value) : checkVersions(ROOT, value)));
});
