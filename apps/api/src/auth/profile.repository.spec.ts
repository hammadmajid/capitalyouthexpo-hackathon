import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { ProfileRepository } from './profile.repository.js';
const user = {
  id: randomUUID(),
  fullName: 'Profile',
  email: 'self@example.com',
  emailVerifiedAt: new Date(),
  cnicLast4: '5671',
};
let results: unknown[][];
function query(rows: unknown[]) {
  const value = {
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    then: (resolve: (data: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  value.from.mockReturnValue(value);
  value.where.mockReturnValue(value);
  value.innerJoin.mockReturnValue(value);
  return value;
}
const database = { select: vi.fn(() => query(results.shift() ?? [])) };
beforeEach(() => {
  vi.clearAllMocks();
  results = [];
});
const repository = () => new ProfileRepository(database as unknown as Database);
it('AUTH-C: projects masked identity and simultaneous persisted capabilities', async () => {
  const branchId = randomUUID();
  results = [
    [user],
    [{ id: user.id }],
    [{ id: randomUUID() }],
    [{ branchId, branchName: 'Branch' }],
    [{ isRoot: false }],
    [{ role: 'support' }],
  ];
  expect(await repository().read(user.id)).toEqual({
    user: {
      id: user.id,
      fullName: 'Profile',
      email: user.email,
      emailVerified: true,
      cnicLast4: '5671',
    },
    capabilities: {
      customer: true,
      owner: true,
      managerOf: [{ branchId, branchName: 'Branch' }],
      admin: { isRoot: false, roles: ['support'] },
    },
  });
});
it('SEC: absent persisted grants never manufacture a capability', async () => {
  results = [[{ ...user, emailVerifiedAt: null, cnicLast4: null }], [], [], [], []];
  const profile = await repository().read(user.id);
  expect(profile.user.emailVerified).toBe(false);
  expect(profile.capabilities).toEqual({
    customer: false,
    owner: false,
    managerOf: [],
    admin: null,
  });
});
it('SEC: missing identity is rejected', async () => {
  await expect(repository().read(user.id)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('SEC-001/MGR-004: archived brands cannot contribute a live manager capability', async () => {
  results = [[user], [], [], [], []];
  await repository().read(user.id);
  const managerQuery = database.select.mock.results[3]?.value as ReturnType<typeof query>;
  const predicate = managerQuery.where.mock.calls[0]?.[0] as SQL | undefined;
  if (!predicate) throw new Error('Manager scope query missing');
  expect(new PgDialect().sqlToQuery(predicate).sql).toContain('"brands"."archived_at" is null');
});
