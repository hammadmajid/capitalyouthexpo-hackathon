import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bookings } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockParticipants } from '../management/identity-lock.js';
import { confirmationContext } from './confirmation-context.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('../management/identity-lock.js', () => ({ lockParticipants: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  bookingId = randomUUID(),
  branchId = randomUUID(),
  customerId = randomUUID();
const now = new Date('2026-10-16T00:00:00Z');
beforeEach(() => vi.resetAllMocks());
it('ACC-004 SEC-003: participant resolution checks live exact-branch permission before any Customer lookup', async () => {
  const store = queryFixture();
  store.enqueue(bookings, [{ customerUserId: customerId, privateAddress: 'must not escape' }]);
  const context = await confirmationContext(store.database, actor, bookingId, branchId, () => now);
  expect(context.customerUserId).toBe(customerId);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    'booking_manage',
  );
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Missing booking predicate');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([bookingId, branchId]);
  expect(store.writes).toHaveLength(0);
  await context.store.transaction(actor, now, async () => undefined);
  expect(lockParticipants).toHaveBeenCalledWith(
    store.transaction,
    actor,
    customerId,
    expect.any(Function),
  );
});
it('ACC-004: denied branch or missing grant prevents Customer resolution', async () => {
  const store = queryFixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Unavailable'),
  );
  await expect(
    confirmationContext(store.database, actor, bookingId, branchId, () => now),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(store.predicates).toHaveLength(0);
  expect(lockParticipants).not.toHaveBeenCalled();
});
it('SEC-003: session expiry after scope waiting prevents Customer lookup', async () => {
  const store = queryFixture();
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  await expect(
    confirmationContext(store.database, actor, bookingId, branchId, () => now),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(store.predicates).toHaveLength(0);
  expect(lockParticipants).not.toHaveBeenCalled();
});
it('ACC-004: missing or foreign-branch booking fails with an opaque 404', async () => {
  const store = queryFixture();
  await expect(
    confirmationContext(store.database, actor, bookingId, branchId, () => now),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
  expect(lockParticipants).not.toHaveBeenCalled();
});
