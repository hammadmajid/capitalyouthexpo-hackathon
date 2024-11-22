import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { residents, stays } from '@hsm/db';
import { residentDirectoryQuerySchema, DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { ResidentRepository } from './residents.repository.js';
import { residentService, ResidentService } from './residents.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const branch = '10000000-0000-4000-8000-000000000001',
  r1 = '20000000-0000-4000-8000-000000000001',
  r2 = '20000000-0000-4000-8000-000000000002',
  r3 = '20000000-0000-4000-8000-000000000003',
  stay = '30000000-0000-4000-8000-000000000001';
const actor = { userId: '40000000-0000-4000-8000-000000000001' } as never;
const now = new Date('2026-10-25T10:00:00Z');
const query = (value: unknown) => residentDirectoryQuerySchema.parse(value);
const current = {
  residentId: r1,
  id: stay,
  state: 'active',
  moveInDate: '2026-10-01',
  roomLabel: '101',
  bedLabel: 'A',
};
it('RES-004: one row per resident with current, former and none from batched Stay reads', async () => {
  const store = queryFixture();
  store.enqueue(residents, [
    { id: r1, displayName: 'Alpha', userId: null },
    { id: r2, displayName: 'Beta', userId: r2 },
    { id: r3, displayName: 'Gamma', userId: null },
  ]);
  store.enqueue(stays, [current, { ...current, id: r3 }], [{ residentId: r1 }, { residentId: r2 }]);
  const page = await new ResidentRepository(store.database, () => now).directory(
    actor,
    branch,
    query({ limit: 2 }),
  );
  expect(page.data.map((row) => [row.displayName, row.status, row.linked])).toEqual([
    ['Alpha', 'current', false],
    ['Beta', 'former', true],
  ]);
  expect(page.data[0]?.currentStay).toMatchObject({ id: stay, bedLabel: 'A' });
  expect(page.nextCursor).toBe(r2);
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branch, 'stay_manage');
  expect(store.writes).toHaveLength(0);
});
it.each([
  [{ status: 'current', linked: 'true', q: 'a%', sort: 'newest', cursor: r2 }],
  [{ status: 'former', linked: 'false' }],
  [{ status: 'none' }],
])('RES-004: filters and keysets compose for %j', async (value) => {
  const store = queryFixture();
  const page = await new ResidentRepository(store.database, () => now).directory(
    actor,
    branch,
    query(value),
  );
  expect(page).toEqual({ data: [], nextCursor: null });
  const predicate = store.predicates.at(-1);
  if (!predicate) throw new Error('Missing branch predicate');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toContain(branch);
});
it('RES-004: a name cursor must belong to this branch', async () => {
  const store = queryFixture();
  await expect(
    new ResidentRepository(store.database, () => now).directory(
      actor,
      branch,
      query({ cursor: r1 }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  const anchored = queryFixture();
  anchored.enqueue(residents, [{ name: 'Alpha' }], []);
  await expect(
    new ResidentRepository(anchored.database, () => now).directory(
      actor,
      branch,
      query({ cursor: r1 }),
    ),
  ).resolves.toEqual({ data: [], nextCursor: null });
});
it('RES-004 / CHG-009: profile shows contacts to staff, linkage as recorded and bounded Stays', async () => {
  const store = queryFixture();
  store.enqueue(residents, [
    {
      id: r1,
      branchId: branch,
      userId: null,
      displayName: 'Alpha',
      phone: '+923001234567',
      email: null,
      createdAt: now,
      archivedAt: null,
    },
  ]);
  store.enqueue(
    stays,
    Array.from({ length: 51 }, () => ({
      id: stay,
      source: 'manual',
      state: 'completed',
      moveInDate: '2026-10-01',
      expectedLeaveDate: null,
      closedAt: now,
    })),
    [],
  );
  const profile = await new ResidentRepository(store.database, () => now).profile(
    actor,
    branch,
    r1,
  );
  expect(profile).toMatchObject({
    linked: false,
    status: 'former',
    currentStay: null,
    contact: { phone: '+923001234567', email: null },
    staysTruncated: true,
  });
  expect(profile.stays).toHaveLength(50);
  await expect(
    new ResidentRepository(queryFixture().database, () => now).profile(actor, branch, r1),
  ).rejects.toMatchObject({ status: 404 });
  const broken = queryFixture();
  broken.enqueue(residents, [{ id: r1, branchId: branch, displayName: '', createdAt: now }]);
  await expect(
    new ResidentRepository(broken.database, () => now).profile(actor, branch, r1),
  ).rejects.toMatchObject({ status: 500 });
});
it('RES-004: the service validates input and builds the production repository', async () => {
  const service = residentService(queryFixture().database, () => now);
  expect(service).toBeInstanceOf(ResidentService);
  await expect(service.directory(actor, branch, {})).resolves.toEqual({
    data: [],
    nextCursor: null,
  });
  await expect(service.profile(actor, branch, 'bad')).rejects.toThrow();
  await expect(service.directory(actor, branch, { limit: 51 })).rejects.toThrow();
});

it('FIN-001 / ACC-002: billing filters require finance_view in addition to stay_manage', async () => {
  const f = queryFixture();
  vi.mocked(lockInventoryScope)
    .mockResolvedValueOnce(undefined as never)
    .mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'No finance access'));
  await expect(
    new ResidentRepository(f.database, () => now).directory(
      actor,
      branch,
      query({ billing: 'due' }),
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
