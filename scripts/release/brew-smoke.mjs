import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { invariant, main, sha256 } from './common.mjs';
import { verifyManifest } from './manifest.mjs';
import { renderTap } from './homebrew.mjs';

// This command mutates Homebrew itself. Run only on a disposable native CI runner.
// HOME stays unchanged: Homebrew's macOS sandbox cannot use an invented home path.
export async function smokeHomebrew({ dist, target, previousDist, env = process.env }) {
  invariant(env.SHARDS_BREW_SMOKE_DISPOSABLE === '1', 'requires SHARDS_BREW_SMOKE_DISPOSABLE=1 on a disposable macOS runner');
  invariant(process.platform === 'darwin', 'Homebrew native smoke requires macOS');
  invariant(target === `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`, 'Homebrew smoke target must match native runner');
  const manifest = verifyManifest(resolve(dist));
  const { verifyCli, assertCliVersion } = await import('./verify.mjs');
  const { verifyDesktop } = await import('./desktop.mjs');
  const root = mkdtempSync(join(tmpdir(), 'shards-brew-smoke-'));
  const cleanEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !/^(SHARDS_|MESH_)/.test(name)));
  Object.assign(cleanEnv, { HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1', HOMEBREW_DEVELOPER: '1', HOMEBREW_CACHE: join(root, 'cache'), HOMEBREW_TEMP: join(root, 'tmp'), XDG_CONFIG_HOME: join(root, 'xdg'), SHARDS_CONFIG_PATH: join(root, 'config.toml') });
  const execute = (command, args, extra = {}) => execFileSync(command, args, { env: cleanEnv, encoding: 'utf8', timeout: 600_000, ...extra });
  const brew = (...args) => { console.log(`brew ${args.join(' ')}`); return execute('brew', args); };
  const prefix = brew('--prefix').trim();
  const repository = brew('--repository').trim();
  const tap = 'LennardZuendorf/tap', formula = `${tap}/shards-cli`, cask = `${tap}/shards`;
  const tapPath = join(repository, 'Library/Taps/lennardzuendorf/homebrew-tap');
  const bin = join(prefix, 'bin/shards');
  const present = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
  for (const path of [tapPath, bin, join(prefix, 'bin/shards-mcp'), join(prefix, 'Cellar/shards-cli'), join(prefix, 'Cellar/crystal'), join(prefix, 'Caskroom/shards')]) {
    invariant(!present(path), `disposable runner must not contain ${path}`);
  }
  mkdirSync(join(root, 'apps')); mkdirSync(join(root, 'vault'));
  writeFileSync(join(root, 'vault/preserve.md'), 'preserve user data\n');
  writeFileSync(cleanEnv.SHARDS_CONFIG_PATH, `[core]\nvault_path = ${JSON.stringify(join(root, 'vault'))}\n`);
  const configBefore = readFileSync(cleanEnv.SHARDS_CONFIG_PATH, 'utf8');
  const appdir = `--appdir=${join(root, 'apps')}`;
  const generated = join(root, 'tap');
  const render = (m, directory) => renderTap({ manifest: m, releaseRepository: 'LennardZuendorf/shards', tapRepository: 'LennardZuendorf/homebrew-tap', outputDir: generated, mode: 'candidate-local', baseUrl: pathToFileURL(resolve(directory)).href });
  const assertData = () => {
    invariant(readFileSync(join(root, 'vault/preserve.md'), 'utf8') === 'preserve user data\n', 'Homebrew changed vault data');
    invariant(readFileSync(cleanEnv.SHARDS_CONFIG_PATH, 'utf8') === configBefore, 'Homebrew changed configuration');
  };
  const verifyTools = version => {
    const installed = brew('--prefix', formula).trim();
    assertCliVersion(execute(join(installed, 'bin/shards'), ['--version']), version);
    verifyCli({ directory: installed, version, target });
  };
  const verifyApp = version => verifyDesktop({ appPath: join(root, 'apps/Shards.app'), version, target });
  const refuse = args => {
    let rejected;
    try { brew(...args); } catch (error) { rejected = `${error.stdout ?? ''}\n${error.stderr ?? ''}`; }
    invariant(rejected && /conflict|already|linked|overwrite/i.test(rejected), 'Homebrew did not refuse executable conflict for the expected reason');
    console.log(`Expected Homebrew refusal: ${rejected.trim()}`);
  };
  let linked = false, sentinel = false;
  try {
    render(manifest, dist);
    mkdirSync(join(tapPath, '..'), { recursive: true }); symlinkSync(generated, tapPath, 'dir'); linked = true;
    if (brew('commands', '--quiet').split(/\s+/).includes('trust')) brew('trust', '--tap', tap);
    for (const path of ['Formula/shards-cli.rb', 'Casks/shards.rb']) console.log(execute('ruby', ['-c', join(generated, path)]).trim());
    brew('style', join(generated, 'Formula/shards-cli.rb'), join(generated, 'Casks/shards.rb'));
    // Keep the conflict definition available even while it is uninstalled:
    // Homebrew developer mode rejects conflicts naming an unavailable formula.
    const fixture = join(root, 'conflict'); mkdirSync(join(fixture, 'bin'), { recursive: true });
    writeFileSync(join(fixture, 'bin/shards'), '#!/bin/sh\necho crystal-conflict-fixture\n'); chmodSync(join(fixture, 'bin/shards'), 0o755);
    const archive = join(root, 'crystal-conflict.tar.gz'); execute('tar', ['-czf', archive, '-C', fixture, 'bin']);
    writeFileSync(join(generated, 'Formula/crystal.rb'), `class Crystal < Formula\n  desc "Disposable Crystal executable conflict fixture"\n  homepage "https://github.com/crystal-lang/shards"\n  url "${pathToFileURL(archive).href}"\n  version "1.0.0"\n  sha256 "${sha256(archive)}"\n  license "MIT"\n  def install\n    bin.install "bin/shards"\n  end\nend\n`);
    // Existing unmanaged executable: a failed link must preserve its exact bytes.
    writeFileSync(bin, '#!/bin/sh\necho unrelated-command\n', { flag: 'wx' }); sentinel = true; chmodSync(bin, 0o755);
    const before = readFileSync(bin, 'utf8');
    refuse(['install', '--formula', formula]);
    invariant(lstatSync(bin).isFile() && readFileSync(bin, 'utf8') === before, 'Homebrew overwrote unrelated executable');
    if (existsSync(join(prefix, 'Cellar/shards-cli'))) brew('uninstall', '--formula', formula);
    rmSync(bin); sentinel = false;
    // A fixture named crystal exercises the declared Crystal package conflict.
    // It is never described as the actual Crystal package or its runtime.
    brew('install', '--formula', `${tap}/crystal`);
    refuse(['install', '--formula', formula]);
    invariant(execute(bin, []).trim() === 'crystal-conflict-fixture', 'Crystal conflict fixture was overwritten');
    brew('uninstall', '--formula', `${tap}/crystal`);
    // Tools first; desktop removal leaves both public executables usable.
    brew('install', '--formula', formula); brew('test', formula); verifyTools(manifest.version);
    brew('install', '--cask', appdir, cask);
    invariant(existsSync(join(root, 'apps/Shards.app')), 'desktop app was not installed in disposable appdir');
    verifyApp(manifest.version);
    verifyTools(manifest.version); brew('uninstall', '--cask', appdir, cask); verifyTools(manifest.version); assertData();
    brew('uninstall', '--formula', formula);
    // Desktop first must install the tools dependency; reinstall preserves data.
    brew('install', '--cask', appdir, cask); verifyTools(manifest.version);
    verifyApp(manifest.version);
    brew('reinstall', '--cask', appdir, cask); verifyTools(manifest.version); verifyApp(manifest.version); assertData();
    brew('uninstall', '--cask', appdir, cask); brew('uninstall', '--formula', formula);
    if (previousDist) {
      const previous = verifyManifest(resolve(previousDist));
      invariant(previous.version !== manifest.version, 'upgrade fixture must use a different version');
      render(previous, previousDist); brew('install', '--formula', formula); verifyTools(previous.version);
      brew('install', '--cask', appdir, cask);
      verifyApp(previous.version);
      render(manifest, dist); brew('upgrade', '--formula', formula); brew('upgrade', '--cask', appdir, cask);
      verifyTools(manifest.version); verifyApp(manifest.version); assertData();
    }
    return { evidence: ['homebrew-native-install', 'homebrew-conflict-refusal', ...(previousDist ? ['homebrew-upgrade'] : [])], target, version: manifest.version, upgrade: previousDist ? 'tested' : 'not-tested-no-previous-candidate' };
  } finally {
    if (linked) {
      for (const args of [['uninstall', '--cask', appdir, cask], ['uninstall', '--formula', formula], ['uninstall', '--formula', `${tap}/crystal`]]) {
        // Missing packages are expected here. Cleanup must never mask the test failure.
        try { brew(...args); } catch { /* disposable runner cleanup */ }
      }
      rmSync(tapPath);
    }
    if (sentinel && existsSync(bin) && lstatSync(bin).isFile() && readFileSync(bin, 'utf8') === '#!/bin/sh\necho unrelated-command\n') rmSync(bin);
    rmSync(root, { recursive: true, force: true });
  }
}
main(import.meta.url, async () => {
  const [dist, target, flag, previousDist] = process.argv.slice(2);
  invariant(dist && target && (!flag || flag === '--previous') && (!flag || previousDist), 'usage: brew-smoke.mjs DIST TARGET [--previous PREVIOUS_DIST]');
  console.log(JSON.stringify(await smokeHomebrew({ dist, target, previousDist })));
});
