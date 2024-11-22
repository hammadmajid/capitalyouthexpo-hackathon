import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { branches, branchAmenities, amenities } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { listingVersion } from './listing-state.js';
import { ListingRepository } from './listing.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  organizationId = randomUUID();
const fields = {
    description: null,
    nearbyLandmark: null,
    publicPhone: null,
    publicEmail: null,
    showPublicContact: false,
  },
  wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true },
  old = { code: 'retired', name: 'Retired amenity', isActive: false };
const now = new Date('2026-10-16T00:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId,
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: ['listing_edit'],
    canConfigureManagers: true,
  });
});
function setup(before = [wifi]) {
  const store = queryFixture(),
    audit = new AuditWriter();
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  store.enqueue(branches, [fields]);
  store.enqueue(branchAmenities, before);
  return {
    store,
    audit,
    repository: new ListingRepository(store.database, audit, () => now),
    version: listingVersion(branchId, fields, before, true),
  };
}
it('ACC-004: assigned read-only Managers receive actual fields and no edit authority', async () => {
  const value = setup();
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: [],
    canConfigureManagers: false,
  });
  expect(await value.repository.read(actor, branchId)).toMatchObject({
    branchId,
    ...fields,
    canEdit: false,
    amenities: [wifi],
  });
  expect(lockActor).toHaveBeenCalledTimes(3);
  expect(value.audit.hostel).not.toHaveBeenCalled();
});
it('TRUST-006: mismatched current version returns typed 412 before writes or audit', async () => {
  const value = setup();
  await expect(
    value.repository.save(value.store.transaction, actor, branchId, '0'.repeat(64), {
      ...fields,
      amenityCodes: [],
    }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', status: 412 });
  expect(value.store.writes).toEqual([]);
  expect(value.audit.hostel).not.toHaveBeenCalled();
});
it.each(['unknown', 'retired'])(
  'ACC-002: unapproved newly selected catalog code is rejected: %s',
  (kind) => {
    return (async () => {
      const value = setup();
      value.store.enqueue(amenities, kind === 'unknown' ? [] : [old]);
      await expect(
        value.repository.save(value.store.transaction, actor, branchId, value.version, {
          ...fields,
          amenityCodes: [kind === 'unknown' ? 'missing' : old.code],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(value.store.writes).toEqual([]);
      expect(value.audit.hostel).not.toHaveBeenCalled();
    })();
  },
);
it('ACC-004: permissions are checked again in the repository before reading private settings or writing', async () => {
  const value = setup();
  vi.mocked(lockInventoryScope).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  await expect(
    value.repository.save(value.store.transaction, actor, branchId, value.version, {
      ...fields,
      amenityCodes: [],
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.store.predicates).toEqual([]);
  expect(lockInventoryScope).toHaveBeenCalledWith(
    value.store.transaction,
    actor,
    branchId,
    'listing_edit',
  );
});
it('ACC-002 / SEC-003: explicit contact/amenity edits preserve unchanged retired selections and audit persisted state', async () => {
  const value = setup([wifi, old]),
    after = {
      ...fields,
      description: 'Updated listing',
      publicPhone: '+925112345678',
      showPublicContact: true,
    };
  value.store.enqueue(amenities, [old, wifi]);
  value.store.enqueue(branches, [], [after]);
  value.store.enqueue(branchAmenities, [], [], [old, wifi]);
  const result = await value.repository.save(
    value.store.transaction,
    actor,
    branchId,
    value.version,
    { ...after, amenityCodes: ['wifi', 'retired'] },
  );
  expect(result).toMatchObject({ ...after, canEdit: true, amenities: [old, wifi] });
  expect(result.version).not.toBe(value.version);
  expect(value.store.writes).toContainEqual({
    table: branches,
    kind: 'update',
    value: { ...after, updatedAt: now },
  });
  expect(value.store.writes).toContainEqual({
    table: branchAmenities,
    kind: 'insert',
    value: [
      { branchId, amenityCode: 'retired' },
      { branchId, amenityCode: 'wifi' },
    ],
  });
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({
      organizationId,
      branchId,
      actorUserId: actor.userId,
      action: 'listing.settings.changed',
      after: result,
    }),
  );
  expect(lockActor).toHaveBeenCalledTimes(4);
});
it('ACC-002: clearing explicitly selected amenities uses no empty IN query or invented replacement', async () => {
  const value = setup();
  value.store.enqueue(branches, [], [fields]);
  value.store.enqueue(branchAmenities, [], []);
  expect(
    await value.repository.save(value.store.transaction, actor, branchId, value.version, {
      ...fields,
      amenityCodes: [],
    }),
  ).toMatchObject({ amenities: [] });
  expect(value.store.locks.some((row) => row.table === amenities)).toBe(false);
  expect(
    value.store.writes.some((row) => row.table === branchAmenities && row.kind === 'insert'),
  ).toBe(false);
});
it('SEC-003: expiry during selected-catalog locking rejects before settings writes', async () => {
  const value = setup();
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Expired'));
  await expect(
    value.repository.save(value.store.transaction, actor, branchId, value.version, {
      ...fields,
      amenityCodes: [],
    }),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(value.store.writes).toEqual([]);
});
it('SEC-003: a late post-audit authority failure propagates to the caller transaction', async () => {
  const value = setup();
  value.store.enqueue(branches, [], [fields]);
  value.store.enqueue(branchAmenities, [], []);
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Expired'));
  await expect(
    value.repository.save(value.store.transaction, actor, branchId, value.version, {
      ...fields,
      amenityCodes: [],
    }),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(value.audit.hostel).toHaveBeenCalledTimes(1);
});
