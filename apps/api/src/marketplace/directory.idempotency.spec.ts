import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { InstitutionRepository } from './directory.repository.js';
import { InstitutionService } from './directory.service.js';
function fixture() {
  const database = queryFixture(),
    rows = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: database.transaction,
        read: async (key) => rows.get(key),
        remove: async (key) => {
          rows.delete(key);
        },
        save: async (key, value) => {
          rows.set(key, value);
        },
      }),
  };
  const actor = { userId: randomUUID(), sessionId: randomUUID() },
    key = randomUUID(),
    id = randomUUID();
  const repository = new InstitutionRepository();
  const authorize = vi.spyOn(repository, 'authorize').mockResolvedValue(true);
  const result = { id, isActive: true, publicApproved: true };
  const save = vi.spyOn(repository, 'save').mockResolvedValue(result);
  const service = new InstitutionService(
    repository,
    new IdempotencyService(store, () => new Date('2026-10-15T10:00:00Z')),
  );
  const input = {
    name: 'Fixture university',
    changeReason: 'Verified institution directory entry',
    shortName: null,
    cityId: randomUUID(),
    areaId: null,
    aliases: [],
    address: null,
    latitude: 33.68,
    longitude: 73.04,
    isActive: true,
    publicApproved: true,
  };
  return {
    result,
    authorize,
    save,
    run: (placeId?: string) =>
      service.save(actor, key, placeId ? { ...input, expectedRevision: '0' } : input, placeId),
  };
}
it('ACC-002: institution creation works through real idempotency without an optional resource ID', async () => {
  const value = fixture();
  await expect(value.run()).resolves.toMatchObject({
    status: 201,
    replayed: false,
    body: value.result,
  });
  await expect(value.run()).resolves.toMatchObject({ status: 201, replayed: true });
  expect(value.save).toHaveBeenCalledTimes(1);
  value.authorize.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Root revoked'));
  await expect(value.run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.save).toHaveBeenCalledTimes(1);
});
it('ACC-002: institution updates retain explicit identity and their own replay status', async () => {
  const value = fixture();
  await expect(value.run(value.result.id)).resolves.toMatchObject({ status: 200, replayed: false });
  await expect(value.run(value.result.id)).resolves.toMatchObject({ status: 200, replayed: true });
  expect(value.save).toHaveBeenCalledTimes(1);
});
