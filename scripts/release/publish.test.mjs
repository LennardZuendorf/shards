import test from 'node:test';
import assert from 'node:assert/strict';
import { feature, configFixture } from './test-support.mjs';

test('required failed or skipped checks never pass promotion', async () => {
  const { requireChecks } = await feature('publish');
  assert.doesNotThrow(() => requireChecks({ quality: 'success', build: 'success' }, ['quality', 'build']));
  for (const state of ['failure', 'cancelled', 'skipped', undefined])
    assert.throws(() => requireChecks({ quality: 'success', build: state }, ['quality', 'build']), /build/);
});
test('promotion binds tag, tested commit, successful trusted run and stable target completeness', async () => {
  const { validatePromotion } = await feature('publish');
  const c = configFixture();
  const artifacts = Object.entries(c.variants).filter(([,v]) => v.enabled).flatMap(([variant,v]) => v.targets.map(target => ({ variant, target })));
  const manifest = { version: '0.2.0', tag: 'v0.2.0', source_sha: 'a'.repeat(40), artifacts };
  const candidateRun = { conclusion: 'success', event: 'push', path: '.github/workflows/release.yml', head_sha: 'a'.repeat(40), repository: { full_name: c.release_repository } };
  const good = { config: c, manifest, candidateRun, expectedSha: 'a'.repeat(40), tagSha: 'a'.repeat(40) };
  assert.doesNotThrow(() => validatePromotion(good));
  for (const delta of [{ tagSha: 'b'.repeat(40) }, { expectedSha: 'b'.repeat(40) }, { candidateRun: { ...candidateRun, conclusion: 'failure' } }, { candidateRun: { ...candidateRun, repository: { full_name: 'foreign/repo' } } }, { manifest: { ...manifest, artifacts: [] } }])
    assert.throws(() => validatePromotion({ ...good, ...delta }));
});
test('same-name different-hash release assets refuse replacement', async () => {
  const { validateExistingAsset } = await feature('publish');
  const artifact = { filename: 'archive.tar.gz', sha256: 'a'.repeat(64), size: 42 };
  assert.equal(validateExistingAsset(artifact, { name: artifact.filename, digest: `sha256:${artifact.sha256}`, size: 42 }), true);
  assert.throws(() => validateExistingAsset(artifact, { name: artifact.filename, digest: `sha256:${'b'.repeat(64)}`, size: 42 }), /existing asset/);
});

test('older stable tag or retry cannot move the latest release or tap backwards', async () => {
  const { stableMayAdvance, tapVersion } = await feature('publish');
  assert.equal(typeof stableMayAdvance, 'function');
  assert.equal(stableMayAdvance('1.2.0', '1.10.0'), false);
  assert.equal(stableMayAdvance('1.10.0', '1.2.0'), true);
  assert.equal(stableMayAdvance('1.10.0', '1.10.0'), true);
  assert.equal(stableMayAdvance('1.11.0-rc.1', '1.10.0'), false);
  assert.equal(stableMayAdvance('1.0.0'), true);
  assert.equal(tapVersion('  version "1.10.0"\n', '  version "1.10.0"\n'), '1.10.0');
  assert.throws(() => tapVersion('  version "1.10.0"\n', '  version "1.2.0"\n'), /disagree/);
});
