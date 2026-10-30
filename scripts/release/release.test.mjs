import test from 'node:test';
import assert from 'node:assert/strict';
import { feature, configFixture } from './test-support.mjs';

test('matrix has native architecture builders and does not silently select server', async () => {
  const { buildMatrix } = await feature('release');
  assert.deepEqual(buildMatrix(configFixture(), ['cli', 'desktop']).map(x => [x.os, x.target, x.desktop]), [
    ['macos-15', 'aarch64-apple-darwin', true], ['macos-15-intel', 'x86_64-apple-darwin', true], ['ubuntu-22.04', 'x86_64-unknown-linux-gnu', false],
  ]);
  assert.ok(buildMatrix(configFixture(), ['cli']).every(x => !x.desktop));
});
