import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  decodePublicGalleryCursor,
  encodePublicGalleryCursor,
  publicGalleryCursorSchema,
  publicGalleryPageSchema,
  publicGalleryQuerySchema,
} from './public-gallery.js';
const branchId = randomUUID(),
  mediaId = randomUUID();
it('ACC-002: public gallery paging has explicit finite defaults and canonical order/identity continuation', () => {
  expect(publicGalleryQuerySchema.parse({})).toEqual({ limit: 20 });
  const cursor = encodePublicGalleryCursor(2147483647, mediaId.toUpperCase());
  expect(cursor).toBe('2147483647:' + mediaId);
  expect(decodePublicGalleryCursor(cursor)).toEqual({ sortOrder: 2147483647, id: mediaId });
  expect(decodePublicGalleryCursor(encodePublicGalleryCursor(0, mediaId))).toEqual({
    sortOrder: 0,
    id: mediaId,
  });
  expect(publicGalleryQuerySchema.parse({ limit: '100', cursor })).toEqual({ limit: 100, cursor });
});
it.each([
  { input: '-1:' + mediaId },
  { input: '01:' + mediaId },
  { input: '2147483648:' + mediaId },
  { input: '99999999999:' + mediaId },
  { input: '0:invalid' },
  { input: '0:' + 'x'.repeat(36) },
  { input: '1.5:' + mediaId },
  { input: '0:' + mediaId + '&includePrivate=true' },
])('SEC-003: malformed, unsafe or oversized public continuations fail closed %#', ({ input }) => {
  expect(publicGalleryCursorSchema.safeParse(input).success).toBe(false);
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { limit: 1.5 },
  { limit: 'unlimited' },
  { includePrivate: true },
  { state: 'archived' },
])('ACC-002: public requests cannot expand bounds or select private history %#', (input) => {
  expect(publicGalleryQuerySchema.safeParse(input).success).toBe(false);
});
it('ACC-002: an actual approved empty gallery carries no invented photo or continuation', () => {
  expect(
    publicGalleryPageSchema.parse({ branchId: branchId.toUpperCase(), data: [], nextCursor: null }),
  ).toEqual({ branchId, data: [], nextCursor: null });
});
it('ACC-002: actual public image metadata and continuation remain explicit', () => {
  const data = [{ id: mediaId, altText: 'Published exterior' }],
    nextCursor = encodePublicGalleryCursor(4, mediaId);
  expect(publicGalleryPageSchema.parse({ branchId, data, nextCursor })).toEqual({
    branchId,
    data,
    nextCursor,
  });
});
it.each([
  { data: [{ id: mediaId, altText: 'Published exterior', fileId: randomUUID() }] },
  { data: [{ id: mediaId, altText: 'Published exterior', objectKey: 'private-object' }] },
  {
    data: [
      { id: mediaId, altText: 'Published exterior' },
      { id: mediaId, altText: 'Duplicate' },
    ],
  },
  { data: Array.from({ length: 101 }, () => ({ id: randomUUID(), altText: 'Published' })) },
  { ownerUserId: randomUUID() },
  { nextCursor: 'invalid' },
  { nextCursor: encodePublicGalleryCursor(0, mediaId) },
  {
    data: [{ id: mediaId, altText: 'Published' }],
    nextCursor: encodePublicGalleryCursor(0, randomUUID()),
  },
  { data: [{ id: mediaId, altText: '' }] },
  { data: [{ id: mediaId, altText: 'x'.repeat(241) }] },
])(
  'SEC-003: private, duplicate, malformed and oversized public responses are rejected %#',
  (change) => {
    expect(
      publicGalleryPageSchema.safeParse({ branchId, data: [], nextCursor: null, ...change })
        .success,
    ).toBe(false);
  },
);
