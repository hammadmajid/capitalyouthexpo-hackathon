import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tokensCss } from '../src/tokens.ts';
const result = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '-p', 'tsconfig.json'],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/tokens.css', import.meta.url), tokensCss());
