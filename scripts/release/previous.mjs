import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { invariant, main, output, run, version } from './common.mjs';
import { loadConfig } from './config.mjs';
import { verifyManifest } from './manifest.mjs';

function compare(a, b) {
  const x = a.split('-')[0].split('.').map(BigInt), y = b.split('-')[0].split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
export function previousStable(records, current) {
  version(current);
  return records.filter(r => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name) && compare(r.tag_name.slice(1), current) < 0)
    .sort((a, b) => compare(b.tag_name.slice(1), a.tag_name.slice(1)))[0];
}
main(import.meta.url, () => {
  const [current, destination] = process.argv.slice(2); version(current); invariant(destination, 'use previous.mjs VERSION DESTINATION');
  const repo = loadConfig().release_repository;
  const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`]));
  const previous = previousStable(pages.flat(), current);
  if (!previous) { console.log('No previous stable release; this is the first upgrade baseline.'); return; }
  const directory = output(resolve(destination));
  run('gh', ['release', 'download', previous.tag_name, '--repo', repo, '--dir', directory]);
  invariant(verifyManifest(directory).tag === previous.tag_name, 'previous release manifest mismatch');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `directory=${directory}\n`);
  console.log(`Verified upgrade baseline: ${previous.tag_name}`);
});
