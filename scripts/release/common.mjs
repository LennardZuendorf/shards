import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function invariant(condition, message) { if (!condition) throw new Error(message); }
export function version(value) {
  invariant(typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+\.)*[0-9A-Za-z-]+)?$/.test(value), 'invalid release version');
  for (const part of value.split('-').slice(1).join('-').split('.'))
    invariant(!/^0\d+$/.test(part), 'invalid release version prerelease identifier');
  return value;
}
export function filename(value) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..'), 'unsafe artifact filename');
  return value;
}
export function repository(value) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..'), 'invalid repository');
  return value;
}
export function regular(path) { invariant(lstatSync(path).isFile(), `expected regular file: ${path}`); return path; }
export function sha256(path) { return createHash('sha256').update(readFileSync(regular(path))).digest('hex'); }
export function json(path) { return JSON.parse(readFileSync(regular(path), 'utf8')); }
export const DEFAULT_TIMEOUT_MS = 600_000;
export function duration(ms) {
  const seconds = ms / 1000, minutes = seconds >= 60;
  return `${Number((minutes ? seconds / 60 : seconds).toFixed(1))} ${minutes ? 'min' : 's'}`;
}
export function timeoutLabel(ms) { return ms >= 60_000 ? `${ms} ms (${duration(ms)})` : `${ms} ms`; }
export function commandLine(command, args) { return [command, ...args].join(' '); }
export function timeoutError({ command, args, timeout, elapsed }) {
  return Object.assign(
    new Error(`${commandLine(command, args)} timed out after ${timeoutLabel(timeout)} and was killed; it ran for ${duration(elapsed)}`),
    { code: 'ETIMEDOUT' },
  );
}
export function run(command, args, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS, started = Date.now();
  try {
    return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'inherit'], ...options });
  } catch (error) {
    if (error?.code !== 'ETIMEDOUT') throw error;
    throw timeoutError({ command, args, timeout, elapsed: Date.now() - started });
  }
}
export function output(path) { mkdirSync(path, { recursive: true }); return resolve(path); }
export function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  for (const key of Object.keys(value)) invariant(keys.includes(key), `${label}: unknown key ${key}`);
}
export function main(url, callback) {
  if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url)) {
    Promise.resolve().then(callback).catch(error => { console.error(`release: ${error.message}`); process.exitCode = 1; });
  }
}
