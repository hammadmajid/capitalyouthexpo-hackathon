import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError, roomTypeInputSchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { InventoryRepository } from './repository.js';
import { InventoryService } from './service.js';
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
    branchId = randomUUID(),
    id = randomUUID();
  const repository = new InventoryRepository(database.database);
  const authorize = vi.spyOn(repository, 'authorize').mockResolvedValue({
    ownerId: actor.userId,
    organizationId: randomUUID(),
    brandId: randomUUID(),
    actorRole: 'owner',
  });
  const summary = { id, branchId, kind: 'room_type' as const };
  const create = vi.spyOn(repository, 'roomType').mockResolvedValue(summary);
  const service = new InventoryService(
    repository,
    new IdempotencyService(store, () => new Date('2026-10-15T10:00:00Z')),
  );
  const key = randomUUID(),
    input = roomTypeInputSchema.parse({
      name: 'Two beds',
      capacity: 2,
      inventoryMode: 'both',
      bedMonthlyRentPaisa: 1800001,
      roomMonthlyRentPaisa: 3200000,
      depositPaisa: 0,
      fees: [],
    });
  return {
    actor,
    branchId,
    key,
    repository,
    service,
    transaction: database.transaction,
    authorize,
    create,
    summary,
    run: (typeId?: string) => service.roomType(actor, key, branchId, input, typeId),
  };
}
it('BKG-003 / ACC-004: creating a room type can commit and replay through the real idempotency service', async () => {
  const value = fixture();
  await expect(value.run()).resolves.toMatchObject({ replayed: false, body: value.summary });
  await expect(value.run()).resolves.toMatchObject({ replayed: true });
  expect(value.create).toHaveBeenCalledTimes(1);
  expect(value.authorize).toHaveBeenCalledTimes(4);
  value.authorize.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Grant revoked'));
  await expect(value.run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(value.create).toHaveBeenCalledTimes(1);
});
it('BKG-004: room type editing retains explicit identity in the command and works with replay', async () => {
  const value = fixture();
  await expect(value.run(value.summary.id)).resolves.toMatchObject({ replayed: false });
  await expect(value.run(value.summary.id)).resolves.toMatchObject({ replayed: true });
  expect(value.create).toHaveBeenCalledTimes(1);
});

it.each(['room', 'seat'] as const)(
  'PROP-002 / ACC-004: %s status commands validate, commit and replay',
  async (kind) => {
    const value = fixture(),
      result = { ...value.summary, kind };
    const state = vi.spyOn(value.repository, 'state').mockResolvedValue(result);
    const run = () =>
      value.service.state(value.actor, value.key, value.branchId, kind, result.id, {
        status: 'maintenance',
        reason: ' Scheduled work ',
      });
    await expect(run()).resolves.toMatchObject({ replayed: false, body: result });
    await expect(run()).resolves.toMatchObject({ replayed: true });
    expect(state).toHaveBeenCalledExactlyOnceWith(
      value.transaction,
      value.actor,
      value.branchId,
      { id: result.id, kind },
      'maintenance',
      'Scheduled work',
    );
  },
);
it.each(['room', 'seat', 'room_type'] as const)(
  'PROP-002: %s archival retains its command identity and live grant checks',
  async (kind) => {
    const value = fixture(),
      result = { ...value.summary, kind };
    const archive = vi.spyOn(value.repository, 'archive').mockResolvedValue(result);
    const run = () =>
      value.service.archive(value.actor, value.key, value.branchId, kind, result.id, {
        reason: ' Retired ',
      });
    await expect(run()).resolves.toMatchObject({ replayed: false, body: result });
    await expect(run()).resolves.toMatchObject({ replayed: true });
    expect(archive).toHaveBeenCalledExactlyOnceWith(
      value.transaction,
      value.actor,
      value.branchId,
      { id: result.id, kind },
      'Retired',
    );
    expect(value.authorize).toHaveBeenCalledTimes(kind === 'room_type' ? 4 : 2);
  },
);

it('SEC-003: unsupported statuses and force-archive bypass flags fail before authorization or work', () => {
  const value = fixture();
  expect(() =>
    value.service.state(value.actor, value.key, value.branchId, 'room', value.summary.id, {
      status: 'paid',
      reason: 'Unsupported',
    }),
  ).toThrow();
  expect(() =>
    value.service.archive(value.actor, value.key, value.branchId, 'room', value.summary.id, {
      reason: 'Retired',
      force: true,
    }),
  ).toThrow();
  expect(value.authorize).not.toHaveBeenCalled();
});
