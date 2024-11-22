import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { encodePublicGalleryCursor } from '@hsm/contracts';
import { projectPublicGallery, PublicGalleryRepository } from './gallery.repository.js';
import { PublicGalleryService } from './gallery.service.js';
import { readPublicGalleryRows } from './gallery-query.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
vi.mock('./gallery-query.js', () => ({ readPublicGalleryRows: vi.fn() }));
const branchId = randomUUID(),
  firstId = randomUUID(),
  secondId = randomUUID();
const photo = { branchId, id: firstId, altText: ' Published exterior ', sortOrder: 0 };
beforeEach(() => {
  vi.clearAllMocks();
});
it('ACC-002: an approved branch with no eligible photo remains a genuine empty gallery', () => {
  expect(
    projectPublicGallery(branchId, { limit: 20 }, [
      { branchId, id: null, altText: null, sortOrder: null },
    ]),
  ).toEqual({ branchId, data: [], nextCursor: null });
});
it('ACC-002: unavailable parent scope returns opaque not-found rather than a fake empty gallery', () => {
  expect(() => projectPublicGallery(branchId, { limit: 20 }, [])).toThrow(
    expect.objectContaining({ code: 'NOT_FOUND' }),
  );
});
it('ACC-002: a bounded continuation identifies the last returned actual photo and omits internal ordering fields', () => {
  const page = projectPublicGallery(branchId, { limit: 1 }, [
    photo,
    { ...photo, id: secondId, sortOrder: 4 },
  ]);
  expect(page).toEqual({
    branchId,
    data: [{ id: firstId, altText: 'Published exterior' }],
    nextCursor: encodePublicGalleryCursor(0, firstId),
  });
  expect(page.data[0]).not.toHaveProperty('sortOrder');
});
it('ACC-002: final pages never invent a continuation', () => {
  expect(projectPublicGallery(branchId, { limit: 20 }, [photo]).nextCursor).toBeNull();
});
it.each([
  { rows: [{ ...photo, branchId: randomUUID() }] },
  { rows: [{ ...photo, objectKey: 'private-object' }] },
  { rows: [{ ...photo, id: null }] },
  { rows: [{ ...photo, altText: null }] },
  { rows: [{ ...photo, sortOrder: null }] },
  { rows: [{ branchId, id: null, altText: null, sortOrder: 1 }] },
  { rows: [{ ...photo, sortOrder: -1 }] },
  { rows: [{ ...photo, altText: '' }] },
  { rows: [photo, photo] },
  { rows: null },
])(
  'SEC-003: malformed, private, cross-branch and duplicate source data fails closed %#',
  ({ rows }) => {
    expect(() => projectPublicGallery(branchId, { limit: 20 }, rows)).toThrow(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
  },
);
it('ACC-002: an oversized source result cannot be silently truncated outside its actual query bound', () => {
  expect(() =>
    projectPublicGallery(branchId, { limit: 1 }, [
      photo,
      { ...photo, id: secondId },
      { ...photo, id: randomUUID() },
    ]),
  ).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
});
it('ACC-002: read executes the scoped query in the caller database transaction', async () => {
  const store = queryFixture(),
    repository = new PublicGalleryRepository(store.database, 'private-fixture');
  vi.mocked(readPublicGalleryRows).mockResolvedValue([photo]);
  expect((await repository.read(branchId.toUpperCase(), { limit: 20 })).data).toEqual([
    { id: firstId, altText: 'Published exterior' },
  ]);
  expect(readPublicGalleryRows).toHaveBeenCalledWith(
    store.transaction,
    branchId,
    { limit: 20 },
    'private-fixture',
  );
});
it('SEC-003: service rejects unsupported query and invalid branch before database access', async () => {
  const store = queryFixture(),
    repository = new PublicGalleryRepository(store.database, 'private-fixture');
  const read = vi
    .spyOn(repository, 'read')
    .mockResolvedValue({ branchId, data: [], nextCursor: null });
  const service = new PublicGalleryService(repository);
  await service.read(branchId.toUpperCase(), { limit: '2' });
  expect(read).toHaveBeenCalledWith(branchId, { limit: 2 });
  expect(() => service.read(branchId, { includePrivate: true })).toThrow();
  expect(() => service.read('invalid', {})).toThrow();
  expect(read).toHaveBeenCalledTimes(1);
});
