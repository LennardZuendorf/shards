import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { feature, workspace } from './test-support.mjs';

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
