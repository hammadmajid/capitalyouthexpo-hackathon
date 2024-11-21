import { verifiedKey } from '@hsm/files';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { files, listingMedia, rooms, seats } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import {
  projectGallery,
  readGalleryPage,
  readGalleryRow,
  type GalleryRow,
} from './gallery-state.js';
import { GalleryRepository } from './gallery.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
vi.mock('./gallery-state.js', async (original) => ({
  ...(await original<typeof import('./gallery-state.js')>()),
  readGalleryPage: vi.fn(),
  readGalleryRow: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  mediaId = randomUUID(),
  fileId = randomUUID(),
  now = new Date('2026-10-16T10:00:00Z');
const row: GalleryRow = {
  id: mediaId,
  fileId,
  branchId,
  altText: 'Exterior',
  sortOrder: 2,
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
const fields = { altText: row.altText, sortOrder: row.sortOrder },
  version = projectGallery(row).version;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: ['listing_edit'],
    canConfigureManagers: true,
  });
  vi.mocked(readGalleryRow).mockImplementation(async (_transaction, branch, id) => ({
    ...row,
    branchId: branch,
    id,
  }));
});
function setup() {
  const store = queryFixture(),
    audit = new AuditWriter();
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return {
    store,
    audit,
    repository: new GalleryRepository(store.database, 'private', audit, () => now),
  };
}
it('ACC-004: assigned gallery reads return actual edit authority without auditing a mutation', async () => {
  const value = setup();
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: [],
    canConfigureManagers: false,
  });
  vi.mocked(readGalleryPage).mockResolvedValue({
    data: [projectGallery(row)],
    nextCursor: null,
    canEdit: false,
    canPublish: false,
  });
  expect(
    await value.repository.read(actor, branchId, { state: 'active', limit: 20 }),
  ).toMatchObject({ canEdit: false, canPublish: false });
  expect(readGalleryPage).toHaveBeenCalledWith(
    value.store.transaction,
    branchId,
    'private',
    { state: 'active', limit: 20 },
    false,
    false,
  );
  expect(value.audit.hostel).not.toHaveBeenCalled();
});
it('SEC-003: branch permission denial precedes private image reads and all writes', async () => {
  const value = setup();
  vi.mocked(lockInventoryScope).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  await expect(
    value.repository.edit(value.store.transaction, actor, branchId, mediaId, version, {
      ...fields,
      published: true,
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(readGalleryRow).not.toHaveBeenCalled();
  expect(value.store.writes).toEqual([]);
});
it('SEC-003: another uploader or missing image cannot be attached', async () => {
  const value = setup();
  value.store.enqueue(files, []);
  await expect(
    value.repository.attach(value.store.transaction, actor, branchId, { ...fields, fileId }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(value.store.writes).toEqual([]);
});
it('SEC-003: unclean owned uploads cannot be attached', async () => {
  const value = setup();
  value.store.enqueue(files, [{ ...row, id: fileId, scanStatus: 'pending' }]);
  await expect(
    value.repository.attach(value.store.transaction, actor, branchId, { ...fields, fileId }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(value.store.writes).toEqual([]);
});
it('ROOM-003: active duplicate attachment is rejected under the branch lock', async () => {
  const value = setup();
  value.store.enqueue(files, [{ ...row, id: fileId }]);
  value.store.enqueue(listingMedia, [{ id: mediaId }]);
  await expect(
    value.repository.attach(value.store.transaction, actor, branchId, { ...fields, fileId }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(value.store.writes).toEqual([]);
});
it('ROOM-003: clean attachment creates an unpublished row and audits the persisted result', async () => {
  const value = setup();
  value.store.enqueue(files, [{ ...row, id: fileId }]);
  value.store.enqueue(listingMedia, []);
  const result = await value.repository.attach(value.store.transaction, actor, branchId, {
    ...fields,
    fileId,
  });
  expect(value.store.writes).toContainEqual({
    table: listingMedia,
    kind: 'insert',
    value: {
      id: result.id,
      branchId,
      fileId,
      ...fields,
      roomId: null,
      seatId: null,
      publishedAt: null,
      publishedByUserId: null,
      createdAt: now,
    },
  });
  expect(result.publishedAt).toBeNull();
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({ action: 'listing.image.attached', before: null, after: result }),
  );
});
it('ROOM-003: explicit publication uses the clean snapshot and same-transaction audit', async () => {
  const value = setup(),
    updated = { ...row, publishedAt: now, publishedByUserId: actor.userId };
  vi.mocked(readGalleryRow).mockResolvedValueOnce(row).mockResolvedValueOnce(updated);
  const result = await value.repository.edit(
    value.store.transaction,
    actor,
    branchId,
    mediaId,
    version,
    { ...fields, published: true },
  );
  expect(result.publishedAt).toBe(now.toISOString());
  expect(value.store.writes).toContainEqual({
    table: listingMedia,
    kind: 'update',
    value: { ...fields, publishedAt: now, publishedByUserId: actor.userId },
  });
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({ before: projectGallery(row), after: result }),
  );
});
it('ROOM-003: metadata edits preserve original publication attribution', async () => {
  const value = setup(),
    previous = { ...row, publishedAt: now, publishedByUserId: randomUUID() };
  vi.mocked(readGalleryRow).mockResolvedValue(previous);
  await value.repository.edit(
    value.store.transaction,
    actor,
    branchId,
    mediaId,
    projectGallery(previous).version,
    { ...fields, published: true },
  );
  expect(value.store.writes).toContainEqual({
    table: listingMedia,
    kind: 'update',
    value: { ...fields, publishedAt: now, publishedByUserId: previous.publishedByUserId },
  });
});
it('SEC-003: publication rejects a revoked scan while explicit unpublication remains possible', async () => {
  const value = setup(),
    rejected = {
      ...row,
      scanStatus: 'rejected' as const,
      publishedAt: now,
      publishedByUserId: actor.userId,
    };
  vi.mocked(readGalleryRow).mockResolvedValue(rejected);
  await expect(
    value.repository.edit(
      value.store.transaction,
      actor,
      branchId,
      mediaId,
      projectGallery(rejected).version,
      { ...fields, published: true },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(value.store.writes).toEqual([]);
  await value.repository.edit(
    value.store.transaction,
    actor,
    branchId,
    mediaId,
    projectGallery(rejected).version,
    { ...fields, published: false },
  );
  expect(value.store.writes).toContainEqual({
    table: listingMedia,
    kind: 'update',
    value: { ...fields, publishedAt: null, publishedByUserId: null },
  });
});
it('ROOM-003: stale versions and archived records deny new writes', async () => {
  const value = setup();
  await expect(
    value.repository.archive(
      value.store.transaction,
      actor,
      branchId,
      mediaId,
      '0'.repeat(64),
      'Replaced',
    ),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  const archived = { ...row, archivedAt: now };
  vi.mocked(readGalleryRow).mockResolvedValue(archived);
  await expect(
    value.repository.archive(
      value.store.transaction,
      actor,
      branchId,
      mediaId,
      projectGallery(archived).version,
      'Replaced',
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(value.store.writes).toEqual([]);
});
it('AUD-001: archival retains the record and audits the explicit reason', async () => {
  const value = setup();
  vi.mocked(readGalleryRow)
    .mockResolvedValueOnce(row)
    .mockResolvedValueOnce({ ...row, archivedAt: now });
  expect(
    (
      await value.repository.archive(
        value.store.transaction,
        actor,
        branchId,
        mediaId,
        version,
        'Replaced',
      )
    ).archivedAt,
  ).toBe(now.toISOString());
  expect(value.store.writes).toEqual([
    { table: listingMedia, kind: 'update', value: { archivedAt: now } },
  ]);
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({
      action: 'listing.image.archived',
      after: expect.objectContaining({ reason: 'Replaced' }),
    }),
  );
});
it.each([{ maximum: [] }, { maximum: [{ order: 10 }] }])(
  'ROOM-003: cover selection shifts other active images and never publishes implicitly',
  async ({ maximum }) => {
    const value = setup();
    value.store.enqueue(listingMedia, maximum);
    vi.mocked(readGalleryRow)
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, sortOrder: 0 });
    expect(
      await value.repository.cover(value.store.transaction, actor, branchId, mediaId, version),
    ).toMatchObject({ sortOrder: 0, publishedAt: null });
    expect(value.store.writes).toHaveLength(2);
    expect(value.store.writes[1]).toEqual({
      table: listingMedia,
      kind: 'update',
      value: { sortOrder: 0 },
    });
    expect(value.audit.hostel).toHaveBeenCalledWith(
      value.store.transaction,
      expect.objectContaining({
        action: 'listing.image.cover_selected',
        after: expect.objectContaining({ otherActiveImagesOrderDelta: 1 }),
      }),
    );
  },
);
it('ROOM-003: unsupported integer overflow is rejected before cover writes', async () => {
  const value = setup();
  value.store.enqueue(listingMedia, [{ order: 2147483647 }]);
  await expect(
    value.repository.cover(value.store.transaction, actor, branchId, mediaId, version),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(value.store.writes).toEqual([]);
});
it('SEC-003: actor rejection after a lock wait prevents image writes', async () => {
  const value = setup();
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Revoked'));
  await expect(
    value.repository.archive(
      value.store.transaction,
      actor,
      branchId,
      mediaId,
      version,
      'Replaced',
    ),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(value.store.writes).toEqual([]);
});

it.each([
  { permissions: [], edit: false, publish: false },
  { permissions: ['listing_edit'], edit: true, publish: false },
  { permissions: ['media_publish'], edit: false, publish: false },
  { permissions: ['listing_edit', 'media_publish'], edit: true, publish: true },
] as const)(
  'ACC-004: private gallery projects only the combined current publication capability %#',
  async ({ permissions, edit, publish }) => {
    const value = setup();
    vi.mocked(inventoryPermissions).mockResolvedValue({
      permissions: [...permissions],
      canConfigureManagers: false,
    });
    vi.mocked(readGalleryPage).mockResolvedValue({
      data: [],
      nextCursor: null,
      canEdit: edit,
      canPublish: publish,
    });
    await value.repository.read(actor, branchId, { state: 'active', limit: 20 });
    expect(readGalleryPage).toHaveBeenCalledWith(
      value.store.transaction,
      branchId,
      'private',
      { state: 'active', limit: 20 },
      edit,
      publish,
    );
  },
);
it('ROOM-002/003: bed photos bind the current room and bed of this branch, and missing targets fail closed', async () => {
  const roomId = randomUUID(),
    bedId = randomUUID(),
    target = { kind: 'bed' as const, roomId, bedId };
  const missing = setup();
  missing.store.enqueue(files, [{ ...row, id: fileId }]);
  missing.store.enqueue(rooms, []);
  await expect(
    missing.repository.attach(missing.store.transaction, actor, branchId, {
      ...fields,
      fileId,
      target,
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const absentBed = setup();
  absentBed.store.enqueue(files, [{ ...row, id: fileId }]);
  absentBed.store.enqueue(rooms, [{ id: roomId }]);
  absentBed.store.enqueue(seats, []);
  await expect(
    absentBed.repository.attach(absentBed.store.transaction, actor, branchId, {
      ...fields,
      fileId,
      target,
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(missing.store.writes).toEqual([]);
  expect(absentBed.store.writes).toEqual([]);
  const value = setup();
  value.store.enqueue(files, [{ ...row, id: fileId }]);
  value.store.enqueue(rooms, [{ id: roomId }]);
  value.store.enqueue(seats, [{ id: bedId }]);
  value.store.enqueue(listingMedia, []);
  vi.mocked(readGalleryRow).mockResolvedValueOnce({ ...row, roomId, seatId: bedId });
  const result = await value.repository.attach(value.store.transaction, actor, branchId, {
    ...fields,
    fileId,
    target,
  });
  expect(result).toMatchObject({ roomId, bedId });
  expect(value.store.writes).toContainEqual(
    expect.objectContaining({
      table: listingMedia,
      kind: 'insert',
      value: expect.objectContaining({ roomId, seatId: bedId }),
    }),
  );
  expect(value.store.locks).toContainEqual({ table: rooms, mode: 'share' });
  expect(value.store.locks).toContainEqual({ table: seats, mode: 'share' });
});
