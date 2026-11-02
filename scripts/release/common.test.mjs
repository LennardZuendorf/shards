import test from 'node:test';
import assert from 'node:assert/strict';
import { feature } from './test-support.mjs';

// A child that never exits on its own; the timeout must kill it and say why.
const hang = 'setInterval(() => {}, 1000)';

test('run() keeps the 10 minute default for ordinary children', async () => {
  const { run, DEFAULT_TIMEOUT_MS } = await feature('common');
  assert.equal(DEFAULT_TIMEOUT_MS, 600_000);
  assert.equal(run(process.execPath, ['--version']).trim(), process.version);
});

test('a timeout names the command, the timeout and the observed runtime', async () => {
  const { run } = await feature('common');
  let error;
  try { run(process.execPath, ['-e', hang], { timeout: 150, stdio: 'ignore' }); } catch (caught) { error = caught; }
  assert.ok(error, 'expected a timeout to throw');
  assert.equal(error.code, 'ETIMEDOUT');
  assert.match(error.message, new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(error.message, /-e setInterval/);
  assert.match(error.message, /timed out after 150 ms and was killed/);
  assert.match(error.message, /it ran for \d+\.\d s/);
});

test('a non-zero exit still fails as the child failed, not as a timeout', async () => {
  const { run } = await feature('common');
  let error;
  try { run(process.execPath, ['-e', 'process.exit(3)'], { stdio: 'ignore' }); } catch (caught) { error = caught; }
  assert.ok(error, 'expected a non-zero exit to throw');
  assert.equal(error.status, 3);
  assert.notEqual(error.code, 'ETIMEDOUT');
});
