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
export function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 600_000, stdio: ['ignore', 'pipe', 'inherit'], ...options });
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
