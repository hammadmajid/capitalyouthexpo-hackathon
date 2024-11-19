import { expect, it } from 'vitest';
import {
  galleryAttachSchema,
  galleryEditSchema,
  galleryArchiveSchema,
  galleryQuerySchema,
  galleryMediaSchema,
  galleryPageSchema,
} from './listing-gallery.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const media = {
  id,
  branchId: id,
  fileId: id,
  altText: 'Hostel exterior',
  sortOrder: 0,
  roomId: null,
  bedId: null,
  publishedAt: null,
  archivedAt: null,
  scanStatus: 'clean',
  version: 'a'.repeat(64),
};
it('ROOM-003 / ACC-002: attachment normalizes metadata and cannot implicitly publish', () => {
  expect(
    galleryAttachSchema.parse({ fileId: id.toUpperCase(), altText: ' Exterior ', sortOrder: 0 }),
  ).toEqual({ fileId: id, altText: 'Exterior', sortOrder: 0 });
  expect(
    galleryAttachSchema.safeParse({
      fileId: id,
      altText: 'Exterior',
      sortOrder: 0,
      published: true,
    }).success,
  ).toBe(false);
});
it.each([-1, 1.5, 2147483648])('ROOM-003: rejects unsupported image order %s', (sortOrder) => {
  expect(
    galleryAttachSchema.safeParse({ fileId: id, altText: 'Exterior', sortOrder }).success,
  ).toBe(false);
});
it('ROOM-003: image metadata edit requires an explicit publication choice and rejects file replacement', () => {
  expect(
    galleryEditSchema.parse({ altText: ' Exterior ', sortOrder: 1, published: false }),
  ).toEqual({ altText: 'Exterior', sortOrder: 1, published: false });
  expect(galleryEditSchema.safeParse({ altText: 'Exterior', sortOrder: 1 }).success).toBe(false);
  expect(
    galleryEditSchema.safeParse({ altText: 'Exterior', sortOrder: 1, published: true, fileId: id })
      .success,
  ).toBe(false);
});
it('AUD-001: image archival requires a bounded reason', () => {
  expect(galleryArchiveSchema.parse({ reason: ' Replaced image ' })).toEqual({
    reason: 'Replaced image',
  });
  for (const reason of ['', ' ', 'x'.repeat(501)])
    expect(galleryArchiveSchema.safeParse({ reason }).success).toBe(false);
});
it('ROOM-003: list pagination is bounded and archive state is explicit', () => {
  expect(galleryQuerySchema.parse({})).toEqual({ limit: 20, state: 'active' });
  expect(galleryQuerySchema.parse({ cursor: id, limit: '100', state: 'archived' })).toEqual({
    cursor: id,
    limit: 100,
    state: 'archived',
  });
  for (const input of [{ limit: 101 }, { state: 'deleted' }, { cursor: 'bad' }, { branchId: id }])
    expect(galleryQuerySchema.safeParse(input).success).toBe(false);
});
it('SEC-003: private gallery metadata exposes no storage keys, uploader identity or signed credentials', () => {
  expect(galleryMediaSchema.parse(media)).toEqual(media);
  for (const addition of [
    { objectKey: 'private/key' },
    { signedUrl: 'https://example.test/private' },
    { uploadedBy: id },
  ])
    expect(galleryMediaSchema.safeParse({ ...media, ...addition }).success).toBe(false);
  expect(
    galleryPageSchema.parse({ data: [media], nextCursor: null, canEdit: false, canPublish: false })
      .canEdit,
  ).toBe(false);
});
it('ROOM-003: private metadata retains actual publication/archive timestamps and scan revocation', () => {
  expect(
    galleryMediaSchema.parse({
      ...media,
      scanStatus: 'rejected',
      publishedAt: '2026-10-16T10:00:00.000Z',
      archivedAt: '2026-10-16T11:00:00.000Z',
    }).scanStatus,
  ).toBe('rejected');
  expect(galleryMediaSchema.safeParse({ ...media, version: 'bad' }).success).toBe(false);
});

it('ACC-004: publication capability is explicit, cannot exceed listing authority and defaults to no privilege when absent', () => {
  expect(galleryPageSchema.safeParse({ data: [], nextCursor: null, canEdit: true }).success).toBe(
    false,
  );
  expect(
    galleryPageSchema.safeParse({ data: [], nextCursor: null, canEdit: false, canPublish: true })
      .success,
  ).toBe(false);
  expect(
    galleryPageSchema.parse({ data: [], nextCursor: null, canEdit: true, canPublish: false })
      .canPublish,
  ).toBe(false);
});
it('ROOM-002/003: photo targets are closed, normalized and a bed always names its room', () => {
  const upper = id.toUpperCase();
  expect(
    galleryAttachSchema.parse({
      fileId: id,
      altText: 'Bed',
      sortOrder: 0,
      target: { kind: 'bed', roomId: upper, bedId: upper },
    }).target,
  ).toEqual({ kind: 'bed', roomId: id, bedId: id });
  for (const target of [
    { kind: 'bed', roomId: id },
    { kind: 'room' },
    { kind: 'room', roomId: id, bedId: id },
    { kind: 'hostel' },
  ])
    expect(
      galleryAttachSchema.safeParse({ fileId: id, altText: 'Bed', sortOrder: 0, target }).success,
    ).toBe(false);
  expect(galleryQuerySchema.parse({ roomId: id, bedId: id })).toMatchObject({
    roomId: id,
    bedId: id,
  });
  expect(galleryQuerySchema.safeParse({ bedId: id }).success).toBe(false);
  expect(galleryMediaSchema.safeParse({ ...media, roomId: id, bedId: id }).success).toBe(true);
  expect(galleryMediaSchema.safeParse({ ...media, roomId: undefined }).success).toBe(false);
});
