import { copyFileSync, chmodSync, existsSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, invariant, main, output, run } from './common.mjs';
import { checkVersions } from './version.mjs';
import { executable, isolatedEnv, verifyArchitecture, verifyCli } from './verify.mjs';
import { recordArtifact } from './manifest.mjs';

const tauriDir = join(ROOT, 'apps/desktop/src-tauri');
export function desktopBuildEnv(target, env = process.env) {
  return { ...env, SHARDS_RELEASE_TARGET: target, MACOSX_DEPLOYMENT_TARGET: '13.3', CI: 'true', TAURI_BUNDLER_DMG_IGNORE_CI: 'false' };
}
export function stageSidecars({ target, binaryDir, tauriDir: destination = tauriDir }) {
  invariant(['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu'].includes(target), 'unsupported target');
  output(join(destination, 'binaries'));
  return ['shards', 'shards-mcp'].map(name => {
    const source = executable(join(binaryDir, name)), dest = join(destination, 'binaries', `${name}-${target}`);
    copyFileSync(source, dest); chmodSync(dest, 0o755); return dest;
  });
}
export function prepareSidecars(target = process.env.SHARDS_RELEASE_TARGET ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.CARGO_BUILD_TARGET ?? run('rustc', ['--print', 'host-tuple']).trim()) {
  run('cargo', ['build', '--release', '--locked', '-p', 'shards', '--bins', '--target', target], { env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '13.3' }, stdio: 'inherit' });
  return stageSidecars({ target, binaryDir: join(ROOT, 'target', target, 'release') });
}
export function verifyDesktop({ appPath, version, target }) {
  const macos = join(appPath, 'Contents/MacOS');
  const actualVersion = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(appPath, 'Contents/Info.plist')]).trim();
  invariant(actualVersion === version, 'desktop version mismatch');
  invariant(!existsSync(join(macos, 'shards-host')), 'development host must not be shipped');
  verifyArchitecture(join(macos, 'shards-desktop'), target);
  run('codesign', ['--verify', '--deep', '--strict', appPath]);
  const temporary = mkdtempSync(join(tmpdir(), 'shards-app-tools-'));
  output(join(temporary, 'bin'));
  for (const name of ['shards', 'shards-mcp']) copyFileSync(executable(join(macos, name)), join(temporary, 'bin', name));
  return ['desktop-bundle', ...verifyCli({ directory: temporary, version, target })];
}
export async function launchDesktop(appPath) {
  const home = mkdtempSync(join(tmpdir(), 'shards-native-launch-')), env = isolatedEnv(home);
  env.SHARDS_CONFIG_PATH = join(home, 'config.toml');
  run(join(appPath, 'Contents/MacOS/shards'), ['init', '--path', join(home, 'vault'), '--agent', 'release', '--no-hybrid'], { env });
  const child = spawn(join(appPath, 'Contents/MacOS/shards-desktop'), [], { env, stdio: 'ignore' });
  let error; child.on('error', e => { error = e; });
  await new Promise(resolve => setTimeout(resolve, 4000));
  invariant(!error && child.exitCode === null, `native app failed to stay running: ${error?.message ?? child.exitCode}`);
  child.kill('SIGTERM');
  await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000).unref(); });
  return 'native-process-launch';
}
export async function buildDesktop({ target, version, outDir }) {
  invariant(['aarch64-apple-darwin', 'x86_64-apple-darwin'].includes(target), 'desktop requires macOS target');
  prepareSidecars(target);
  run('pnpm', ['-C', 'apps/desktop', 'exec', 'tauri', 'build', '--target', target, '--bundles', 'app,dmg', '--', '--locked'], { env: desktopBuildEnv(target), stdio: 'inherit' });
  const bundle = join(ROOT, 'target', target, 'release/bundle');
  const source = readdirSync(join(bundle, 'dmg')).filter(name => name.endsWith('.dmg'));
  invariant(source.length === 1, 'expected exactly one DMG');
  const filename = `Shards-${version}-${target}.dmg`; output(outDir);
  copyFileSync(join(bundle, 'dmg', source[0]), join(outDir, filename));
  const mount = mkdtempSync(join(tmpdir(), 'shards-dmg-'));
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, join(outDir, filename)]);
  let evidence;
  try { const app = join(mount, 'Shards.app'); evidence = [...verifyDesktop({ appPath: app, version, target }), await launchDesktop(app)]; }
  finally { run('hdiutil', ['detach', mount]); }
  const artifact = recordArtifact(outDir, { filename, variant: 'desktop', target, signing: 'ad-hoc', evidence });
  writeFileSync(join(outDir, `${filename}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}
main(import.meta.url, async () => {
  const [command = 'stage', target, dir] = process.argv.slice(2);
  invariant(['stage', 'build'].includes(command), 'use desktop.mjs stage [TARGET] | build TARGET [OUT]');
  console.log(JSON.stringify(command === 'stage' ? prepareSidecars(target) : await buildDesktop({ target, version: checkVersions().version, outDir: resolve(dir ?? join(ROOT, 'dist/release')) })));
});
