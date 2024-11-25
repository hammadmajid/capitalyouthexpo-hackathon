import { spawn } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { vendorMapWorker } from './maplibre-worker.mjs';
const require = createRequire(import.meta.url);
await vendorMapWorker();
const root = new URL('../', import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (status) => resolve(status ?? 1));
});
if (code !== 0) process.exit(Number(code));
const output = new URL('.next/standalone/apps/web/', root);
await mkdir(output, { recursive: true });
await cp(new URL('.next/static/', root), new URL('.next/static/', output), { recursive: true });
await cp(new URL('public/', root), new URL('public/', output), { recursive: true });
