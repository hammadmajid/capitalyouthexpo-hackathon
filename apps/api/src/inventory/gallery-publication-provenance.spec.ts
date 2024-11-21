import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createDatabase } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { publishedGalleryVersion } from './gallery-publication-provenance.js';
// SQL construction only; real PostgreSQL replay stays a Testcontainers gate.
const connection = createDatabase('postgres://localhost/gallery_provenance_unit');
afterAll(async () => {
  await connection.close();
});
it('ACC-004 / SEC-003: publication provenance binds branch, image, immutable action and original version', () => {
  const branch = randomUUID(),
    media = randomUUID(),
    version = 'a'.repeat(64);
  const query = publishedGalleryVersion(
    connection.db as unknown as Transaction,
    branch,
    media,
    version,
  ).toSQL();
  expect(query.params).toEqual([branch, media, version, 1]);
  expect(query.sql).toContain('"target_type" = \'listing_media\'');
  expect(query.sql).toContain('"action" = \'listing.image.changed\'');
  expect(query.sql).toContain('"hostel_audit_log"."before"->>\'version\'');
  expect(query.sql).toMatch(/"hostel_audit_log"\."before"->>'publishedAt' is not null/);
  expect(query.sql).not.toMatch(/actor_role|actor_user_id/);
});
