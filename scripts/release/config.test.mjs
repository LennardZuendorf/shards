import test from 'node:test';
import assert from 'node:assert/strict';
import { feature, workspace, put, configFixture } from './test-support.mjs';

test('enabled variants exclude absent server and desktop requires cli', async t => {
  const { loadConfig, selectVariants } = await feature('config');
  const config = loadConfig(put(workspace(t), 'config.json', JSON.stringify(configFixture())));
  assert.deepEqual(selectVariants(config), ['cli', 'desktop']);
  assert.deepEqual(selectVariants(config, ['desktop']), ['cli', 'desktop']);
  assert.deepEqual(selectVariants(config, ['cli']), ['cli']);
  assert.throws(() => selectVariants(config, ['server']), /server_not_implemented/);
  assert.throws(() => selectVariants(config, ['typo']), /unknown variant/);
});
test('config rejects unknown keys, malformed variant types and unsafe targets', async t => {
  const { loadConfig } = await feature('config');
  for (const mutate of [c => { c.extra = 1; }, c => { c.variants.cli.enabled = 'true'; }, c => { c.variants.cli.targets = ['../../evil']; }]) {
    const c = configFixture(); mutate(c);
    assert.throws(() => loadConfig(put(workspace(t), 'config.json', JSON.stringify(c))));
  }
});
