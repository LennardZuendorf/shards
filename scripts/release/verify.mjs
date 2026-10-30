import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, invariant, main, output, regular, run } from './common.mjs';

export function executable(path) { regular(path); invariant((lstatSync(path).mode & 0o111) !== 0, `not executable: ${path}`); return path; }
export function assertCliVersion(text, expected) { invariant(text.trim() === expected, 'CLI version mismatch'); }
export function assertNativeTarget(target, platform = process.platform, arch = process.arch) {
  const native = { 'darwin/arm64': 'aarch64-apple-darwin', 'darwin/x64': 'x86_64-apple-darwin', 'linux/x64': 'x86_64-unknown-linux-gnu' }[`${platform}/${arch}`];
  invariant(target === native, `runtime verification requires native target ${native ?? 'unsupported'}, got ${target}`);
}
export function validateArchiveEntries(entries) {
  invariant(entries.length > 0 && entries.length < 100, 'unsafe archive size');
  for (const name of entries) invariant(/^(?:\.\/)?(?:bin\/(?:shards|shards-mcp)|completions\/(?:shards.bash|_shards|shards.fish)|LICENSE|README.md|bin\/?|completions\/?|\.)$/.test(name), `unsafe archive member: ${name}`);
}
export function extractArchive(archive, destination) {
  regular(archive);
  validateArchiveEntries(run('tar', ['-tzf', resolve(archive)]).trim().split('\n'));
  const types = run('tar', ['-tvzf', resolve(archive)]).trim().split('\n');
  invariant(types.every(line => ['-', 'd'].includes(line[0])), 'unsafe archive links or special files');
  output(destination);
  run('tar', ['-xzf', resolve(archive), '--no-same-owner', '-C', resolve(destination)]);
  return resolve(destination);
}
export function isolatedEnv(home) {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SHARDS_') && !key.startsWith('MESH_'))), HOME: home, XDG_CONFIG_HOME: join(home, '.config') };
}
export function verifyArchitecture(path, target) {
  const description = run('file', ['-b', regular(path)]);
  const arch = target.startsWith('aarch64') ? /arm64|aarch64/i : /x86[_-]64|x86-64/;
  invariant(arch.test(description), `wrong architecture ${target}: ${description}`);
  invariant(target.endsWith('apple-darwin') ? description.includes('Mach-O') : description.includes('ELF'), 'wrong executable platform');
  if (target.endsWith('apple-darwin')) {
    const load = run('otool', ['-l', path]);
    const minimum = load.match(/\bminos\s+(\d+\.\d+)/)?.[1] ?? load.match(/\bversion\s+(\d+\.\d+)/)?.[1];
    invariant(minimum && Number(minimum.split('.')[0]) <= 13 && (Number(minimum.split('.')[0]) < 13 || Number(minimum.split('.')[1]) <= 3), `macOS minimum exceeds 13.3: ${minimum}`);
  }
}
export function verifyCli({ directory, version, target, smoke = true }) {
  const binary = executable(join(directory, 'bin/shards')), shim = executable(join(directory, 'bin/shards-mcp'));
  assertNativeTarget(target);
  for (const path of [binary, shim]) verifyArchitecture(path, target);
  const home = mkdtempSync(join(tmpdir(), 'shards-artifact-'));
  try {
    const env = isolatedEnv(home), config = join(home, 'config.toml'); env.SHARDS_CONFIG_PATH = config;
    const invoke = args => run(binary, args, { env });
    assertCliVersion(invoke(['--version']), version);
    invoke(['--help']);
    invoke(['--config', config, 'init', '--path', join(home, 'vault'), '--agent', 'release', '--no-hybrid']);
    invoke(['--config', config, 'note', 'new', 'Release artifact verification', '--body', 'release-smoke-marker']);
    const notes = JSON.parse(invoke(['--config', config, '--json', 'note', 'list']));
    invariant(JSON.stringify(notes).includes('Release artifact verification'), 'CLI read-after-write failed');
    const request = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const input = [request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {} }), request(2, 'tools/list', {}), request(3, 'tools/call', { name: 'shards_note_list', arguments: {} })].join('\n') + '\n';
    const child = spawnSync(shim, [], { input, encoding: 'utf8', env, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    invariant(!child.error && child.status === 0, `actual MCP shim failed: ${child.error?.message ?? child.stderr}`);
    const replies = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    const initialize = replies.find(r => r.id === 1)?.result, tools = replies.find(r => r.id === 2)?.result?.tools, call = replies.find(r => r.id === 3)?.result;
    invariant(initialize?.serverInfo?.version === version, 'MCP version mismatch');
    invariant(Array.isArray(tools) && tools.length > 0 && tools.every(tool => tool.name.startsWith('shards_') && !tool.name.startsWith('host_')), 'invalid agent tool surface');
    invariant(call && !call.isError && JSON.stringify(call).includes('Release artifact verification'), 'MCP read-only call failed');
    if (smoke) run('bash', [join(ROOT, 'scripts/smoke.sh')], { env: { ...env, SHARDS_BIN: binary }, timeout: 120_000 });
    return ['cli-smoke'];
  } finally { rmSync(home, { recursive: true, force: true }); }
}
main(import.meta.url, () => {
  const [directory, version, target] = process.argv.slice(2);
  invariant(directory && version && target, 'use verify.mjs DIRECTORY VERSION TARGET');
  console.log(JSON.stringify(verifyCli({ directory: resolve(directory), version, target })));
});
