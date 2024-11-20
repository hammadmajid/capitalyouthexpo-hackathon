import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import { z } from 'zod';
const folder = fileURLToPath(new URL('../migrations/', import.meta.url));
const journal = z
  .object({
    entries: z
      .array(
        z.object({
          idx: z.number().int().nonnegative(),
          tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
          when: z.number().int().positive().safe(),
        }),
      )
      .nonempty(),
  })
  .parse(JSON.parse(readFileSync(folder + 'meta/_journal.json', 'utf8')));
it('ACC-006: the complete additive journal covers every SQL migration exactly once in order', () => {
  const names = journal.entries.map((entry) => entry.tag + '.sql');
  expect(names.slice().sort()).toEqual(
    readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort(),
  );
  expect(new Set(names).size).toBe(names.length);
  expect(journal.entries.map((entry) => entry.idx)).toEqual(names.map((_name, index) => index));
  expect(journal.entries.map((entry) => entry.when)).toEqual(
    journal.entries.map((entry) => entry.when).sort((left, right) => left - right),
  );
  expect(new Set(journal.entries.map((entry) => entry.when)).size).toBe(names.length);
});
it('ACC-006: replay expectations include every actual migration checksum and journal timestamp', () => {
  const expected = journal.entries.map((entry) => ({
    hash: createHash('sha256')
      .update(readFileSync(folder + entry.tag + '.sql'))
      .digest('hex'),
    createdAt: String(entry.when),
  }));
  const actual = readMigrationFiles({ migrationsFolder: folder }).map((entry) => ({
    hash: entry.hash,
    createdAt: String(entry.folderMillis),
  }));
  expect(actual).toEqual(expected);
  expect(actual.length).toBeGreaterThan(7);
});
