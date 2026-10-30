import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, invariant, main, output, repository } from './common.mjs';
import { validateManifest, verifyManifest } from './manifest.mjs';

export function renderTap({ manifest, releaseRepository, tapRepository, outputDir, mode = 'stable', baseUrl }) {
  validateManifest(manifest); repository(releaseRepository); repository(tapRepository);
  invariant(['stable', 'candidate-local'].includes(mode), 'unknown tap mode');
  invariant(mode !== 'stable' || !manifest.version.includes('-'), 'stable tap rejects prerelease');
  invariant(mode !== 'stable' || manifest.draft !== true, 'stable tap rejects draft release');
  invariant(mode !== 'stable' || !baseUrl, 'local baseUrl requires candidate-local mode');
  let base = `https://github.com/${releaseRepository}/releases/download/${manifest.tag}`;
  if (mode === 'candidate-local') {
    invariant(typeof baseUrl === 'string', 'candidate-local requires local baseUrl');
    const url = new URL(baseUrl);
    invariant((url.protocol === 'file:' && !url.host) || (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)), 'candidate-local requires file or loopback HTTP URL');
    invariant(!url.username && !url.password && !url.search && !url.hash && !/["\\\n\r]/.test(baseUrl), 'unsafe local URL');
    base = url.href.replace(/\/$/, '');
  }
  const values = { VERSION: manifest.version, RELEASE_REPOSITORY: releaseRepository, TAP_NAME: tapRepository.replace('/homebrew-', '/') };
  for (const [variant, prefix] of [['cli', 'CLI'], ['desktop', 'DESKTOP']]) {
    invariant(manifest.variants?.[variant]?.state === 'verified', `${variant} variant is not verified`);
    for (const [target, arch] of [['aarch64-apple-darwin', 'ARM'], ['x86_64-apple-darwin', 'INTEL']]) {
      const artifact = manifest.artifacts.find(a => a.variant === variant && a.target === target);
      invariant(artifact, `missing ${variant}/${target} artifact`);
      invariant(artifact.evidence.includes('cli-smoke') && (variant !== 'desktop' || artifact.evidence.includes('desktop-bundle')), `unverified ${variant}/${target} artifact`);
      values[`${prefix}_${arch}_URL`] = `${base}/${artifact.filename}`;
      values[`${prefix}_${arch}_SHA`] = artifact.sha256;
    }
  }
  values.DESKTOP_URL = `${base}/Shards-${manifest.version}-#{arch}.dmg`;
  const templates = [['Formula/shards-cli.rb.in', 'Formula/shards-cli.rb'], ['Casks/shards.rb.in', 'Casks/shards.rb'], ['README.md.in', 'README.md'], ['verify.yml.in', '.github/workflows/verify.yml']];
  const directory = output(outputDir);
  for (const [source, destination] of templates) {
    const content = readFileSync(join(ROOT, 'packaging/homebrew', source), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => { invariant(key in values, `missing template value ${key}`); return values[key]; });
    const path = join(directory, destination);
    mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, content);
  }
  return { directory, files: templates.map(([, destination]) => destination) };
}
main(import.meta.url, () => {
  const [dist, outputDir, mode = 'stable', baseUrl] = process.argv.slice(2);
  invariant(dist && outputDir, 'usage: homebrew.mjs DIST OUTPUT [stable|candidate-local] [LOCAL_BASE_URL]');
  console.log(JSON.stringify(renderTap({ manifest: verifyManifest(dist), releaseRepository: 'LennardZuendorf/shards', tapRepository: 'LennardZuendorf/homebrew-tap', outputDir, mode, baseUrl })));
});
