import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { filename, invariant, json, main, output, sha256, version } from './common.mjs';

export function recordArtifact(dir, artifact) {
  filename(artifact.filename);
  const path = join(dir, artifact.filename);
  return { ...artifact, sha256: sha256(path), size: lstatSync(path).size };
}
export function validateManifest(m) {
  invariant(m.schema_version === 1, 'unsupported manifest schema'); version(m.version);
  invariant(m.tag === `v${m.version}` && /^[a-f0-9]{40}$/.test(m.source_sha), 'invalid tag/source identity');
  invariant(Array.isArray(m.artifacts) && m.artifacts.length > 0, 'manifest has no artifacts');
  const names = new Set(), targets = new Set();
  for (const a of m.artifacts) {
    filename(a.filename);
    invariant(['cli', 'desktop', 'server'].includes(a.variant), 'invalid artifact variant');
    invariant(['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu'].includes(a.target), 'invalid artifact target');
    const expected = a.variant === 'desktop' ? `Shards-${m.version}-${a.target}.dmg` : `shards-${a.variant}-${m.version}-${a.target}.tar.gz`;
    invariant(a.filename === expected, 'artifact filename/version mismatch');
    invariant(!names.has(a.filename) && !targets.has(`${a.variant}/${a.target}`), 'duplicate artifact');
    names.add(a.filename); targets.add(`${a.variant}/${a.target}`);
    invariant(/^[a-f0-9]{64}$/.test(a.sha256) && Number.isSafeInteger(a.size) && a.size > 0, 'invalid checksum/size');
    invariant(['none', 'ad-hoc', 'developer-id'].includes(a.signing), 'invalid signing state');
    invariant(Array.isArray(a.evidence) && a.evidence.length > 0 && a.evidence.every(e => typeof e === 'string' && /^[a-z0-9._/-]+$/i.test(e)), 'artifact needs test evidence');
  }
  return m;
}
export function writeManifest(data, dir) {
  const m = validateManifest({ schema_version: 1, ...data }); output(dir);
  for (const a of m.artifacts) invariant(sha256(join(dir, a.filename)) === a.sha256, `checksum mismatch: ${a.filename}`);
  writeFileSync(join(dir, 'release-manifest.json'), `${JSON.stringify(m, null, 2)}\n`);
  const files = [...m.artifacts.map(a => a.filename), 'release-manifest.json'].sort();
  writeFileSync(join(dir, 'SHA256SUMS'), files.map(name => `${sha256(join(dir, name))}  ${name}\n`).join(''));
  return join(dir, 'release-manifest.json');
}
export function verifyManifest(dir) {
  const m = validateManifest(json(join(dir, 'release-manifest.json')));
  const expected = new Map([...m.artifacts.map(a => [a.filename, a.sha256]), ['release-manifest.json', sha256(join(dir, 'release-manifest.json'))]]);
  const lines = readFileSync(join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n');
  invariant(lines.length === expected.size, 'checksum file set mismatch');
  const seen = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    invariant(match && !seen.has(match[2]) && expected.get(match[2]) === match[1], 'invalid checksum entry');
    seen.add(match[2]); invariant(sha256(join(dir, match[2])) === match[1], `checksum mismatch: ${match[2]}`);
  }
  for (const a of m.artifacts) invariant(lstatSync(join(dir, a.filename)).size === a.size, `size mismatch: ${a.filename}`);
  return m;
}
main(import.meta.url, () => console.log(JSON.stringify(verifyManifest(process.argv[2]))));
