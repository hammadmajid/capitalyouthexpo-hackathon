import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { supportTicketMessages, supportTickets } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { SupportService } from './support.service.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
const security = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn() }));
vi.mock('./scope.js', async (original) => ({
  ...(await original<typeof import('./scope.js')>()),
  lockAdmin: security.admin,
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: security.actor }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(1), sessionId: id(2) };
const ticketId = id(3);
const now = new Date('2026-10-30T10:00:00Z');
let store: ReturnType<typeof queryFixture>;
function service() {
  return new SupportService(store.database, {} as never, () => now);
}
function header(opener = actor.userId) {
  return {
    ticket: {
      id: ticketId,
      openedByUserId: opener,
      subject: 'Access help',
      category: 'account',
      priority: 'high',
      status: 'open',
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    openedByName: 'Participant',
    assignedToName: null,
  };
}
function message(n: number, internal = false) {
  return {
    message: {
      id: id(n),
      authorUserId: actor.userId,
      body: 'Message ' + n,
      visibility: internal ? 'internal' : 'public',
      createdAt: now,
    },
    authorName: 'Participant',
  };
}
function sqlFor(table: unknown) {
  const predicate = store.predicates.find((row) => row.table === table)?.value;
  if (!predicate) throw new Error('Expected scoped SQL predicate');
  return new PgDialect().sqlToQuery(predicate);
}
beforeEach(() => {
  vi.clearAllMocks();
  store = queryFixture();
  security.admin.mockResolvedValue({ userId: actor.userId, isRoot: false, roles: ['support'] });
  security.actor.mockResolvedValue(undefined);
});
it('ADM-009: staff messages use bounded ascending continuation and preserve staff-only notes', async () => {
  store.enqueue(supportTickets, [header()]);
  store.enqueue(supportTicketMessages, [message(5), message(6, true), message(7)]);
  const page = await service().staffMessages(actor, ticketId, { limit: 2 });
  expect(page).toMatchObject({ ticketId, nextCursor: id(6) });
  expect(page.data.map((row) => row.id)).toEqual([id(5), id(6)]);
  expect(page.data[1]?.internal).toBe(true);
  expect(security.admin).toHaveBeenCalledWith(
    store.transaction,
    actor,
    'support',
    expect.any(Function),
  );
  expect(store.operations).toContainEqual({
    table: supportTicketMessages,
    kind: 'limit',
    args: [3],
  });
  expect(sqlFor(supportTicketMessages).params).toEqual([ticketId]);
});
it('ADM-009 SEC-003: participant continuation filters internal notes before pagination', async () => {
  store.enqueue(supportTickets, [header()]);
  store.enqueue(supportTicketMessages, [message(8), message(9)]);
  const page = await service().ownMessages(actor, ticketId, { cursor: id(7), limit: 2 });
  expect(page.nextCursor).toBeNull();
  expect(page.data.every((row) => !row.internal)).toBe(true);
  const query = sqlFor(supportTicketMessages);
  expect(query.sql).toContain('"visibility"');
  expect(query.sql).toContain(' > ');
  expect(query.params).toEqual([ticketId, 'public', id(7)]);
  expect(security.actor).toHaveBeenCalledWith(store.transaction, actor, expect.any(Function));
});
it('SEC-003: another participant cannot fetch a thread or learn whether it contains notes', async () => {
  store.enqueue(supportTickets, [header(id(99))]);
  await expect(service().ownMessages(actor, ticketId, {})).rejects.toMatchObject({ status: 404 });
  expect(store.operations.some((row) => row.table === supportTicketMessages)).toBe(false);
});
it('SEC-003: revoked support capability denies every continuation page before private reads', async () => {
  security.admin.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Role revoked'));
  await expect(service().staffMessages(actor, ticketId, { cursor: id(7) })).rejects.toMatchObject({
    status: 403,
  });
  expect(store.operations).toEqual([]);
});
it('ADM-009: queue filters validate priority and escaped literal search with stable cursor', async () => {
  store.enqueue(supportTickets, [header()]);
  expect(
    (await service().queue(actor, { priority: 'high', q: '%_\\', cursor: id(8), limit: 1 })).data,
  ).toHaveLength(1);
  const query = sqlFor(supportTickets);
  expect(query.sql).toContain('ilike');
  expect(query.params).toEqual(['high', '%\\%\\_\\\\%', id(8)]);
  await expect(async () => service().queue(actor, { priority: 'urgent' })).rejects.toThrow();
});
it('ADM-009: message query rejects malformed identities and overlarge limits before reads', async () => {
  await expect(async () => service().staffMessages(actor, 'bad', {})).rejects.toThrow();
  await expect(async () =>
    service().staffMessages(actor, ticketId, { limit: 101 }),
  ).rejects.toThrow();
  expect(security.admin).not.toHaveBeenCalled();
});
