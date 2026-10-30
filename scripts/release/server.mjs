import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, invariant, main, output, regular, run } from './common.mjs';
import { loadConfig } from './config.mjs';
import { checkVersions } from './version.mjs';
import { recordArtifact } from './manifest.mjs';
import { executable } from './verify.mjs';

export function validateServerMetadata(metadata, expectedVersion) {
  const server = metadata.packages.find(p => p.name === 'shards-server' && p.targets.some(t => t.name === 'shards-server' && t.kind.includes('bin')));
  invariant(server, 'workspace needs real shards-server binary');
  invariant(server.version === expectedVersion, 'server version mismatch');
}
export function preflightServer(root, config) {
  invariant(config.variants.server.enabled, config.variants.server.reason ?? 'server disabled');
  const paths = ['crates/shards-server/Cargo.toml', 'crates/shards-server/scripts/release-smoke.sh', 'packaging/server/Dockerfile'];
  for (const path of paths) invariant(existsSync(join(root, path)), `server requires ${path}`);
  for (const path of paths) regular(join(root, path));
  invariant(/name\s*=\s*"shards-server"/.test(readFileSync(join(root, paths[0]), 'utf8')), 'server package must be shards-server, never shards-host');
  const metadata = JSON.parse(run('cargo', ['metadata', '--no-deps', '--locked', '--format-version', '1'], { cwd: root }));
  validateServerMetadata(metadata, checkVersions(root).version);
  return { package: 'shards-server', smoke: paths[1], dockerfile: paths[2] };
}
export function packageServer(outDir) {
  preflightServer(ROOT, loadConfig());
  const { version } = checkVersions(), target = 'x86_64-unknown-linux-gnu';
  const stage = mkdtempSync(join(tmpdir(), 'shards-server-package-')); output(join(stage, 'bin')); output(outDir);
  copyFileSync(executable(join(ROOT, 'target/release/shards-server')), join(stage, 'bin/shards-server'));
  for (const name of ['LICENSE', 'README.md']) copyFileSync(join(ROOT, name), join(stage, name));
  // Preserve the already runtime-tested container; publishing never rebuilds it.
  run('docker', ['save', '--output', join(stage, 'image.tar'), 'shards-server:candidate']);
  const filename = `shards-server-${version}-${target}.tar.gz`;
  run('tar', ['-czf', join(outDir, filename), '-C', stage, 'bin', 'image.tar', 'LICENSE', 'README.md']);
  const artifact = recordArtifact(outDir, { filename, variant: 'server', target, signing: 'none', evidence: ['server-native-smoke', 'server-image-smoke'] });
  writeFileSync(join(outDir, `${filename}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}
main(import.meta.url, () => {
  invariant(!process.argv[2] || process.argv[2] === 'package', 'use server.mjs [package OUT]');
  console.log(JSON.stringify(process.argv[2] ? packageServer(process.argv[3]) : preflightServer(ROOT, loadConfig())));
});
