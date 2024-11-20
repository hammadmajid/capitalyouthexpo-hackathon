import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { migrationHashMatches } from '../src/migration-integrity.js';
const lf = 'CREATE TABLE example (id uuid);\n',
  crlf = lf.replaceAll('\n', '\r\n');
const hash = (body: string) => createHash('sha256').update(body).digest('hex');
it.each([lf, crlf])('DB: exact migration content matches its installed hash', (body) => {
  expect(migrationHashMatches(body, hash(body))).toBe(true);
});
it.each([
  [lf, crlf],
  [crlf, lf],
])('DB: Windows/Unix line endings preserve the installed SQL content', (source, installed) => {
  expect(migrationHashMatches(source, hash(installed))).toBe(true);
});
it('DB: actual SQL edits still fail verification', () => {
  expect(migrationHashMatches(lf.replace('uuid', 'text'), hash(lf))).toBe(false);
});
