import { chmodSync, copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT, invariant, main, output, run, version as validateVersion } from './common.mjs';
import { TARGETS } from './config.mjs';
import { checkVersions } from './version.mjs';
import { executable, extractArchive, verifyCli } from './verify.mjs';
import { recordArtifact } from './manifest.mjs';

export function packageCli({ root = ROOT, binaryDir, staging, outDir, version, target }) {
  validateVersion(version); invariant(TARGETS.includes(target), 'unsupported target');
  for (const name of ['shards', 'shards-mcp']) executable(join(binaryDir, name));
  output(join(staging, 'bin')); output(join(staging, 'completions')); output(outDir);
  for (const name of ['shards', 'shards-mcp']) { copyFileSync(join(binaryDir, name), join(staging, 'bin', name)); chmodSync(join(staging, 'bin', name), 0o755); }
  for (const [shell, name] of [['bash', 'shards.bash'], ['zsh', '_shards'], ['fish', 'shards.fish']])
    writeFileSync(join(staging, 'completions', name), run(join(binaryDir, 'shards'), ['completions', shell]));
  for (const name of ['LICENSE', 'README.md']) copyFileSync(join(root, name), join(staging, name));
  const archive = join(resolve(outDir), `shards-cli-${version}-${target}.tar.gz`);
  run('tar', ['-czf', archive, '-C', resolve(staging), 'bin', 'completions', 'LICENSE', 'README.md']);
  return archive;
}
export function buildCli({ target, version, outDir }) {
  invariant(TARGETS.includes(target), 'unsupported target');
  run('cargo', ['build', '--release', '--locked', '-p', 'shards', '--bins', '--target', target], { env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '13.3' }, stdio: 'inherit' });
  const work = mkdtempSync(join(tmpdir(), 'shards-cli-build-'));
  const archive = packageCli({ binaryDir: join(ROOT, 'target', target, 'release'), staging: join(work, 'payload'), outDir, version, target });
  const evidence = verifyCli({ directory: extractArchive(archive, join(work, 'verify')), version, target });
  const artifact = recordArtifact(outDir, { filename: archive.split('/').at(-1), variant: 'cli', target, signing: 'none', evidence });
  writeFileSync(join(outDir, `${artifact.filename}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}
main(import.meta.url, () => console.log(JSON.stringify(buildCli({ target: process.argv[2], version: checkVersions().version, outDir: output(process.argv[3] ?? join(ROOT, 'dist/release')) }))));
