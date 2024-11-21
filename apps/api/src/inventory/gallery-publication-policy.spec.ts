import { verifiedKey } from '@hsm/files';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { hostelAuditLog, listingMedia } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { projectGallery, readGalleryRow, type GalleryRow } from './gallery-state.js';
import { GalleryRepository } from './gallery.repository.js';
import { GalleryService } from './gallery.service.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./gallery-state.js', async (original) => ({
  ...(await original<typeof import('./gallery-state.js')>()),
  readGalleryRow: vi.fn(),
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  mediaId = randomUUID(),
  fileId = randomUUID(),
  now = new Date('2026-10-17T00:00:00Z');
const row: GalleryRow = {
  id: mediaId,
  branchId,
  fileId,
  altText: 'Exterior',
  sortOrder: 0,
  roomId: null,
  seatId: null,
  publishedAt: null,
  publishedByUserId: null,
  archivedAt: null,
  createdAt: now,
  objectKey: verifiedKey('listing_photo', fileId),
  sha256: Buffer.alloc(32, 1),
  mimeType: 'image/png',
  sizeBytes: 100n,
  scanStatus: 'clean',
};
let denyPublication = false;
beforeEach(() => {
  vi.resetAllMocks();
  denyPublication = false;
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockInventoryScope).mockImplementation(
    async (_database, _actor, _branch, permission) => {
      if (permission === 'media_publish' && denyPublication)
        throw new DomainError('FORBIDDEN', 403, 'Media publication permission required');
      return {
        organizationId: randomUUID(),
        brandId: randomUUID(),
        ownerId: randomUUID(),
        actorRole: 'manager' as const,
      };
    },
  );
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  vi.mocked(readGalleryRow).mockImplementation(async () => {
    const value = store.writes.find(
      (entry) => entry.table === listingMedia && entry.kind === 'update',
    )?.value;
    const published = Boolean(
      value && typeof value === 'object' && Reflect.get(value, 'publishedAt'),
    );
    return {
      ...row,
      publishedAt: published ? now : null,
      publishedByUserId: published ? actor.userId : null,
    };
  });
  const repository = new GalleryRepository(store.database, 'private', audit, () => now),
    responses = new Map<string, StoredResponse>();
  const idempotencyStore: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: store.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, value) => {
          responses.set(key, value);
        },
      }),
  };
  return {
    store,
    audit,
    repository,
    service: new GalleryService(repository, new IdempotencyService(idempotencyStore)),
  };
}
it('ACC-004 / SEC-003: listing-edit alone cannot publish a Manager image without the existing media-publication grant', async () => {
  const value = fixture();
  denyPublication = true;
  await expect(
    value.repository.edit(
      value.store.transaction,
      actor,
      branchId,
      mediaId,
      projectGallery(row).version,
      { altText: row.altText, sortOrder: 0, published: true },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.store.writes).toHaveLength(0);
  expect(value.audit.hostel).not.toHaveBeenCalled();
});
it('ACC-004 / SEC-003: revoking media publication permission defeats a stored successful publication replay', async () => {
  const value = fixture(),
    key = randomUUID(),
    version = '"' + projectGallery(row).version + '"',
    body = { altText: row.altText, sortOrder: 0, published: true };
  const first = await value.service.edit(actor, key, branchId, mediaId, version, body);
  expect(first.replayed).toBe(false);
  expect(first.body.publishedAt).not.toBeNull();
  const writes = value.store.writes.length;
  denyPublication = true;
  await expect(
    value.service.edit(actor, key, branchId, mediaId, version, body),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.store.writes).toHaveLength(writes);
  expect(value.audit.hostel).toHaveBeenCalledTimes(1);
});

it('ACC-004 / SEC-003: unpublication replay still requires the original media grant after the image becomes private', async () => {
  const value = fixture(),
    key = randomUUID();
  const initial = { ...row, publishedAt: now, publishedByUserId: actor.userId };
  vi.mocked(readGalleryRow).mockImplementation(async () => {
    const changed = value.store.writes.some(
      (entry) => entry.table === listingMedia && entry.kind === 'update',
    );
    return {
      ...row,
      publishedAt: changed ? null : now,
      publishedByUserId: changed ? null : actor.userId,
    };
  });
  const version = '"' + projectGallery(initial).version + '"',
    body = { altText: row.altText, sortOrder: 0, published: false };
  const first = await value.service.edit(actor, key, branchId, mediaId, version, body);
  expect(first.replayed).toBe(false);
  expect(first.body.publishedAt).toBeNull();
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({
      action: 'listing.image.changed',
      before: expect.objectContaining({
        version: projectGallery(initial).version,
        publishedAt: now.toISOString(),
      }),
    }),
  );
  // The real writer commits this immutable before-image with the command. The unit query double needs the persisted lookup row explicitly.
  value.store.enqueue(hostelAuditLog, [{ id: randomUUID() }]);
  const writes = value.store.writes.length;
  denyPublication = true;
  await expect(
    value.service.edit(actor, key, branchId, mediaId, version, body),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.store.writes).toHaveLength(writes);
  expect(value.audit.hostel).toHaveBeenCalledTimes(1);
});

it('ACC-004: a private metadata edit and its identical replay remain available with listing authority alone', async () => {
  const value = fixture(),
    key = randomUUID(),
    version = '"' + projectGallery(row).version + '"';
  denyPublication = true;
  vi.mocked(readGalleryRow).mockImplementation(async () => ({
    ...row,
    altText: value.store.writes.some(
      (entry) => entry.table === listingMedia && entry.kind === 'update',
    )
      ? 'Private metadata change'
      : row.altText,
  }));
  const body = { altText: 'Private metadata change', sortOrder: 0, published: false };
  const first = await value.service.edit(actor, key, branchId, mediaId, version, body);
  expect(first.body).toMatchObject({ altText: body.altText, publishedAt: null });
  expect((await value.service.edit(actor, key, branchId, mediaId, version, body)).replayed).toBe(
    true,
  );
  expect(
    value.store.writes.filter((entry) => entry.table === listingMedia && entry.kind === 'update'),
  ).toHaveLength(1);
  expect(value.audit.hostel).toHaveBeenCalledTimes(1);
});
