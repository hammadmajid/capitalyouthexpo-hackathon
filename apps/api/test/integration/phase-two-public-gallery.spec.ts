import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches, cities, files, listingMedia } from '@hsm/db';
import { listingDetailsSchema, publicGalleryPageSchema } from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>, bytes: Buffer;
beforeAll(async () => {
  bytes = await readFile(new URL('./fixtures/gallery.png', import.meta.url));
  fixture = await phaseTwoFixture(new Date('2026-10-17T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
async function photo(branchId: string, sortOrder: number, published = true) {
  const fileId = randomUUID(),
    id = randomUUID(),
    key = verifiedKey('listing_photo', fileId);
  // Pre-scanned real object fixture. Existing real scanner acceptance remains blocking.
  await fixture.storage.storage.putVerified(key, 'image/png', bytes);
  await fixture.connection.db.insert(files).values({
    id: fileId,
    uploadedBy: fixture.ownerId,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey: key,
    mimeType: 'image/png',
    sizeBytes: BigInt(bytes.length),
    purpose: 'listing_photo',
    scanStatus: 'clean',
    sha256: createHash('sha256').update(bytes).digest(),
  });
  await fixture.connection.db.insert(listingMedia).values({
    id,
    branchId,
    fileId,
    sortOrder,
    altText: 'Actual fixture photo ' + sortOrder,
    publishedAt: published ? fixture.now : null,
    publishedByUserId: published ? fixture.ownerId : null,
  });
  return { id, fileId, key };
}
async function page(branchId: string, query = '') {
  const result = await fixture.application.inject({
    url: '/v1/marketplace/' + branchId + '/gallery' + query,
  });
  expect(result.statusCode).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  return publicGalleryPageSchema.parse(result.json());
}
it('ACC-002 / SEC-003: real empty gallery differs from hidden, withdrawn and inactive-city parents', async () => {
  const { branchId } = await fixture.inventory();
  expect(await page(branchId)).toEqual({ branchId, data: [], nextCursor: null });
  const request = () =>
    fixture.application.inject({ url: '/v1/marketplace/' + branchId + '/gallery' });
  await fixture.connection.db
    .update(branches)
    .set({ listingHiddenAt: fixture.now })
    .where(eq(branches.id, branchId));
  expect((await request()).statusCode).toBe(404);
  await fixture.connection.db
    .update(branches)
    .set({ listingHiddenAt: null, verificationStatus: 'submitted' })
    .where(eq(branches.id, branchId));
  expect((await request()).statusCode).toBe(404);
  await fixture.connection.db
    .update(branches)
    .set({ verificationStatus: 'approved' })
    .where(eq(branches.id, branchId));
  try {
    await fixture.connection.db
      .update(cities)
      .set({ isActive: false })
      .where(eq(cities.id, fixture.cityId));
    expect((await request()).statusCode).toBe(404);
  } finally {
    await fixture.connection.db
      .update(cities)
      .set({ isActive: true })
      .where(eq(cities.id, fixture.cityId));
  }
});
it('ROOM-003 / SEC-003: real tied-order continuation, cover preview, bytes and scan revocation remain private', async () => {
  const { branchId } = await fixture.inventory(),
    first = await photo(branchId, 0),
    second = await photo(branchId, 0),
    last = await photo(branchId, 1);
  await photo(branchId, 0, false);
  const expected = [first.id, second.id].sort().concat(last.id),
    start = await page(branchId, '?limit=2');
  expect(start.data.map((row) => row.id)).toEqual(expected.slice(0, 2));
  if (!start.nextCursor) throw new Error('Missing continuation');
  const end = await page(branchId, '?limit=2&cursor=' + encodeURIComponent(start.nextCursor));
  expect(end.data.map((row) => row.id)).toEqual([last.id]);
  expect(end.nextCursor).toBeNull();
  const details = await fixture.application.inject({ url: '/v1/marketplace/' + branchId });
  expect(details.statusCode).toBe(200);
  expect(listingDetailsSchema.parse(details.json()).media.map((row) => row.id)).toEqual([
    expected[0],
  ]);
  const image = await fixture.application.inject({ url: '/v1/marketplace/media/' + last.id });
  expect(image.statusCode).toBe(200);
  expect(image.rawPayload).toEqual(bytes);
  expect(JSON.stringify(start)).not.toContain(first.fileId);
  expect(JSON.stringify(start)).not.toContain(first.key);
  await fixture.connection.db
    .update(files)
    .set({ scanStatus: 'rejected' })
    .where(eq(files.id, last.fileId));
  expect(
    (await fixture.application.inject({ url: '/v1/marketplace/media/' + last.id })).statusCode,
  ).toBe(404);
  expect((await page(branchId)).data.map((row) => row.id)).toEqual(expected.slice(0, 2));
});
it('ROOM-003: the real gallery page bound is not a total-photo cap', async () => {
  const { branchId } = await fixture.inventory(),
    ids: string[] = [];
  for (let order = 0; order < 103; order++) ids.push((await photo(branchId, order)).id);
  const first = await page(branchId, '?limit=100');
  expect(first.data.map((row) => row.id)).toEqual(ids.slice(0, 100));
  if (!first.nextCursor) throw new Error('Missing bounded continuation');
  const next = await page(branchId, '?limit=100&cursor=' + encodeURIComponent(first.nextCursor));
  expect(next.data.map((row) => row.id)).toEqual(ids.slice(100));
  expect(next.nextCursor).toBeNull();
  const last = ids.at(-1);
  if (!last) throw new Error('Missing real photo');
  const result = await fixture.application.inject({ url: '/v1/marketplace/media/' + last });
  expect(result.statusCode).toBe(200);
  expect(result.rawPayload).toEqual(bytes);
});

it('SEC-003: real gallery excludes archived, pending, foreign-bucket, wrong-purpose and invalid image metadata', async () => {
  const { branchId } = await fixture.inventory(),
    kept = await photo(branchId, 20);
  const archived = await photo(branchId, 0);
  await fixture.connection.db
    .update(listingMedia)
    .set({ archivedAt: fixture.now })
    .where(eq(listingMedia.id, archived.id));
  const variants = [
    { scanStatus: 'pending' as const, sha256: null },
    { bucket: 'other-private-bucket' },
    { purpose: 'resident_document' as const },
    { mimeType: 'application/pdf' },
    { sizeBytes: 8000001n },
  ];
  for (const [index, patch] of variants.entries()) {
    const excluded = await photo(branchId, index + 1);
    await fixture.connection.db.update(files).set(patch).where(eq(files.id, excluded.fileId));
    expect(
      (await fixture.application.inject({ url: '/v1/marketplace/media/' + excluded.id }))
        .statusCode,
    ).toBe(404);
  }
  expect((await page(branchId)).data.map((row) => row.id)).toEqual([kept.id]);
});
