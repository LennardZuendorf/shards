import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT, invariant, main, repository, run, sha256, version } from './common.mjs';
import { loadConfig } from './config.mjs';
import { verifyManifest } from './manifest.mjs';
import { renderTap } from './homebrew.mjs';

export function requireChecks(results, required) {
  for (const name of required) invariant((results[name]?.result ?? results[name]) === 'success', `required check ${name}: ${results[name]?.result ?? results[name] ?? 'missing'}`);
}
export function validatePromotion({ config, manifest, candidateRun, expectedSha, tagSha, checks, currentRun = false }) {
  if (checks) requireChecks(checks, ['quality', 'build', 'assemble', 'brew']);
  invariant(candidateRun.conclusion === 'success' || (currentRun && candidateRun.status === 'in_progress' && checks), 'candidate run is not successful');
  invariant(candidateRun.repository?.full_name.toLowerCase() === config.release_repository.toLowerCase(), 'foreign candidate repository');
  invariant(candidateRun.event === 'push' && candidateRun.path === '.github/workflows/release.yml', 'untrusted candidate workflow/event');
  invariant(manifest.source_sha === expectedSha && candidateRun.head_sha === expectedSha && tagSha === expectedSha, 'tag/candidate source SHA mismatch');
  invariant(manifest.tag === `v${manifest.version}`, 'tag version mismatch');
  for (const [variant, v] of Object.entries(config.variants)) if (v.enabled)
    for (const target of v.targets) invariant(manifest.artifacts.some(a => a.variant === variant && a.target === target), `missing required artifact: ${variant}/${target}`);
  return { prerelease: manifest.version.includes('-'), tag: manifest.tag };
}
export function validateExistingAsset(artifact, existing) {
  invariant(existing.name === artifact.filename && existing.size === artifact.size && existing.digest === `sha256:${artifact.sha256}`, `existing asset differs: ${artifact.filename}`);
  return true;
}
export function stableMayAdvance(candidate, current) {
  version(candidate);
  if (candidate.includes('-')) return false;
  if (current === undefined) return true;
  version(current); invariant(!current.includes('-'), 'stable baseline cannot be prerelease');
  const a = candidate.split('.').map(BigInt), b = current.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
export function tapVersion(formula, cask) {
  if (formula === undefined && cask === undefined) return undefined;
  const versions = [formula, cask].map(text => text?.match(/^\s*version "([^"]+)"\s*$/m)?.[1]);
  invariant(versions[0] && versions[0] === versions[1], 'existing tap versions disagree or are unreadable');
  version(versions[0]); return versions[0];
}
function newestPublishedStable(repo) {
  const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`]));
  let newest;
  for (const release of pages.flat()) if (!release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
    const candidate = release.tag_name.slice(1);
    if (stableMayAdvance(candidate, newest)) newest = candidate;
  }
  return newest;
}
function api(path) { return JSON.parse(run('gh', ['api', path], { stdio: ['ignore', 'pipe', 'pipe'] })); }
function releaseFor(repo, tag) {
  try { return api(`repos/${repo}/releases/tags/${tag}`); }
  catch (error) { if (/HTTP 404/.test(String(error.stderr))) return null; throw error; }
}
function assertAsset(repo, tag, artifact, existing) {
  if (!existing.digest) {
    const temp = mkdtempSync(join(tmpdir(), 'shards-remote-asset-'));
    run('gh', ['release', 'download', tag, '--repo', repo, '--pattern', artifact.filename, '--dir', temp]);
    existing = { ...existing, digest: `sha256:${sha256(join(temp, artifact.filename))}` };
  }
  return validateExistingAsset(artifact, existing);
}
export function validateCandidate({ directory, runId, expectedSha, manifestHash, checks }) {
  invariant(/^\d+$/.test(runId) && /^[a-f0-9]{40}$/.test(expectedSha) && /^[a-f0-9]{64}$/.test(manifestHash), 'invalid publication identity');
  const config = loadConfig(), manifest = verifyManifest(directory), repo = repository(config.release_repository);
  invariant(sha256(join(directory, 'release-manifest.json')) === manifestHash, 'candidate manifest identity mismatch');
  const candidateRun = api(`repos/${repo}/actions/runs/${runId}`);
  const tagSha = run('git', ['rev-parse', `${manifest.tag}^{commit}`]).trim();
  run('git', ['merge-base', '--is-ancestor', expectedSha, 'origin/main']);
  const plan = validatePromotion({ config, manifest, candidateRun, expectedSha, tagSha, checks, currentRun: runId === process.env.GITHUB_RUN_ID });
  return { plan, manifest, repo };
}
export function publishRelease(options) {
  const { directory, expectedSha } = options, { plan, manifest, repo } = validateCandidate(options);
  let release = releaseFor(repo, manifest.tag);
  if (!release) {
    const notes = join(mkdtempSync(join(tmpdir(), 'shards-notes-')), 'notes.md');
    writeFileSync(notes, `Shards ${manifest.version}\n\nCLI + MCP and desktop packages are built from ${manifest.source_sha}.\n\nMac packages are ad-hoc signed, without Developer ID or notarization. See the installation guide for the expected macOS security prompt.\n\nServer packaging is unavailable until the separate server implementation is enabled.\n`);
    run('gh', ['release', 'create', manifest.tag, '--repo', repo, '--verify-tag', '--target', expectedSha, '--draft', '--latest=false', '--title', `Shards ${manifest.version}`, '--notes-file', notes, ...(plan.prerelease ? ['--prerelease'] : [])]);
    release = releaseFor(repo, manifest.tag);
  }
  invariant(release.prerelease === plan.prerelease, 'existing release channel mismatch');
  const payloads = [...manifest.artifacts, ...['release-manifest.json', 'SHA256SUMS'].map(filename => ({ filename, sha256: sha256(join(directory, filename)), size: lstatSync(join(directory, filename)).size }))];
  invariant(release.assets.every(a => payloads.some(p => p.filename === a.name)), 'existing release has unexpected assets');
  for (const artifact of payloads) {
    const existing = release.assets.find(a => a.name === artifact.filename);
    if (existing) assertAsset(repo, manifest.tag, artifact, existing);
    else {
      invariant(release.draft, 'published release is incomplete; refusing mutation');
      run('gh', ['release', 'upload', manifest.tag, join(resolve(directory), artifact.filename), '--repo', repo]);
    }
  }
  release = releaseFor(repo, manifest.tag);
  invariant(release.assets.length === payloads.length, 'release asset set incomplete');
  for (const artifact of payloads) assertAsset(repo, manifest.tag, artifact, release.assets.find(a => a.name === artifact.filename));
  const advanceLatest = stableMayAdvance(manifest.version, newestPublishedStable(repo));
  if (release.draft) run('gh', ['release', 'edit', manifest.tag, '--repo', repo, '--draft=false', `--latest=${advanceLatest}`]);
  return plan;
}
function copyTree(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const dest = join(destination, entry.name);
    if (entry.isDirectory()) { run('mkdir', ['-p', dest]); copyTree(join(source, entry.name), dest); }
    else { invariant(entry.isFile(), 'tap payload contains a non-regular file'); copyFileSync(join(source, entry.name), dest); }
  }
}
export function publishTap(directory) {
  const config = loadConfig(), manifest = verifyManifest(directory);
  invariant(!manifest.version.includes('-'), 'prerelease cannot update stable tap');
  const repo = repository(config.release_repository), tap = repository(config.tap_repository), release = releaseFor(repo, manifest.tag);
  invariant(release && !release.draft && !release.prerelease, 'tap requires published stable release');
  for (const artifact of manifest.artifacts) assertAsset(repo, manifest.tag, artifact, release.assets.find(a => a.name === artifact.filename));
  invariant(process.env.HOMEBREW_TAP_TOKEN, 'HOMEBREW_TAP_TOKEN is required for the tap repository');
  const temp = mkdtempSync(join(tmpdir(), 'shards-tap-publish-'));
  const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.HOMEBREW_TAP_TOKEN}`).toString('base64')}` };
  const checkout = join(temp, 'tap'), payload = join(temp, 'payload');
  run('git', ['clone', '--depth', '1', `https://github.com/${tap}.git`, checkout], { env });
  const readExisting = path => existsSync(join(checkout, path)) ? readFileSync(join(checkout, path), 'utf8') : undefined;
  const current = tapVersion(readExisting('Formula/shards-cli.rb'), readExisting('Casks/shards.rb'));
  if (!stableMayAdvance(manifest.version, current) || !stableMayAdvance(manifest.version, newestPublishedStable(repo)))
    return 'newer stable version exists; tap unchanged';
  renderTap({ manifest, releaseRepository: repo, tapRepository: tap, outputDir: payload });
  copyTree(payload, checkout);
  const git = args => run('git', args, { cwd: checkout, env });
  git(['add', '--', 'Formula', 'Casks', 'README.md', '.github']);
  if (!git(['diff', '--cached', '--name-only']).trim()) return 'tap already current';
  git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `chore: release shards ${manifest.version}`]);
  git(['push', 'origin', 'HEAD:main']);
  return 'tap updated';
}
main(import.meta.url, () => {
  const [command, directory] = process.argv.slice(2);
  invariant(['verify', 'release', 'tap'].includes(command) && directory, 'use publish.mjs verify|release|tap DIST');
  const options = { directory, runId: process.env.CANDIDATE_RUN_ID, expectedSha: process.env.CANDIDATE_SHA, manifestHash: process.env.CANDIDATE_MANIFEST_HASH, checks: JSON.parse(process.env.CANDIDATE_CHECKS ?? '{}') };
  if (command === 'verify') {
    const { manifest } = validateCandidate(options);
    const paths = [...manifest.artifacts.map(a => a.filename), 'release-manifest.json', 'SHA256SUMS'].map(name => join(resolve(directory), name)).join('\n');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `subjects<<SHARDS_SUBJECTS\n${paths}\nSHARDS_SUBJECTS\n`);
    console.log(paths);
  } else console.log(JSON.stringify(command === 'tap' ? publishTap(directory) : publishRelease(options)));
});
