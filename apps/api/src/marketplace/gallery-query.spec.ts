import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createDatabase } from '@hsm/db';
import { encodePublicGalleryCursor } from '@hsm/contracts';
import { publicGalleryQuery } from './gallery-query.js';
// SQL construction only: postgres-js connects lazily, and no query is executed.
// Real PostgreSQL execution remains a separate Testcontainers acceptance suite.
const connection = createDatabase('postgres://localhost/gallery_statement_unit'),
  branchId = randomUUID();
afterAll(async () => {
  await connection.close();
});
it('ACC-002 / PERF: statement bounds both photo subquery and approved-parent result', () => {
  const statement = publicGalleryQuery(
    connection.db,
    branchId,
    { limit: 20 },
    'private-fixture',
  ).toSQL();
  expect(statement.params.filter((value) => value === 21)).toHaveLength(2);
  expect(statement.sql).toContain('left join');
  expect(statement.sql).toContain('public_gallery_media');
  for (const value of [
    branchId,
    'approved',
    true,
    'clean',
    'listing_photo',
    'private',
    'private-fixture',
    'image/jpeg',
    'image/png',
    'image/webp',
    0n,
    8000000n,
  ])
    expect(statement.params).toContain(value);
  for (const field of ['listing_hidden_at', 'archived_at', 'published_at', 'sha256'])
    expect(statement.sql).toContain(field);
  expect(statement.sql).not.toMatch(/resident|customer_profiles|booking_documents|rent_invoice/i);
});
it('ACC-002: continuation uses ordered greater-than position and UUID tie-break without selecting private keys', () => {
  const mediaId = randomUUID(),
    statement = publicGalleryQuery(
      connection.db,
      branchId,
      { limit: 1, cursor: encodePublicGalleryCursor(7, mediaId) },
      'private-fixture',
    ).toSQL();
  expect(statement.params).toContain(7);
  expect(statement.params).toContain(mediaId);
  expect(statement.params.filter((value) => value === 2)).toHaveLength(2);
  expect(statement.sql).toContain('order by');
  expect(statement.sql).not.toContain('object_key');
  expect(statement.sql).not.toContain('uploaded_by');
});
