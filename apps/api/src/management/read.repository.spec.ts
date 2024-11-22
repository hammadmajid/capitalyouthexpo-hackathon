import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { ManagementReadRepository } from './read.repository.js';
const mocks = vi.hoisted(() => ({ lock: vi.fn(), owner: vi.fn(), branch: vi.fn() }));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: mocks.lock }));
vi.mock('../authorization/repository.js', () => ({
  ScopeRepository: class {
    owner = mocks.owner;
    branch = mocks.branch;
  },
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  id = randomUUID();
let results: unknown[][];
function query() {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (data: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(resolve, reject),
  };
  for (const method of ['from', 'where', 'innerJoin', 'orderBy'] as const)
    chain[method].mockReturnValue(chain);
  chain.limit.mockImplementation(() => Promise.resolve(results.shift() ?? []));
  return chain;
}
const database = { select: vi.fn(() => query()), transaction: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue(true);
  mocks.branch.mockResolvedValue(true);
  mocks.lock.mockResolvedValue(undefined);
  results = [[{ id }]];
  database.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work(database),
  );
});
const repository = (clock: () => Date = () => new Date()) =>
  new ManagementReadRepository(database as unknown as Database, clock);
it.each([undefined, id])(
  'BRN-001: organizations recheck owner and honor bounded cursor %s',
  async (cursor) => {
    expect(
      await repository().organizations(actor, { limit: 20, ...(cursor ? { cursor } : {}) }),
    ).toEqual([{ id }]);
    expect(mocks.lock).toHaveBeenCalledWith(database, actor, expect.any(Function));
    expect(mocks.owner).toHaveBeenCalledWith(actor.userId);
  },
);
it('SEC-001: lost owner capability rejects organization reads', async () => {
  mocks.owner.mockResolvedValue(false);
  await expect(repository().organizations(actor, { limit: 20 })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(database.select).not.toHaveBeenCalled();
});
it.each([true, false])(
  'BRN-002: branch listing rechecks scoped ownership or live assignment, ownerOnly=%s',
  async (ownerOnly) => {
    expect(await repository().branches(actor, { limit: 20 }, ownerOnly)).toEqual([{ id }]);
    expect(mocks.owner).toHaveBeenCalledTimes(ownerOnly ? 1 : 0);
  },
);
it('BRN-002: branch cursor remains inside the authorized scope', async () => {
  expect(await repository().branches(actor, { cursor: id, limit: 1 }, true)).toEqual([{ id }]);
});
it('SEC-001: lost owner authority rejects owned branch listing', async () => {
  mocks.owner.mockResolvedValue(false);
  await expect(repository().branches(actor, { limit: 20 }, true)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});
it('SEC-001: branch lookup rechecks live scope inside the identity transaction', async () => {
  expect(await repository().branch(actor, id)).toEqual({ id });
  expect(mocks.branch).toHaveBeenCalledWith(actor.userId, id, false);
});
it('SEC-001: foreign and missing branch are safely denied', async () => {
  mocks.branch.mockResolvedValue(false);
  await expect(repository().branch(actor, id)).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  mocks.branch.mockResolvedValue(true);
  results = [[]];
  await expect(repository().branch(actor, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it.each([undefined, id])(
  'MGR-001: assignment history requires owner-only branch scope with cursor %s',
  async (cursor) => {
    expect(
      await repository().managers(actor, id, { limit: 20, ...(cursor ? { cursor } : {}) }),
    ).toEqual([{ id }]);
    expect(mocks.branch).toHaveBeenCalledWith(actor.userId, id, true);
  },
);
it('SEC-001: manager cannot read privileged staff history', async () => {
  mocks.branch.mockResolvedValue(false);
  await expect(repository().managers(actor, id, { limit: 20 })).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
});

it('ONB-001: facade geography reads retain the trusted database, clock and actor', async () => {
  expect(await repository().cities(actor, { limit: 1 })).toEqual([{ id }]);
  results = [[{ id }], [{ id }]];
  expect(await repository().areas(actor, id, { limit: 1 })).toEqual([{ id }]);
  expect(mocks.owner).toHaveBeenCalledWith(actor.userId);
});
