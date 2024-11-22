import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays } from '@hsm/db';
import { DomainError, stayReadQuerySchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  stayReadActor as actor,
  stayReadIds as ids,
  stayReadRow,
  stayReadNow as now,
} from '../../test/unit/stay-read.fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { StayReadRepository } from './read.repository.js';
import { staffStayFilter } from './read-query.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it.each(['staff', 'customer'] as const)(
  'RES-001/002: %s page uses exact continuation with one bounded query and no financial tables',
  async (kind) => {
    const store = queryFixture(),
      first = stayReadRow(),
      second = stayReadRow();
    second.stay.id = ids.next;
    if (second.assignment) second.assignment.stayId = ids.next;
    store.enqueue(stays, [first, second]);
    const repository = new StayReadRepository(store.database, () => now),
      page =
        kind === 'staff'
          ? await repository.staffPage(actor, ids.branch, { limit: 1 })
          : await repository.customerPage(actor, { limit: 1 });
    expect(page.data).toHaveLength(1);
    expect(page.nextCursor).toBe(ids.stay);
    expect(store.operations).toContainEqual({ table: stays, kind: 'limit', args: [2] });
    expect(store.writes).toHaveLength(0);
    const predicate = store.predicates[0];
    expect(predicate).toBeDefined();
    if (!predicate) throw new Error('Missing scoped predicate');
    const sql = new PgDialect().sqlToQuery(predicate.value);
    expect(sql.params).toContain(kind === 'staff' ? ids.branch : actor.userId);
    if (kind === 'staff') {
      expect(lockInventoryScope).toHaveBeenCalledWith(
        store.transaction,
        actor,
        ids.branch,
        'stay_manage',
      );
      expect(lockActor).toHaveBeenCalledTimes(2);
    } else {
      expect(lockInventoryScope).not.toHaveBeenCalled();
      expect(lockActor).toHaveBeenCalledTimes(1);
    }
  },
);
it.each(['staff', 'customer'] as const)(
  'RES-001: empty %s page returns honest absence',
  async (kind) => {
    const repository = new StayReadRepository(queryFixture().database);
    const page =
      kind === 'staff'
        ? await repository.staffPage(actor, ids.branch, { limit: 20 })
        : await repository.customerPage(actor, { limit: 20 });
    expect(page).toEqual({ data: [], nextCursor: null });
  },
);
it.each(['staff', 'customer'] as const)(
  'ACC-004: %s detail binds exact Stay and scope, including private contact',
  async (kind) => {
    const store = queryFixture();
    store.enqueue(stays, [stayReadRow()]);
    const repository = new StayReadRepository(store.database),
      detail =
        kind === 'staff'
          ? await repository.staffDetail(actor, ids.branch, ids.stay)
          : await repository.customerDetail(actor, ids.stay);
    expect(detail.id).toBe(ids.stay);
    expect(detail.contact.phone).toBe('+923001234567');
    const predicate = store.predicates[0];
    if (!predicate) throw new Error('Missing scoped predicate');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([
      kind === 'staff' ? ids.branch : actor.userId,
      ids.stay,
    ]);
  },
);
it.each(['staff', 'customer'] as const)(
  'ACC-004: missing %s detail returns NOT_FOUND',
  async (kind) => {
    const repository = new StayReadRepository(queryFixture().database);
    await expect(
      kind === 'staff'
        ? repository.staffDetail(actor, ids.branch, ids.stay)
        : repository.customerDetail(actor, ids.stay),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  },
);
it.each(['staffPage', 'customerPage', 'staffDetail', 'customerDetail'] as const)(
  'ACC-004: %s rejects a mis-scoped internal row',
  async (kind) => {
    const store = queryFixture(),
      row = stayReadRow();
    row.stay.branchId = randomUUID();
    row.stay.userId = randomUUID();
    store.enqueue(stays, [row]);
    const repository = new StayReadRepository(store.database);
    const work =
      kind === 'staffPage'
        ? repository.staffPage(actor, ids.branch, { limit: 20 })
        : kind === 'customerPage'
          ? repository.customerPage(actor, { limit: 20 })
          : kind === 'staffDetail'
            ? repository.staffDetail(actor, ids.branch, ids.stay)
            : repository.customerDetail(actor, ids.stay);
    await expect(work).rejects.toMatchObject({ code: 'INTERNAL' });
  },
);
it.each(['staff', 'customer'] as const)(
  'ACC-004: %s detail rejects a different Stay even in the same scope',
  async (kind) => {
    const store = queryFixture(),
      row = stayReadRow();
    row.stay.id = ids.next;
    store.enqueue(stays, [row]);
    const repository = new StayReadRepository(store.database);
    await expect(
      kind === 'staff'
        ? repository.staffDetail(actor, ids.branch, ids.stay)
        : repository.customerDetail(actor, ids.stay),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  },
);
it('ACC-004: revoked Manager permission stops both staff reads before fetching residents', async () => {
  const store = queryFixture(),
    repository = new StayReadRepository(store.database);
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('FORBIDDEN', 403, 'Permission unavailable'),
  );
  await expect(repository.staffPage(actor, ids.branch, { limit: 20 })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(repository.staffDetail(actor, ids.branch, ids.stay)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(store.predicates).toHaveLength(0);
});
it('SEC-003: revoked session stops private Customer reads before fetching residents', async () => {
  const store = queryFixture(),
    repository = new StayReadRepository(store.database);
  vi.mocked(lockActor).mockRejectedValue(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  await expect(repository.customerPage(actor, { limit: 20 })).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  await expect(repository.customerDetail(actor, ids.stay)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect(store.predicates).toHaveLength(0);
});
it('RES-002 / SEC-003: all directory filters are parameterized and name wildcards are literal', () => {
  const query = stayReadQuerySchema.parse({
    cursor: ids.stay,
    state: 'active',
    q: '%_Name',
    roomId: ids.room,
    bedId: ids.bed,
    moveInFrom: '2028-01-01',
    moveInTo: '2028-02-01',
    expectedLeaveFrom: '2028-03-01',
    expectedLeaveTo: '2028-04-01',
  });
  const filter = staffStayFilter(query);
  if (!filter) throw new Error('Missing filter');
  const sql = new PgDialect().sqlToQuery(filter);
  expect(sql.params).toEqual([
    ids.stay,
    'active',
    '%\\%\\_Name%',
    ids.room,
    ids.bed,
    '2028-01-01',
    '2028-02-01',
    '2028-03-01',
    '2028-04-01',
  ]);
  expect(sql.sql).not.toContain('Name');
});
