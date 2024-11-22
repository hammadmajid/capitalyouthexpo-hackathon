import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { RoomAmenitiesRepository } from './room-amenities.repository.js';
import { RoomAmenitiesService } from './room-amenities.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  roomTypeId = randomUUID(),
  version = 'a'.repeat(64),
  ifMatch = '"' + version + '"';
const result = { branchId, roomTypeId, version, canEdit: true, amenities: [] };
function fixture() {
  const query = queryFixture(),
    responses = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, response) => {
          responses.set(key, response);
        },
      }),
  };
  const repository = new RoomAmenitiesRepository(query.database);
  const authorize = vi.spyOn(repository, 'authorize').mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  const save = vi.spyOn(repository, 'save').mockImplementation(async (transaction) => {
    expect(requireTransaction()).toBe(transaction);
    return result;
  });
  const read = vi.spyOn(repository, 'read').mockResolvedValue(result);
  return {
    query,
    responses,
    authorize,
    save,
    read,
    service: new RoomAmenitiesService(repository, new IdempotencyService(store)),
  };
}
it('ROOM-002 / ACC-004: canonical selected codes bind one room command, transaction and reauthorized replay', async () => {
  const value = fixture(),
    key = randomUUID();
  expect(
    (
      await value.service.save(
        actor,
        key,
        branchId.toUpperCase(),
        roomTypeId.toUpperCase(),
        ifMatch,
        { amenityCodes: ['wifi', 'ac'] },
      )
    ).body,
  ).toEqual(result);
  expect(
    (
      await value.service.save(actor, key, branchId, roomTypeId, ifMatch, {
        amenityCodes: ['ac', 'wifi'],
      })
    ).replayed,
  ).toBe(true);
  expect(value.save).toHaveBeenCalledTimes(1);
  expect(value.save).toHaveBeenCalledWith(
    value.query.transaction,
    actor,
    branchId,
    roomTypeId,
    version,
    { amenityCodes: ['ac', 'wifi'] },
  );
  expect(value.authorize).toHaveBeenCalledTimes(2);
  value.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  await expect(
    value.service.save(actor, key, branchId, roomTypeId, ifMatch, { amenityCodes: ['wifi', 'ac'] }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.save).toHaveBeenCalledTimes(1);
});
it.each(['branch', 'room', 'version', 'selection'] as const)(
  'ACC-004: reusing the command key with changed %s cannot silently retarget',
  async (change) => {
    const value = fixture(),
      key = randomUUID();
    await value.service.save(actor, key, branchId, roomTypeId, ifMatch, { amenityCodes: [] });
    await expect(
      value.service.save(
        actor,
        key,
        change === 'branch' ? randomUUID() : branchId,
        change === 'room' ? randomUUID() : roomTypeId,
        change === 'version' ? '"' + 'b'.repeat(64) + '"' : ifMatch,
        { amenityCodes: change === 'selection' ? ['wifi'] : [] },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(value.save).toHaveBeenCalledTimes(1);
  },
);
it.each([undefined, '*', version, '"short"'])(
  'ROOM-002: invalid precondition %s fails before authorization or mutation',
  (header) => {
    const value = fixture();
    expect(() =>
      value.service.save(actor, randomUUID(), branchId, roomTypeId, header, { amenityCodes: [] }),
    ).toThrow();
    expect(value.authorize).not.toHaveBeenCalled();
    expect(value.save).not.toHaveBeenCalled();
  },
);
it('ROOM-002: strict selection rejects pricing fields before IO', () => {
  const value = fixture();
  expect(() =>
    value.service.save(actor, randomUUID(), branchId, roomTypeId, ifMatch, {
      amenityCodes: [],
      depositPaisa: 0,
    }),
  ).toThrow();
  expect(value.authorize).not.toHaveBeenCalled();
});
it('ACC-004: read normalizes exact scope and rejects guessed query parameters', async () => {
  const value = fixture();
  expect(await value.service.read(actor, branchId.toUpperCase(), roomTypeId.toUpperCase())).toEqual(
    result,
  );
  expect(value.read).toHaveBeenCalledWith(actor, branchId, roomTypeId);
  expect(() =>
    value.service.read(actor, branchId, roomTypeId, { branchId: randomUUID() }),
  ).toThrow();
});
it('ROOM-002: version conflict never records idempotent success', async () => {
  const value = fixture();
  value.save.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Changed'));
  await expect(
    value.service.save(actor, randomUUID(), branchId, roomTypeId, ifMatch, { amenityCodes: [] }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(value.responses.size).toBe(0);
});
