import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { managerInventoryGrants } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import { InventoryGrantRepository } from './grants.repository.js';
import { InventoryGrantReadRepository } from './grants-read.repository.js';
import { InventoryGrantReadService } from './grants-read.service.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  assignmentId = randomUUID();
beforeEach(() => {
  vi.clearAllMocks();
});
function fixture() {
  const store = queryFixture(),
    grants = new InventoryGrantRepository();
  const authorize = vi.spyOn(grants, 'authorize').mockResolvedValue(true);
  return {
    ...store,
    authorize,
    repository: new InventoryGrantReadRepository(store.database, grants),
  };
}
it('ACC-004: reads only persisted exact-assignment grants after Owner and fresh-session authorization', async () => {
  const store = fixture();
  store.enqueue(managerInventoryGrants, [
    { permission: 'listing_edit' },
    { permission: 'pricing_edit' },
  ]);
  expect(await store.repository.read(actor, branchId, assignmentId)).toEqual({
    branchId,
    assignmentId,
    permissions: ['listing_edit', 'pricing_edit'],
  });
  expect(store.authorize).toHaveBeenCalledWith(store.transaction, actor, branchId, assignmentId);
  expect(lockActor).toHaveBeenCalledTimes(3);
  expect(store.operations).toContainEqual({
    table: managerInventoryGrants,
    kind: 'limit',
    args: [9],
  });
  expect(store.writes).toHaveLength(0);
});
it('ACC-004: no extra grants is an actual empty permission set', async () => {
  const store = fixture();
  expect(await store.repository.read(actor, branchId, assignmentId)).toEqual({
    branchId,
    assignmentId,
    permissions: [],
  });
});
it('ACC-004: Manager and foreign-owner denial cannot read assignment permissions', async () => {
  const store = fixture();
  store.authorize.mockRejectedValue(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Owner scope required'),
  );
  await expect(store.repository.read(actor, branchId, assignmentId)).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  expect(store.predicates).toHaveLength(0);
});
it('SEC-003: session revoked while waiting for scope prevents reading any grants', async () => {
  const store = fixture();
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('UNAUTHENTICATED', 401, 'Session unavailable'));
  await expect(store.repository.read(actor, branchId, assignmentId)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED',
  });
  expect(store.predicates).toHaveLength(0);
});
it.each([
  { rows: Array.from({ length: 9 }, () => ({ permission: 'listing_edit' })) },
  { rows: [{ permission: 'listing_edit' }, { permission: 'listing_edit' }] },
  { rows: [{ permission: 'unknown_privilege' }] },
])('SEC-003: corrupt or oversized persisted grants fail closed %#', async ({ rows }) => {
  const store = fixture();
  store.enqueue(managerInventoryGrants, rows);
  await expect(store.repository.read(actor, branchId, assignmentId)).rejects.toThrow();
});
it('ACC-004: read service normalizes identities and rejects unsupported query fields', async () => {
  const store = fixture(),
    read = vi
      .spyOn(store.repository, 'read')
      .mockResolvedValue({ branchId, assignmentId, permissions: [] });
  const service = new InventoryGrantReadService(store.repository);
  await service.read(actor, branchId.toUpperCase(), assignmentId.toUpperCase(), {});
  expect(read).toHaveBeenCalledWith(actor, branchId, assignmentId);
  expect(() => service.read(actor, branchId, assignmentId, { userId: actor.userId })).toThrow();
  expect(() => service.read(actor, 'invalid', assignmentId, {})).toThrow();
  expect(read).toHaveBeenCalledTimes(1);
});
