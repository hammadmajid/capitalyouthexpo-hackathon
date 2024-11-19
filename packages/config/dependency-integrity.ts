import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { cli, braceRequire } from './dependency-runtime.ts';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z
  .object({
    forge: z.object({ patch: sha, rsa: sha }).strict(),
    braces: z
      .object({ patch: sha, compile: sha, expand: sha, parse: sha, stringify: sha, utils: sha })
      .strict(),
  })
  .strict();
export function textHash(value: string) {
  return createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
}
// SEC-001: verify installed post-images and committed patch files; never trust an ignore list alone.
export function verifyDependencyIntegrity(
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8'),
) {
  try {
    const manifest = manifestSchema.parse(
      JSON.parse(
        readText(fileURLToPath(new URL('../../patches/backports.json', import.meta.url))),
      ) as unknown,
    );
    z.object({ name: z.literal('node-forge'), version: z.literal('1.4.0') }).parse(
      cli('node-forge/package.json') as unknown,
    );
    z.object({ name: z.literal('braces'), version: z.literal('3.0.3') }).parse(
      braceRequire('./package.json') as unknown,
    );
    const files = [
      [
        fileURLToPath(new URL('../../patches/node-forge@1.4.0.patch', import.meta.url)),
        manifest.forge.patch,
      ],
      [cli.resolve('node-forge/lib/rsa.js'), manifest.forge.rsa],
      [
        fileURLToPath(new URL('../../patches/braces@3.0.3.patch', import.meta.url)),
        manifest.braces.patch,
      ],
      ...(['compile', 'expand', 'parse', 'stringify', 'utils'] as const).map(
        (name) => [braceRequire.resolve('./lib/' + name + '.js'), manifest.braces[name]] as const,
      ),
    ] as const;
    if (files.some(([path, expected]) => textHash(readText(path)) !== expected))
      throw new Error('Integrity mismatch');
  } catch {
    throw new Error('Required dependency backport integrity failed');
  }
}
