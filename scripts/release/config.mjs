import { ROOT, exactKeys, invariant, json, main, repository } from './common.mjs';
import { join } from 'node:path';

export const TARGETS = ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu'];
export function loadConfig(path = join(ROOT, 'release/config.json')) {
  const c = json(path);
  exactKeys(c, ['schema_version', 'macos_minimum', 'release_repository', 'tap_repository', 'variants'], 'config');
  invariant(c.schema_version === 1 && c.macos_minimum === '13.3', 'unsupported config schema or macOS minimum');
  repository(c.release_repository); repository(c.tap_repository);
  exactKeys(c.variants, ['cli', 'desktop', 'server'], 'variants');
  for (const name of ['cli', 'desktop', 'server']) {
    const v = c.variants[name]; exactKeys(v, ['enabled', 'reason', 'targets'], name);
    invariant(typeof v.enabled === 'boolean', `${name}.enabled must be boolean`);
    invariant(Array.isArray(v.targets) && v.targets.length > 0 && new Set(v.targets).size === v.targets.length, `${name}: invalid targets`);
    for (const target of v.targets) invariant(TARGETS.includes(target) && (name !== 'desktop' || target.endsWith('apple-darwin')), `${name}: unsupported target`);
    invariant(v.enabled || (typeof v.reason === 'string' && v.reason.length > 0), `${name}: disabled reason required`);
  }
  return c;
}
export function selectVariants(config, names) {
  const selected = names ?? Object.keys(config.variants).filter(name => config.variants[name].enabled);
  invariant(Array.isArray(selected) && selected.length > 0, 'select at least one variant');
  const set = new Set(selected);
  if (set.has('desktop')) set.add('cli');
  for (const name of set) {
    invariant(Object.hasOwn(config.variants, name), `unknown variant: ${name}`);
    invariant(config.variants[name].enabled, `${name}: ${config.variants[name].reason}`);
  }
  return ['cli', 'desktop', 'server'].filter(name => set.has(name));
}
main(import.meta.url, () => console.log(JSON.stringify(selectVariants(loadConfig(), process.argv[2]?.split(',')))));
