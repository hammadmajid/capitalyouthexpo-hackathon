import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { adminAccounts, adminRoleGrants } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AdminAccountService } from './admins.service.js';
import { lockAdmin } from './scope.js';
vi.mock('./scope.js', async (load) => ({
  ...(await load<typeof import('./scope.js')>()),
  lockAdmin: vi.fn(),
}));
const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const actor = { userId: id(99), sessionId: id(98) };
const account = (n: number) => ({
  userId: id(n),
  fullName: 'Admin ' + n,
  isRoot: n === 1,
  status: 'active',
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockAdmin).mockResolvedValue({ userId: actor.userId, isRoot: true, roles: [] });
});
function page(ids: number[]) {
  const fixture = queryFixture();
  fixture.enqueue(
    adminAccounts,
    ids.map((n) => ({ userId: id(n) })),
  );
  for (const n of ids.slice(0, 2)) {
    fixture.enqueue(adminAccounts, [account(n)]);
    fixture.enqueue(adminRoleGrants, []);
  }
  fixture.enqueue(adminAccounts, [{ totalCount: 5, activeRootCount: 1 }]);
  return {
    ...fixture,
    service: new AdminAccountService(fixture.database, { withStore: vi.fn() } as never),
  };
}
it('ADM-001: first page uses stable UUID order and sentinel continuation, summaries are full-list', async () => {
  const f = page([1, 2, 3]);
  const result = await f.service.list(actor, { limit: 2 });
  expect(result).toMatchObject({
    data: [account(1), account(2)],
    nextCursor: id(2),
    activeRootCount: 1,
    totalCount: 5,
  });
  expect(f.operations.find((o) => o.kind === 'limit')?.args).toEqual([3]);
  const order = f.operations.find((o) => o.kind === 'orderBy')?.args[0];
  expect(order).toBeDefined();
  expect(lockAdmin).toHaveBeenCalledWith(f.transaction, actor, 'root', expect.any(Function));
});
it('ADM-001: continuation excludes earlier UUIDs, ends without duplicate/omitted stable fixture rows', async () => {
  const first = await page([1, 2, 3]).service.list(actor, { limit: 2 });
  const f = page([3, 4, 5]);
  const second = await f.service.list(actor, { limit: 2, cursor: first.nextCursor });
  const last = await page([5]).service.list(actor, { limit: 2, cursor: second.nextCursor });
  expect([...first.data, ...second.data, ...last.data].map((x) => x.userId)).toEqual(
    [1, 2, 3, 4, 5].map(id),
  );
  expect(last.nextCursor).toBeNull();
  const predicate = f.predicates[0]?.value;
  expect(predicate && new PgDialect().sqlToQuery(predicate).params).toContain(id(2));
});
it('ADM-001 SEC-001: malformed cursors never query; every page and detail require live Root', async () => {
  const f = page([]);
  expect(() => f.service.list(actor, { cursor: 'bad' })).toThrow();
  expect(lockAdmin).not.toHaveBeenCalled();
  vi.mocked(lockAdmin).mockRejectedValue(new Error('Root required'));
  await expect(f.service.list(actor, { cursor: id(2) })).rejects.toThrow('Root required');
  await expect(f.service.detail(actor, id(1))).rejects.toThrow('Root required');
});
