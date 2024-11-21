import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '@hsm/db';
import { ScopeRepository } from './repository.js';
let results: unknown[][];
let predicates: SQL[];
const userId = randomUUID();
const branchId = randomUUID();
const organizationId = randomUUID();
const assignmentId = randomUUID();
function query(rows: unknown[]) {
  let predicate: SQL | undefined;
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    getSQL: () => sql`select 1 where ${predicate}`,
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockImplementation((value: SQL) => {
    predicate = value;
    predicates.push(value);
    return chain;
  });
  return chain;
}
const database = { select: vi.fn(() => query(results.shift() ?? [])) };
const repository = new ScopeRepository(database as unknown as Database);
const condition = () => new PgDialect().sqlToQuery(sql.join(predicates, sql` and `));
beforeEach(() => {
  vi.clearAllMocks();
  results = [];
  predicates = [];
});
it('SEC: customer and organization queries require active identity and concrete ownership', async () => {
  results = [[{ id: userId }]];
  expect(await repository.customer(userId)).toBe(true);
  expect(condition().params).toContain(userId);
  expect(condition().params).toContain('active');
  expect(await repository.customer(userId)).toBe(false);
  results = [[{ id: organizationId }]];
  expect(await repository.owner(userId, organizationId)).toBe(true);
  expect(condition().params).toContain(organizationId);
  expect(condition().sql).toContain('"organizations"."archived_at" is null');
  expect(await repository.owner(userId)).toBe(false);
});
it('ACC-002: branch checks bind server-side ownership or a live assignment and exclude archived parents', async () => {
  results = [[{ id: branchId }]];
  expect(await repository.branch(userId, branchId, false)).toBe(true);
  const compiled = condition();
  expect(compiled.params).toContain(branchId);
  expect(compiled.params).toContain(userId);
  expect(compiled.params).toContain('active');
  expect(compiled.sql).toContain('exists');
  expect(compiled.sql).toContain('"scope_actor_assignments"."user_id"');
  for (const table of ['branches', 'brands', 'organizations'])
    expect(compiled.sql).toContain('"' + table + '"."archived_at" is null');
  expect(await repository.branch(userId, branchId, false)).toBe(false);
});
it('MGR-004: owner-only branch checks cannot fall back to manager assignment', async () => {
  results = [[{ id: branchId }]];
  expect(await repository.branch(userId, branchId, true)).toBe(true);
  expect(condition().sql).toContain('"organizations"."owner_user_id"');
  expect(condition().sql).not.toContain('exists');
});
it('ACC-002: object resolution scopes the child before returning it and binds optional route branch', async () => {
  results = [[{ branchId }]];
  expect(await repository.object(userId, assignmentId, true, branchId)).toEqual({ branchId });
  expect(condition().params).toContain(assignmentId);
  expect(condition().params).toContain(branchId);
  expect(condition().sql).not.toContain('exists');
  expect(await repository.object(userId, assignmentId, false)).toBeUndefined();
  expect(condition().sql).toContain('exists');
});
it('SEC: admin capability requires an active account and only non-revoked grants', async () => {
  expect(await repository.admin(userId)).toBeUndefined();
  results = [[{ isRoot: false }], [{ role: 'support' }]];
  expect(await repository.admin(userId)).toEqual({ isRoot: false, roles: ['support'] });
  expect(condition().sql).toContain('"admin_role_grants"."revoked_at" is null');
  expect(condition().params).toContain('active');
  results = [[{ isRoot: true }], []];
  expect(await repository.admin(userId)).toEqual({ isRoot: true, roles: [] });
});
