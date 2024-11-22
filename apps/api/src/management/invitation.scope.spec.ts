import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { branches } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { lockInvitationBranch } from './invitation.scope.js';
const chain = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), for: vi.fn() };
const database = { select: vi.fn() };
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  organizationId = randomUUID();
beforeEach(() => {
  vi.clearAllMocks();
  database.select.mockReturnValue(chain);
  for (const key of ['from', 'innerJoin', 'where'] as const) chain[key].mockReturnValue(chain);
  chain.for.mockResolvedValue([{ organizationId }]);
});
it('SEC-001: invitation scope locks exact Owner branch and live parent rows', async () => {
  expect(await lockInvitationBranch(database as unknown as Transaction, actor, branchId)).toBe(
    organizationId,
  );
  expect(chain.from).toHaveBeenCalledWith(branches);
  expect(chain.for).toHaveBeenCalledWith('update');
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls[0]?.[0] as SQL);
  expect(query.params).toEqual([branchId, actor.userId]);
  for (const table of ['branches', 'brands', 'organizations'])
    expect(query.sql).toContain('"' + table + '"."archived_at" is null');
  const brandJoin = new PgDialect().sqlToQuery(chain.innerJoin.mock.calls[0]?.[1] as SQL);
  expect(brandJoin.sql).toContain('"brands"."organization_id" = "branches"."organization_id"');
});
it('SEC-001: foreign or archived scope rejects before invitation work', async () => {
  chain.for.mockResolvedValue([]);
  await expect(
    lockInvitationBranch(database as unknown as Transaction, actor, branchId),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN', status: 403 });
});
