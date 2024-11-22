import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { customerProfiles, visitRequests, lockInventoryBranch } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { publicBranch } from '../booking/projection.js';
import {
  authorizeVisitBranch,
  authorizeVisitCustomer,
  lockVisit,
  lockVisitListing,
} from './access.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  lockInventoryBranch: vi.fn(),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('../booking/projection.js', () => ({ publicBranch: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  visitId = randomUUID(),
  now = () => new Date('2026-10-22T03:00:00Z');
beforeEach(() => {
  vi.clearAllMocks();
});
it('VISIT-001 / SEC-003: Customer context is rechecked inside the protected transaction', async () => {
  const q = queryFixture();
  q.enqueue(customerProfiles, []);
  await expect(authorizeVisitCustomer(q.transaction, actor, now)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(lockActor).toHaveBeenCalledWith(q.transaction, actor, now);
  q.enqueue(customerProfiles, [{ id: actor.userId }]);
  await expect(authorizeVisitCustomer(q.transaction, actor, now)).resolves.toBeUndefined();
  const predicate = q.predicates.at(0);
  if (!predicate) throw new Error('Customer scope predicate missing');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toContain(actor.userId);
});
it('VISIT-001 / ACC-002: branch access uses existing live scope and rechecks sessions after locks', async () => {
  const q = queryFixture(),
    scope = {
      organizationId: randomUUID(),
      brandId: randomUUID(),
      ownerId: actor.userId,
      actorRole: 'owner',
    };
  vi.mocked(lockInventoryScope).mockResolvedValue(scope);
  expect(await authorizeVisitBranch(q.transaction, actor, branchId, now)).toEqual(scope);
  expect(lockInventoryScope).toHaveBeenCalledWith(q.transaction, actor, branchId);
  expect(lockActor).toHaveBeenCalledTimes(2);
});
it.each(['customer', 'branch'] as const)(
  'VISIT-001 / ACC-002/003: %s target scope is included before and after branch locking',
  async (kind) => {
    const q = queryFixture(),
      row = { id: visitId, branchId };
    q.enqueue(visitRequests, [{ branchId }], [row]);
    const scope = kind === 'customer' ? { customerUserId: actor.userId } : { branchId };
    expect(await lockVisit(q.transaction, visitId, scope)).toEqual(row);
    expect(lockInventoryBranch).toHaveBeenCalledWith(q.transaction, branchId);
    const queries = q.predicates.map((entry) => new PgDialect().sqlToQuery(entry.value));
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.params).toContain(visitId);
      expect(query.params).toContain(kind === 'customer' ? actor.userId : branchId);
    }
    expect(q.locks).toContainEqual({ table: visitRequests, mode: 'update' });
  },
);
it('VISIT-001 / ACC-003: unavailable or removed visits fail without disclosing a foreign row', async () => {
  const q = queryFixture();
  q.enqueue(visitRequests, []);
  await expect(
    lockVisit(q.transaction, visitId, { customerUserId: actor.userId }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(lockInventoryBranch).not.toHaveBeenCalled();
  q.enqueue(visitRequests, [{ branchId }], []);
  await expect(lockVisit(q.transaction, visitId, { branchId })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('VISIT-001: new requests recheck public eligibility after hierarchy locks', async () => {
  const q = queryFixture();
  vi.mocked(publicBranch).mockResolvedValueOnce({ id: branchId }).mockResolvedValueOnce(undefined);
  await expect(lockVisitListing(q.transaction, branchId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(lockInventoryBranch).toHaveBeenCalledWith(q.transaction, branchId);
  expect(publicBranch).toHaveBeenLastCalledWith(q.transaction, branchId, true);
});
