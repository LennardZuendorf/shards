import test from 'node:test';
import assert from 'node:assert/strict';
import { feature } from './test-support.mjs';

test('upgrade baseline excludes current tags, drafts and prereleases and orders numerically', async () => {
  const { previousStable } = await feature('previous');
  const release = tag_name => ({ tag_name, draft: false, prerelease: false });
  const records = [release('v1.2.0'), release('v1.10.0'), release('v2.0.0'), { ...release('v1.11.0'), draft: true }, { ...release('v1.12.0-rc.1'), prerelease: true }];
  assert.equal(previousStable(records, '2.0.0').tag_name, 'v1.10.0');
  assert.equal(previousStable(records, '1.0.0'), undefined);
});
