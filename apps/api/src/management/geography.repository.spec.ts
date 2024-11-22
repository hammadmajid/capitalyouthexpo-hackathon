import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { GeographyReadRepository } from './geography.repository.js';
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
  new GeographyReadRepository(database as unknown as Database, clock);
it.each([undefined, id])(
  'ONB-001 SEC-001: cities recheck live actor and Owner with bounded cursor %s',
  async (cursor) => {
    expect(await repository().cities(actor, { limit: 20, ...(cursor ? { cursor } : {}) })).toEqual([
      { id },
    ]);
    expect(mocks.lock).toHaveBeenCalledWith(database, actor, expect.any(Function));
    expect(mocks.owner).toHaveBeenCalledWith(actor.userId);
  },
);
it.each(['cities', 'areas'] as const)(
  'SEC-001: lost Owner capability rejects %s before geography access',
  async (method) => {
    mocks.owner.mockResolvedValue(false);
    const result =
      method === 'cities'
        ? repository().cities(actor, { limit: 20 })
        : repository().areas(actor, id, { limit: 20 });
    await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(database.select).not.toHaveBeenCalled();
  },
);
it('AUTH-C: invalid live session rejects before reading geography', async () => {
  mocks.lock.mockRejectedValue(new Error('Session revoked'));
  await expect(repository().cities(actor, { limit: 1 })).rejects.toThrow('Session revoked');
  expect(mocks.owner).not.toHaveBeenCalled();
  expect(database.select).not.toHaveBeenCalled();
});
it('ONB-001: default geography clock and absent city reject safely', async () => {
  results = [[]];
  await expect(repository().areas(actor, id, { limit: 20 })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
it('ONB-001 SEC-001: missing, inactive or wrong-city parent rejects before child query', async () => {
  results = [[{ id }], []];
  await expect(repository().areas(actor, id, { limit: 20, parentId: id })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(database.select).toHaveBeenCalledTimes(2);
});
it.each([undefined, id])(
  'ONB-001: city area listing supports a bounded cursor %s',
  async (cursor) => {
    results = [[{ id }], [{ id }]];
    expect(
      await repository(() => new Date()).areas(actor, id, {
        limit: 1,
        ...(cursor ? { cursor } : {}),
      }),
    ).toEqual([{ id }]);
  },
);
it('ONB-001: sub-area lookup validates city and parent before bounded child selection', async () => {
  results = [[{ id }], [{ id }], [{ id }]];
  expect(await repository().areas(actor, id, { limit: 1, cursor: id, parentId: id })).toEqual([
    { id },
  ]);
  expect(database.select).toHaveBeenCalledTimes(3);
});
