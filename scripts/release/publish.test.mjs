import test from 'node:test';
import assert from 'node:assert/strict';
import { feature, configFixture } from './test-support.mjs';

test('publication finds a draft on a later release page and retains its notes', async () => {
  const { releaseFor } = await feature('publish');
  const draft = { id: 42, tag_name: 'v0.1.0', draft: true, body: 'Prepared release notes', assets: [] };
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, ...args]);
    if (args[1].endsWith('/tags/v0.1.0')) throw Object.assign(new Error('not found'), { stderr: 'HTTP 404' });
    if (args.includes('--paginate')) return JSON.stringify([[{ tag_name: 'v0.0.9' }], [draft]]);
    assert.equal(args[1], 'repos/owner/repo/releases/42');
    return JSON.stringify(draft);
  };
  assert.deepEqual(releaseFor('owner/repo', 'v0.1.0', runner), draft);
  assert.deepEqual(calls, [
    ['gh', 'api', 'repos/owner/repo/releases/tags/v0.1.0'],
    ['gh', 'api', '--paginate', '--slurp', 'repos/owner/repo/releases?per_page=100'],
    ['gh', 'api', 'repos/owner/repo/releases/42'],
  ]);
});

test('release discovery preserves lookup failures and refuses ambiguous drafts', async () => {
  const { releaseFor } = await feature('publish');
  for (const status of [401, 403, 500]) {
    let calls = 0;
    const error = Object.assign(new Error('lookup failed'), { stderr: `HTTP ${status}` });
    assert.throws(() => releaseFor('owner/repo', 'v0.1.0', () => { calls++; throw error; }), value => value === error);
    assert.equal(calls, 1);
  }
  const lookup = response => (_command, args) => {
    if (args[1].includes('/tags/')) throw Object.assign(new Error('not found'), { stderr: 'HTTP 404' });
    if (response instanceof Error) throw response;
    return response;
  };
  assert.equal(releaseFor('owner/repo', 'v0.1.0', lookup('[[{"tag_name":"v0.1.1"}]]')), null);
  assert.throws(() => releaseFor('owner/repo', 'v0.1.0', lookup('[[{"id":1,"tag_name":"v0.1.0"}],[{"id":2,"tag_name":"v0.1.0"}]]')), /multiple releases/);
  assert.throws(() => releaseFor('owner/repo', 'v0.1.0', lookup(new Error('listing failed'))), /listing failed/);
  assert.throws(() => releaseFor('owner/repo', 'v0.1.0', lookup('invalid JSON')), SyntaxError);
  assert.deepEqual(releaseFor('owner/repo', 'v0.1.0', () => '{"id":1,"draft":false}'), { id: 1, draft: false });
});

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
