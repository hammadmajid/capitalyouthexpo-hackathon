import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { format, resolveConfig } from 'prettier';
const input = new URL('../../../apps/api/.generated/openapi.json', import.meta.url);
const ast = await openapiTS(input);
const output = new URL('../src/generated/schema.ts', import.meta.url);
const settings = await resolveConfig(
  fileURLToPath(new URL('../../../package.json', import.meta.url)),
);
await mkdir(new URL('../src/generated/', import.meta.url), { recursive: true });
await writeFile(output, await format(astToString(ast), { ...settings, parser: 'typescript' }));
