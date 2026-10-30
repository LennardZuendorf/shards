import { appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, invariant, json, main, run, sha256 } from './common.mjs';
import { loadConfig, selectVariants } from './config.mjs';
import { checkVersions } from './version.mjs';
import { recordArtifact, writeManifest, verifyManifest } from './manifest.mjs';

const runners = { 'aarch64-apple-darwin': 'macos-15', 'x86_64-apple-darwin': 'macos-15-intel', 'x86_64-unknown-linux-gnu': 'ubuntu-22.04' };
export function buildMatrix(config, selected) {
  return selected.includes('cli') ? config.variants.cli.targets.map(target => ({ os: runners[target], target, desktop: selected.includes('desktop') && config.variants.desktop.targets.includes(target) })) : [];
}
function emit(key, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  invariant(!text.includes('\n'), 'workflow output cannot contain newline');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${text}\n`);
  console.log(`${key}=${text}`);
}
export function assemble({ directory, config, selected, sourceSha, version, tag }) {
  const artifacts = readdirSync(directory).filter(name => /\.(tar\.gz|dmg)\.json$/.test(name)).map(name => json(join(directory, name)));
  for (const a of artifacts) {
    invariant(selected.includes(a.variant), `unselected artifact variant: ${a.variant}`);
    const observed = recordArtifact(directory, a);
    invariant(a.sha256 === observed.sha256 && a.size === observed.size, `artifact changed: ${a.filename}`);
  }
  const variants = {};
  for (const [name, v] of Object.entries(config.variants)) {
    variants[name] = !v.enabled ? { state: 'unavailable', reason: v.reason } : { state: selected.includes(name) ? 'verified' : 'not-selected' };
    if (selected.includes(name)) for (const target of v.targets) invariant(artifacts.some(a => a.variant === name && a.target === target), `missing artifact: ${name}/${target}`);
  }
  writeManifest({ version, tag, source_sha: sourceSha, variants, artifacts }, directory);
  return verifyManifest(directory);
}
main(import.meta.url, () => {
  const [command = 'preflight', directory = join(ROOT, 'dist/release')] = process.argv.slice(2), config = loadConfig();
  if (command === 'preflight') {
    const tagged = process.env.GITHUB_REF_TYPE === 'tag';
    const identity = checkVersions(ROOT, tagged ? process.env.GITHUB_REF_NAME : undefined);
    const selected = selectVariants(config, process.env.RELEASE_VARIANTS && process.env.RELEASE_VARIANTS !== 'enabled' ? process.env.RELEASE_VARIANTS.split(',') : undefined);
    const sha = run('git', ['rev-parse', 'HEAD']).trim();
    if (tagged) run('git', ['merge-base', '--is-ancestor', sha, 'origin/main']);
    emit('matrix', { include: buildMatrix(config, selected) }); emit('selected', selected);
    emit('desktop', selected.includes('desktop')); emit('server', selected.includes('server'));
    emit('sha', sha); emit('version', identity.version); emit('tag', identity.tag);
  } else {
    invariant(command === 'assemble', 'use release.mjs preflight|assemble [DIST]');
    const identity = checkVersions(), selected = selectVariants(config, JSON.parse(process.env.RELEASE_SELECTED));
    const manifest = assemble({ directory, config, selected, sourceSha: process.env.RELEASE_SOURCE_SHA, ...identity });
    emit('manifest_hash', sha256(join(directory, 'release-manifest.json')));
    emit('prerelease', manifest.version.includes('-'));
  }
});
