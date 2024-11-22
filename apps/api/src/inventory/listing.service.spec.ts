import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { ListingRepository } from './listing.repository.js';
import { ListingService } from './listing.service.js';
import { projectListing } from './listing-state.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const fields = {
  description: 'Updated listing',
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
};
const input = { ...fields, amenityCodes: ['wifi'] },
  version = 'a'.repeat(64),
  ifMatch = '"' + version + '"';
const result = projectListing(
  branchId,
  { fields, selected: [{ code: 'wifi', name: 'Wi-Fi', isActive: true }] },
  true,
);
function fixture() {
  const query = queryFixture(),
    rows = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => rows.get(key),
        remove: async (key) => {
          rows.delete(key);
        },
        save: async (key, value) => {
          rows.set(key, value);
        },
      }),
  };
  const repository = new ListingRepository(query.database);
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
  const read = vi.spyOn(repository, 'read').mockResolvedValue(result),
    catalog = vi.spyOn(repository, 'catalog').mockResolvedValue({ data: [], nextCursor: null });
  return {
    rows,
    query,
    authorize,
    save,
    read,
    catalog,
    service: new ListingService(repository, new IdempotencyService(store)),
  };
}
it('TRUST-006 / ACC-004: private listing save uses the original version and one transaction, then reauthorizes replay', async () => {
  const value = fixture(),
    key = randomUUID();
  expect(
    (
      await value.service.save(actor, key, branchId, ifMatch, {
        ...input,
        description: ' Updated listing ',
      })
    ).body,
  ).toEqual(result);
  expect((await value.service.save(actor, key, branchId, ifMatch, input)).replayed).toBe(true);
  expect(value.save).toHaveBeenCalledTimes(1);
  expect(value.save).toHaveBeenCalledWith(value.query.transaction, actor, branchId, version, input);
  expect(value.authorize).toHaveBeenCalledTimes(2);
  expect(value.authorize).toHaveBeenCalledWith(
    value.query.transaction,
    actor,
    branchId,
    'listing_edit',
  );
  value.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  await expect(value.service.save(actor, key, branchId, ifMatch, input)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(value.save).toHaveBeenCalledTimes(1);
});
it.each(['version', 'body'] as const)(
  'SEC-003: the same key cannot silently change listing %s',
  async (change) => {
    const value = fixture(),
      key = randomUUID();
    await value.service.save(actor, key, branchId, ifMatch, input);
    await expect(
      value.service.save(
        actor,
        key,
        branchId,
        change === 'version' ? '"' + 'b'.repeat(64) + '"' : ifMatch,
        change === 'body' ? { ...input, description: 'Different' } : input,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(value.save).toHaveBeenCalledTimes(1);
  },
);
it('TRUST-006: version conflict propagates as documented 412 without recording a success response', async () => {
  const value = fixture();
  value.save.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Changed'));
  await expect(
    value.service.save(actor, randomUUID(), branchId, ifMatch, input),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', status: 412 });
  expect(value.rows.size).toBe(0);
});
it.each([undefined, '*', version, '"short"'])(
  'TRUST-006: missing or invalid If-Match cannot start a mutation (%s)',
  (header) => {
    const value = fixture();
    expect(() => value.service.save(actor, randomUUID(), branchId, header, input)).toThrow();
    expect(value.authorize).not.toHaveBeenCalled();
    expect(value.save).not.toHaveBeenCalled();
  },
);
it('SEC-003: invalid/extra branch configuration fields fail before authorization or writes', () => {
  const value = fixture();
  expect(() =>
    value.service.save(actor, randomUUID(), branchId, ifMatch, { ...input, category: 'boys' }),
  ).toThrow();
  expect(value.authorize).not.toHaveBeenCalled();
});
it('ACC-004: read normalizes the branch and rejects guessed extra query scope before IO', async () => {
  const value = fixture();
  expect(await value.service.read(actor, branchId.toUpperCase())).toEqual(result);
  expect(value.read).toHaveBeenCalledWith(actor, branchId);
  expect(() => value.service.read(actor, branchId, { customerId: actor.userId })).toThrow();
  expect(value.read).toHaveBeenCalledTimes(1);
  expect(value.rows.size).toBe(0);
});
it('ACC-002: public catalog uses a bounded actual cursor without an actor or write transaction', async () => {
  const value = fixture();
  expect(await value.service.catalog({ cursor: 'mess', limit: '10' })).toEqual({
    data: [],
    nextCursor: null,
  });
  expect(value.catalog).toHaveBeenCalledWith({ cursor: 'mess', limit: 10 });
  expect(() => value.service.catalog({ branchId })).toThrow();
  expect(value.authorize).not.toHaveBeenCalled();
  expect(value.rows.size).toBe(0);
});
