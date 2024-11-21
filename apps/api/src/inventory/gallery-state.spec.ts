import { verifiedKey } from '@hsm/files';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { listingMedia } from '@hsm/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  cleanGalleryImage,
  projectGallery,
  readGalleryPage,
  readGalleryRow,
  type GalleryRow,
} from './gallery-state.js';
const id = randomUUID(),
  fileId = randomUUID(),
  branchId = randomUUID(),
  now = new Date('2026-10-16T10:00:00Z');
const row: GalleryRow = {
  id,
  fileId,
  branchId,
  altText: 'Hostel exterior',
  sortOrder: 0,
  roomId: null,
  seatId: null,
  publishedAt: null,
  publishedByUserId: null,
  archivedAt: null,
  createdAt: now,
  objectKey: verifiedKey('listing_photo', fileId),
  sha256: Buffer.alloc(32, 1),
  mimeType: 'image/jpeg',
  sizeBytes: 100n,
  scanStatus: 'clean',
};
it('ROOM-003 / SEC-003: projection is stable and returns no private file provenance', () => {
  const result = projectGallery(row);
  expect(result).toEqual({
    id,
    fileId,
    branchId,
    altText: row.altText,
    sortOrder: 0,
    roomId: null,
    bedId: null,
    publishedAt: null,
    archivedAt: null,
    scanStatus: 'clean',
    version: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(projectGallery({ ...row })).toEqual(result);
  expect(cleanGalleryImage({ ...row, id: fileId })).toBeUndefined();
});
it.each([
  { altText: 'Changed' },
  { sortOrder: 1 },
  { branchId: randomUUID() },
  { objectKey: 'private/listing_photo/' + fileId + '/other' },
  { sha256: null },
  { sha256: Buffer.alloc(32, 2) },
  { sizeBytes: 101n },
  { mimeType: 'image/png' },
  { scanStatus: 'rejected' as const },
  { publishedAt: now },
  { archivedAt: now },
])('ROOM-003: revision binds actual metadata and immutable-file snapshot case %#', (patch) => {
  expect(projectGallery({ ...row, ...patch }).version).not.toBe(projectGallery(row).version);
});
it.each([
  { scanStatus: 'pending' as const },
  { scanStatus: 'rejected' as const },
  { sha256: null },
  { sha256: Buffer.alloc(31) },
  { objectKey: 'quarantine/listing_photo/' + fileId },
  { objectKey: 'private/resident_document/' + fileId + '/snapshot' },
  { objectKey: 'private/listing_photo/' + randomUUID() + '/snapshot' },
  { mimeType: 'application/pdf' },
  { sizeBytes: 0n },
  { sizeBytes: 8000001n },
])('SEC-003: publication denies unverified image provenance case %#', (patch) => {
  expect(() => cleanGalleryImage({ ...row, ...patch, id: fileId })).toThrow(
    expect.objectContaining({ code: 'CONFLICT' }),
  );
});
it('ROOM-003: published and archived timestamps preserve actual history', () => {
  expect(projectGallery({ ...row, publishedAt: now, archivedAt: now })).toMatchObject({
    publishedAt: now.toISOString(),
    archivedAt: now.toISOString(),
  });
});
it('ACC-004: bounded gallery reads apply exact branch, bucket, purpose, archive state and cursor', async () => {
  const store = queryFixture(),
    second = { ...row, id: randomUUID() };
  store.enqueue(listingMedia, [row, second]);
  const result = await readGalleryPage(
    store.transaction,
    branchId,
    'private',
    { limit: 1, state: 'active', cursor: id },
    false,
  );
  expect(result).toMatchObject({
    data: [{ id }],
    nextCursor: id,
    canEdit: false,
    canPublish: false,
  });
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Missing predicate');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.params).toEqual(expect.arrayContaining([branchId, 'private', 'listing_photo', id]));
  expect(query.sql).toContain('"listing_media"."archived_at" is null');
  expect(store.operations).toContainEqual({ table: listingMedia, kind: 'limit', args: [2] });
});
it.each(['archived', 'all'] as const)(
  'ROOM-003: genuine empty %s history has no invented cursor',
  async (state) => {
    const store = queryFixture();
    store.enqueue(listingMedia, []);
    expect(
      await readGalleryPage(
        store.transaction,
        branchId,
        'private',
        { limit: 20, state },
        true,
        true,
      ),
    ).toEqual({ data: [], nextCursor: null, canEdit: true, canPublish: true });
  },
);
it('ACC-004: exact private image reads are locked and missing records remain opaque', async () => {
  const store = queryFixture();
  store.enqueue(listingMedia, [row], []);
  expect(await readGalleryRow(store.transaction, branchId, id, 'private')).toMatchObject({ id });
  expect(store.locks).toContainEqual({ table: listingMedia, mode: 'update' });
  await expect(readGalleryRow(store.transaction, branchId, id, 'private')).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});

it('SEC-003: a malformed snapshot suffix cannot be treated as a verified image', () => {
  expect(() =>
    cleanGalleryImage({
      ...row,
      id: fileId,
      objectKey: 'private/listing_photo/' + fileId + '/not-a-snapshot',
    }),
  ).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
});
