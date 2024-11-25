import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';
import { vendorMapWorker } from './maplibre-worker.mjs';

const environment = new URL('../../../.env', import.meta.url);
if (existsSync(environment)) loadEnvFile(environment);
await vendorMapWorker();
const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');
process.argv = [
  process.execPath,
  nextCli,
  'dev',
  '--hostname',
  'localhost',
  ...process.argv.slice(2),
];
await import(pathToFileURL(nextCli).href);
