import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { feature, workspace, put } from './test-support.mjs';

test('manifest hashes final payload and checksum file includes manifest without circular digest', async t => {
  const { recordArtifact, writeManifest, verifyManifest } = await feature('manifest');
  const root = workspace(t);
  const filename = 'shards-cli-0.2.0-aarch64-apple-darwin.tar.gz'; put(root, filename, 'verified archive');
  const artifact = recordArtifact(root, { filename, variant: 'cli', target: 'aarch64-apple-darwin', signing: 'none', evidence: ['cli-smoke'] });
  writeManifest({ version: '0.2.0', tag: 'v0.2.0', source_sha: 'a'.repeat(40), variants: { cli: { state: 'verified' } }, artifacts: [artifact] }, root);
  assert.equal(verifyManifest(root).artifacts.length, 1);
  assert.match(readFileSync(join(root, 'SHA256SUMS'), 'utf8'), /release-manifest.json/);
  put(root, filename, 'tampered archive');
  assert.throws(() => verifyManifest(root), /checksum|size/);
});
test('manifest refuses unsafe names and duplicate artifacts', async t => {
  const { recordArtifact, writeManifest } = await feature('manifest');
  const root = workspace(t);
  assert.throws(() => recordArtifact(root, { filename: '../escape', variant: 'cli' }), /filename/);
  const filename = 'shards-cli-0.2.0-aarch64-apple-darwin.tar.gz'; put(root, filename, 'payload');
  const artifact = recordArtifact(root, { filename, variant: 'cli', target: 'aarch64-apple-darwin', signing: 'none', evidence: ['smoke'] });
  assert.throws(() => writeManifest({ version: '0.2.0', tag: 'v0.2.0', source_sha: 'a'.repeat(40), variants: {}, artifacts: [artifact, artifact] }, root), /duplicate/);
});
