import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { roomTypes, rooms, seats } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { InventoryRepository } from './repository.js';
import { InventoryService } from './service.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { pageIds as ids, pageRoom, pageSeat } from '../../test/unit/inventory-pages.fixture.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    ownerId: actor.userId,
    organizationId: randomUUID(),
    brandId: randomUUID(),
    actorRole: 'manager',
  });
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: [],
    canConfigureManagers: false,
  });
});
it('ACC-004 / SEC-003: read-only Manager pages validate current actor, scoped assignment and actual permissions twice around reads', async () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database);
  expect(await repository.page(actor, ids.branch, 'room_types', { limit: 20 })).toEqual({
    branchId: ids.branch,
    permissions: [],
    canConfigureManagers: false,
    data: [],
    nextCursor: null,
  });
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, ids.branch, undefined);
  expect(inventoryPermissions).toHaveBeenCalledWith(store.transaction, actor, ids.branch, false);
});
it('ACC-004: room and bed pages dispatch the exact branch and parent within the same transaction', async () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database);
  store.enqueue(roomTypes, [{ id: ids.third }]);
  store.enqueue(rooms, [pageRoom()], [{ id: ids.third }]);
  store.enqueue(seats, [pageSeat()]);
  expect(
    (await repository.page(actor, ids.branch, 'rooms', { limit: 20 }, ids.third)).data[0]?.id,
  ).toBe(ids.first);
  expect(
    (await repository.page(actor, ids.branch, 'seats', { limit: 20 }, ids.third)).data[0]?.id,
  ).toBe(ids.first);
});
it('ACC-004: denied current scope stops before collection queries', async () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database);
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Unavailable'),
  );
  await expect(
    repository.page(actor, ids.branch, 'room_types', { limit: 20 }),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(store.predicates).toHaveLength(0);
  expect(inventoryPermissions).not.toHaveBeenCalled();
});
it('SEC-003: actor revocation detected after reads rejects the response', async () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database);
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  await expect(
    repository.page(actor, ids.branch, 'room_types', { limit: 20 }),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
});
it('ACC-004: inconsistent parent/collection combinations are not accepted internally', async () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database);
  await expect(repository.page(actor, ids.branch, 'rooms', { limit: 20 })).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  });
  await expect(
    repository.page(actor, ids.branch, 'room_types', { limit: 20 }, ids.third),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});
it('ACC-004: service revalidates canonical identifiers and strict paging before repository access', () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database),
    read = vi.spyOn(repository, 'page').mockResolvedValue({
      branchId: ids.branch,
      permissions: [],
      canConfigureManagers: false,
      data: [],
      nextCursor: null,
    });
  const service = new InventoryService(repository, {} as IdempotencyService);
  service.page(actor, ids.branch.toUpperCase(), 'room_types', {
    cursor: ids.first.toUpperCase(),
    limit: '1',
  });
  expect(read).toHaveBeenCalledWith(
    actor,
    ids.branch,
    'room_types',
    { cursor: ids.first, limit: 1 },
    undefined,
  );
  expect(() => service.page(actor, ids.branch, 'seats', {}, 'bad')).toThrow();
  expect(() => service.page(actor, ids.branch, 'rooms', { limit: 101 }, ids.third)).toThrow();
  expect(read).toHaveBeenCalledTimes(1);
});

it('ACC-004 / PERF: lightweight permissions never query physical inventory and remain current actor scoped', async () => {
  const store = queryFixture(),
    repository = new InventoryRepository(store.database);
  expect(await repository.access(actor, ids.branch)).toEqual({
    branchId: ids.branch,
    permissions: [],
    canConfigureManagers: false,
  });
  expect(store.predicates).toHaveLength(0);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, ids.branch, undefined);
  const service = new InventoryService(repository, {} as IdempotencyService);
  const read = vi
    .spyOn(repository, 'access')
    .mockResolvedValue({ branchId: ids.branch, permissions: [], canConfigureManagers: false });
  service.access(actor, ids.branch.toUpperCase());
  expect(read).toHaveBeenCalledWith(actor, ids.branch);
  expect(() => service.access(actor, ids.branch, { limit: 20 })).toThrow();
});
