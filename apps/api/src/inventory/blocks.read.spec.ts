import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { inventoryBlocks } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { InventoryBlockRepository } from './blocks.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  roomId = randomUUID(),
  seatId = randomUUID();
const now = new Date('2026-10-15T10:00:00Z');
const row = {
  id: randomUUID(),
  branchId,
  roomId,
  seatId: null,
  roomLabel: '101',
  bedLabel: null,
  moveInDate: '2026-11-01',
  moveOutDate: '2026-11-03',
  reason: 1,
  releasedAt: null,
  createdAt: now,
};
beforeEach(() => {
  vi.resetAllMocks();
});
it('ACC-004 / SEC-003: real Drizzle predicates scope history, labels and bounded cursor reads', async () => {
  const store = queryFixture(),
    cursor = randomUUID();
  store.enqueue(inventoryBlocks, [
    { ...row, createdByUserId: actor.userId, privateNote: 'Private operational note' },
    { ...row, id: randomUUID() },
  ]);
  const result = await new InventoryBlockRepository(store.database, undefined, () => now).read(
    actor,
    branchId,
    { limit: 1, state: 'unreleased', cursor },
  );
  expect(result.data).toHaveLength(1);
  expect(result.nextCursor).toBe(row.id);
  expect(result.data[0]).toMatchObject({
    roomLabel: '101',
    bedLabel: null,
    createdAt: now.toISOString(),
  });
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branchId);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(store.writes).toEqual([]);
  const predicate = store.predicates.find((entry) => entry.table === inventoryBlocks);
  if (!predicate) throw new Error('Block predicate missing');
  const sql = new PgDialect().sqlToQuery(predicate.value);
  expect(sql.params).toEqual([branchId, cursor]);
  expect(sql.sql).toContain('released_at');
  expect(sql.sql).toContain('is null');
  expect(store.operations.find((operation) => operation.kind === 'limit')?.args).toEqual([2]);
  for (const join of store.operations.filter(
    (operation) => operation.kind === 'innerJoin' || operation.kind === 'leftJoin',
  )) {
    const condition = join.args[1];
    if (!is(condition, SQL)) throw new Error('Scoped join SQL missing');
    expect(new PgDialect().sqlToQuery(condition).params).toEqual([branchId]);
  }
  expect(JSON.stringify(result)).not.toContain(actor.userId);
  expect(JSON.stringify(result)).not.toContain('Private operational note');
});
it.each(['released', 'all'] as const)(
  'ACC-004: %s history keeps archived target labels and release times',
  async (state) => {
    const store = queryFixture();
    store.enqueue(inventoryBlocks, [{ ...row, seatId, bedLabel: 'A', reason: 2, releasedAt: now }]);
    const result = await new InventoryBlockRepository(store.database, undefined, () => now).read(
      actor,
      branchId,
      { limit: 20, state },
    );
    expect(result.data[0]).toMatchObject({
      kind: 'maintenance',
      target: { kind: 'bed', roomId, bedId: seatId },
      bedLabel: 'A',
      releasedAt: now.toISOString(),
    });
    expect(result.nextCursor).toBeNull();
    const predicate = store.predicates.find((entry) => entry.table === inventoryBlocks);
    if (!predicate) throw new Error('Block predicate missing');
    const sql = new PgDialect().sqlToQuery(predicate.value).sql;
    if (state === 'released') expect(sql).toContain('is not null');
    else expect(sql).not.toContain('released_at');
  },
);
it('SEC-003 / ACC-004: denied scope never reads block history', async () => {
  const store = queryFixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Unavailable'),
  );
  await expect(
    new InventoryBlockRepository(store.database).read(actor, branchId, { limit: 20, state: 'all' }),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(store.predicates.filter((entry) => entry.table === inventoryBlocks)).toHaveLength(0);
  expect(store.writes).toEqual([]);
});
it('SEC-003: an expired session after the scope wait cannot read history', async () => {
  const store = queryFixture();
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  await expect(
    new InventoryBlockRepository(store.database).read(actor, branchId, { limit: 20, state: 'all' }),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(store.predicates.filter((entry) => entry.table === inventoryBlocks)).toHaveLength(0);
});
