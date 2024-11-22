import { createHash, randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { listingMedia } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { PublicListingMedia } from './media.js';
const bytes = Buffer.from(
  // eslint-disable-next-line no-secrets/no-secrets -- Public 1px PNG fixture bytes, not a credential.
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
  'base64',
);
const file = {
  fileId: randomUUID(),
  objectKey: 'private/unit/photo.png',
  sha256: createHash('sha256').update(bytes).digest(),
  mimeType: 'image/png',
  sizeBytes: BigInt(bytes.byteLength),
};
const mediaId = randomUUID();
function fixture(first: unknown[] = [file], second: unknown[] = [file], result = bytes) {
  const store = queryFixture();
  store.enqueue(listingMedia, first, second);
  const storage = { read: vi.fn(async () => result) };
  return {
    ...store,
    storage,
    media: new PublicListingMedia(store.database, storage, 'private-catalog'),
  };
}
it('ACC-002 SEC-003: only a clean, explicitly published image with intact bytes is returned', async () => {
  const store = fixture();
  expect(await store.media.read(mediaId)).toEqual({ bytes, mimeType: 'image/png' });
  expect(store.storage.read).toHaveBeenCalledWith(file.objectKey, bytes.byteLength);
  for (const predicate of store.predicates) {
    const query = new PgDialect().sqlToQuery(predicate.value);
    for (const value of [
      'approved',
      'listing_photo',
      'clean',
      'private',
      'private-catalog',
      mediaId,
    ])
      expect(query.params).toContain(value);
    expect(query.sql).toContain('listing_hidden_at');
  }
});
it.each([
  { first: [] },
  { first: [{ ...file, sha256: null }] },
  { first: [{ ...file, mimeType: 'application/pdf' }] },
  { first: [{ ...file, sizeBytes: 0n }] },
  { first: [{ ...file, sizeBytes: 8000001n }] },
])(
  'SEC-003: missing, unsafe or oversized image metadata cannot trigger a storage read',
  async ({ first }) => {
    const store = fixture(first);
    await expect(store.media.read(mediaId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(store.storage.read).not.toHaveBeenCalled();
  },
);
it('SEC-003: storage outages expose no object key or credentials', async () => {
  const store = fixture();
  store.storage.read.mockRejectedValueOnce(new Error('Private storage diagnostics'));
  await expect(store.media.read(mediaId)).rejects.toMatchObject({ code: 'INTERNAL', status: 503 });
});
it.each([Buffer.alloc(bytes.length + 1), Buffer.alloc(bytes.length)])(
  'SEC-003: altered image bytes are rejected',
  async (result) => {
    const store = fixture([file], [file], result);
    await expect(store.media.read(mediaId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  },
);
it.each([
  { second: [] },
  { second: [{ ...file, fileId: randomUUID() }] },
  { second: [{ ...file, objectKey: 'replaced/photo.png' }] },
  { second: [{ ...file, sha256: null }] },
  { second: [{ ...file, sha256: Buffer.alloc(32) }] },
  { second: [{ ...file, sha256: Buffer.alloc(2) }] },
  { second: [{ ...file, mimeType: 'image/jpeg' }] },
  { second: [{ ...file, sizeBytes: file.sizeBytes + 1n }] },
])(
  'SEC-003: revocation or metadata replacement during I/O fails closed with a typed response',
  async ({ second }) => {
    const store = fixture([file], second);
    await expect(store.media.read(mediaId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  },
);

it('ACC-002: public image checks city activation both before and after storage IO', async () => {
  const store = fixture();
  await store.media.read(mediaId);
  expect(store.predicates).toHaveLength(2);
  for (const predicate of store.predicates) {
    const query = new PgDialect().sqlToQuery(predicate.value);
    expect(query.sql).toContain('"cities"."is_active"');
    expect(query.params).toContain(true);
  }
});
