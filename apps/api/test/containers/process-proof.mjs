import { readFileSync, readlinkSync } from 'node:fs';
const entries = new Map([
  ['api', 'apps/api/dist/main.js'],
  ['worker', 'apps/worker/dist/main.js'],
  ['web', 'apps/web/.next/standalone/apps/web/server.js'],
]);
const role = process.argv[2];
const entry = entries.get(role);
if (!entry) process.exit(1);
const args = readFileSync('/proc/1/cmdline', 'utf8').split(String.fromCharCode(0));
const node = readlinkSync('/proc/1/exe') === '/usr/local/bin/node';
// Next.js replaces argv's process title after starting the standalone entry.
const version =
  role === 'web'
    ? JSON.parse(readFileSync('/workspace/apps/web/node_modules/next/package.json', 'utf8')).version
    : undefined;
const next =
  role === 'web' &&
  args[0] === 'next-server (v' + version + ')' &&
  readlinkSync('/proc/1/cwd') === '/workspace/apps/web/.next/standalone/apps/web';
process.exit(node && (args.includes(entry) || next) ? 0 : 1);
