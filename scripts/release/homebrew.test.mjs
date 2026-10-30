import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { feature, workspace, put } from './test-support.mjs';
import { recordArtifact, writeManifest, verifyManifest } from './manifest.mjs';

function candidate(t, version = '1.2.3') {
  const dir = workspace(t);
  const artifacts = [];
  for (const variant of ['cli', 'desktop']) for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    const filename = variant === 'cli' ? `shards-cli-${version}-${target}.tar.gz` : `Shards-${version}-${target}.dmg`;
    put(dir, filename, `${variant}/${target}`);
    artifacts.push(recordArtifact(dir, { variant, target, filename, signing: 'none', evidence: variant === 'cli' ? ['cli-smoke'] : ['desktop-bundle', 'cli-smoke'] }));
  }
  writeManifest({ version, tag: `v${version}`, source_sha: 'a'.repeat(40), variants: { cli: { state: 'verified' }, desktop: { state: 'verified' }, server: { state: 'unavailable', reason: 'server_not_implemented' } }, artifacts }, dir);
  return verifyManifest(dir);
}
const options = (t, manifest) => ({ manifest, releaseRepository: 'LennardZuendorf/shards', tapRepository: 'LennardZuendorf/homebrew-tap', outputDir: workspace(t) });
function read(result, file) { return readFileSync(join(result.directory, file), 'utf8'); }

test('renders fixed architecture URLs and hashes with one command owner', async t => {
  const { renderTap } = await feature('homebrew');
  const m = candidate(t), opts = options(t, m), result = renderTap(opts);
  const formula = read(result, 'Formula/shards-cli.rb'), cask = read(result, 'Casks/shards.rb');
  for (const a of m.artifacts) assert.ok((a.variant === 'cli' ? formula : cask).includes(a.sha256));
  assert.match(formula, /on_arm/); assert.match(formula, /on_intel/);
  assert.match(formula, /conflicts_with "crystal"/);
  assert.match(formula, /bin\.install "bin\/shards", "bin\/shards-mcp"/);
  assert.match(formula, /assert_equal version\.to_s, shell_output/);
  assert.match(formula, /bash_completion/); assert.match(formula, /zsh_completion/); assert.match(formula, /fish_completion/);
  assert.match(cask, /depends_on formula: "LennardZuendorf\/tap\/shards-cli"/);
  assert.match(cask, /app "Shards.app"/);
  assert.match(cask, /MacOSVersion\.new\("13\.3"\)/);
  assert.doesNotMatch(cask, /\bbinary\b|\bzap\b|\buninstall\b|xattr|quarantine:|spctl/);
  assert.match(formula, /releases\/download\/v1\.2\.3/);
  assert.doesNotMatch(formula + cask, /latest|no_check/);
  const second = renderTap({ ...opts, outputDir: workspace(t) });
  for (const path of result.files) assert.equal(read(result, path), read(second, path));
  for (const path of ['Formula/shards-cli.rb', 'Casks/shards.rb']) assert.equal(execFileSync('ruby', ['-c', join(result.directory, path)], { encoding: 'utf8' }).trim(), 'Syntax OK');
});
test('native brew smoke refuses a non-disposable machine before any command', async () => {
  const { smokeHomebrew } = await feature('brew-smoke');
  await assert.rejects(() => smokeHomebrew({ dist: '/missing', target: 'aarch64-apple-darwin', env: {} }), /SHARDS_BREW_SMOKE_DISPOSABLE=1/);
});
test('rejects prerelease, missing targets, unverified payloads and repository injection', async t => {
  const { renderTap } = await feature('homebrew');
  assert.throws(() => renderTap(options(t, candidate(t, '1.2.3-rc.1'))), /prerelease/);
  for (const mutate of [m => m.artifacts.pop(), m => { m.artifacts[0].evidence = ['build-only']; }, m => { m.artifacts[2].evidence = ['cli-smoke']; }, m => { m.variants.cli.state = 'unverified'; }, m => { m.draft = true; }]) {
    const m = candidate(t); mutate(m); assert.throws(() => renderTap(options(t, m)));
  }
  assert.throws(() => renderTap({ ...options(t, candidate(t)), releaseRepository: "owner/repo'\n" }), /repository/);
});
test('local candidate URLs require explicit mode and loopback or file transport', async t => {
  const { renderTap } = await feature('homebrew');
  const opts = options(t, candidate(t));
  assert.throws(() => renderTap({ ...opts, baseUrl: 'http://127.0.0.1:8123' }), /candidate-local/);
  assert.throws(() => renderTap({ ...opts, mode: 'candidate-local', baseUrl: 'https://evil.example' }), /local/);
  const result = renderTap({ ...opts, mode: 'candidate-local', baseUrl: 'http://127.0.0.1:8123' });
  assert.match(read(result, 'Formula/shards-cli.rb'), /http:\/\/127\.0\.0\.1:8123\/shards-cli/);
  assert.ok(result.files.includes('README.md'));
  assert.ok(result.files.includes('.github/workflows/verify.yml'));
});
