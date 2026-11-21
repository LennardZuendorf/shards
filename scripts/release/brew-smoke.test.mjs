import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { feature, workspace, put } from './test-support.mjs';

test('Brew scratch directories exist before commands and preserve the real home', async t => {
  const { homebrewEnvironment } = await feature('brew-smoke');
  const env = homebrewEnvironment({ HOME: '/operator', SHARDS_AGENT: 'personal', MESH_AGENT: 'personal' }, workspace(t));
  assert.equal(env.HOME, '/operator');
  assert.equal(env.SHARDS_AGENT, undefined);
  assert.equal(env.MESH_AGENT, undefined);
  for (const path of [env.HOMEBREW_TEMP, env.HOMEBREW_CACHE]) assert.ok(statSync(path).isDirectory());
});

test('failed Brew commands expose captured stdout and preserve the original failure', async () => {
  const { runBrew } = await feature('brew-smoke');
  const failure = Object.assign(new Error('Command failed: brew style'), { stdout: Buffer.from('FormulaAudit/ComponentsOrder: depends_on should precede on_macos\n'), status: 1 });
  const lines = [];
  assert.throws(() => runBrew(['style', 'Formula/shards-cli.rb'], () => { throw failure; }, value => lines.push(value)), error => error === failure);
  assert.match(lines.join('\n'), /brew style Formula\/shards-cli.rb/);
  assert.match(lines.join('\n'), /FormulaAudit\/ComponentsOrder/);
  assert.equal(runBrew(['--prefix'], (command, args) => {
    assert.equal(command, 'brew');
    assert.deepEqual(args, ['--prefix']);
    return '/disposable/brew\n';
  }, () => {}), '/disposable/brew\n');
});

test('cask install operations select appdir while uninstall uses recorded configuration', async () => {
  const { caskArgs } = await feature('brew-smoke');
  for (const action of ['install', 'reinstall', 'upgrade']) {
    assert.deepEqual(caskArgs(action, '/disposable/apps', 'owner/tap/shards'), [action, '--cask', '--appdir=/disposable/apps', 'owner/tap/shards']);
  }
  assert.deepEqual(caskArgs('uninstall', '/disposable/apps', 'owner/tap/shards'), ['uninstall', '--cask', 'owner/tap/shards']);
  assert.throws(() => caskArgs('zap', '/disposable/apps', 'owner/tap/shards'), /unsupported cask operation/);
});

test('Crystal conflict archive keeps its bin path under Homebrew root detection', async t => {
  const { createConflictArchive } = await feature('brew-smoke');
  const archive = createConflictArchive(workspace(t));
  const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(files.includes('bin/shards'));
  assert.ok(files.includes('README.md'), 'a root file prevents Homebrew stripping the sole bin directory');
});

test('installed public tools must resolve to the formula executables', async t => {
  const { verifyPublicBinaries } = await feature('brew-smoke');
  const root = workspace(t), prefix = join(root, 'brew'), installed = join(prefix, 'Cellar/shards-cli/1.0.0');
  mkdirSync(join(prefix, 'bin'), { recursive: true });
  for (const name of ['shards', 'shards-mcp']) {
    put(installed, `bin/${name}`, 'binary');
    symlinkSync(join(installed, 'bin', name), join(prefix, 'bin', name));
  }
  assert.doesNotThrow(() => verifyPublicBinaries(prefix, installed));
  const publicMcp = join(prefix, 'bin/shards-mcp'); rmSync(publicMcp);
  assert.throws(() => verifyPublicBinaries(prefix, installed));
  symlinkSync(put(root, 'unrelated-command', 'unrelated'), publicMcp);
  assert.throws(() => verifyPublicBinaries(prefix, installed), /public command/);
});

const teardownPackages = prefix => ({
  cask: { path: join(prefix, 'Caskroom/shards'), args: ['uninstall', '--cask', 'LennardZuendorf/tap/shards'] },
  formula: { path: join(prefix, 'Cellar/shards-cli'), args: ['uninstall', '--formula', 'LennardZuendorf/tap/shards-cli'] },
  crystal: { path: join(prefix, 'Cellar/crystal'), args: ['uninstall', '--formula', 'LennardZuendorf/tap/crystal'] },
});

test('teardown skips a keg the cask uninstall already removed with the cask', async t => {
  const { removeInstalled } = await feature('brew-smoke');
  const prefix = join(workspace(t), 'brew');
  mkdirSync(join(prefix, 'Caskroom/shards/0.2.0'), { recursive: true });
  mkdirSync(join(prefix, 'Cellar/shards-cli/0.2.0'), { recursive: true });
  const packages = teardownPackages(prefix), calls = [];
  // Homebrew removes a cask's dependency formula together with the cask: exactly the
  // teardown order behind the v0.2.0 failure ("No such keg" right after the cask uninstall).
  const brew = (...args) => {
    calls.push(args.join(' '));
    if (args[0] === 'uninstall' && args[1] === '--cask') rmSync(join(prefix, 'Cellar/shards-cli'), { recursive: true, force: true });
  };
  const removed = removeInstalled({ brew, prefix, packages: [packages.cask, packages.formula, packages.crystal] });
  assert.deepEqual(calls, ['uninstall --cask LennardZuendorf/tap/shards']);
  assert.deepEqual(removed, ['LennardZuendorf/tap/shards']);
});

test('teardown issues no command for packages this runner never installed', async t => {
  const { removeInstalled } = await feature('brew-smoke');
  const prefix = join(workspace(t), 'brew');
  const packages = teardownPackages(prefix), calls = [];
  assert.deepEqual(removeInstalled({ brew: (...args) => calls.push(args), prefix, packages: Object.values(packages) }), []);
  assert.deepEqual(calls, []);
});

test('teardown tolerates only the keg-disappeared race and surfaces every other failure', async t => {
  const { removeInstalled } = await feature('brew-smoke');
  const prefix = join(workspace(t), 'brew'), packages = teardownPackages(prefix);
  mkdirSync(join(prefix, 'Cellar/shards-cli/0.2.0'), { recursive: true });
  const logs = [];
  const kegGone = Object.assign(new Error('Command failed: brew uninstall'), { stderr: 'Error: No such keg: /opt/homebrew/Cellar/shards-cli\n', status: 1 });
  assert.deepEqual(removeInstalled({ brew: () => { throw kegGone; }, prefix, packages: [packages.formula], log: value => logs.push(value) }), []);
  assert.match(logs.join('\n'), /already removed by an earlier step: uninstall --formula/);
  const refused = Object.assign(new Error('Command failed: brew uninstall'), { stderr: 'Error: Permission denied @ rb_sysopen\n', status: 1 });
  assert.throws(() => removeInstalled({ brew: () => { throw refused; }, prefix, packages: [packages.formula] }), error => error === refused);
  assert.throws(() => removeInstalled({ brew: () => {}, prefix, packages: [{ path: '/opt/homebrew/Cellar/shards-cli', args: ['uninstall'] }] }), /refusing to uninstall outside the Homebrew prefix/);
});

test('every smoke removal goes through the guarded teardown', async () => {
  const source = readFileSync(new URL('./brew-smoke.mjs', import.meta.url), 'utf8');
  const direct = source.split('\n').filter(line => /brew\((?:'|")uninstall/.test(line));
  assert.deepEqual(direct, [], 'uninstall only through removeInstalled so an absent keg cannot fail the release');
});
