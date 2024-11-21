import { beforeEach, expect, it, vi } from 'vitest';
import {
  adminAccounts,
  adminRoleGrants,
  announcements,
  branches,
  cities,
  supportTicketMessages,
  supportTickets,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { SupportService } from './support.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => current }));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: '10000000-0000-4000-8000-000000000009' }),
}));
let current: ReturnType<typeof queryFixture>['transaction'];
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(9) } as never;
const now = new Date('2026-10-26T10:00:00Z');
const clock = () => now;
const idempotency = {
  execute: vi.fn(async (_c, _s, _i, schema, authorize, work) => {
    await authorize(current);
    return { status: 200, replayed: false, body: schema.parse(await work()) };
  }),
} as never;
let store: ReturnType<typeof queryFixture>;
beforeEach(() => {
  store = queryFixture();
  current = store.transaction;
  (store.transaction as unknown as { execute: unknown }).execute = vi.fn();
});
// lockAdmin reads the account then the grants; queue both per call.
function asAdmin(account: Record<string, unknown> | undefined, roles: string[] = []) {
  store.enqueue(adminAccounts, account ? [account] : []);
  if (account)
    store.enqueue(
      adminRoleGrants,
      roles.map((role) => ({ role })),
    );
}
const ticket = (change: Record<string, unknown> = {}) => ({
  id: id(6),
  openedByUserId: id(9),
  subject: 's',
  category: 'account',
  priority: 'normal',
  status: 'open',
  assignedAdminUserId: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  ...change,
});
const header = (change: Record<string, unknown> = {}) => ({
  ticket: ticket(change),
  openedByName: 'Ali',
  assignedToName: null,
});
const message = (visibility: string, authorUserId = id(9)) => ({
  message: { id: id(8), authorUserId, body: 'b', visibility, createdAt: now },
  authorName: 'Ali',
});
it('ADM-009/010: tickets, internal notes, replies and announcements', async () => {
  const service = new SupportService(store.database, idempotency, clock);
  store.enqueue(supportTickets, [{ id: id(6) }], [header()]);
  store.enqueue(supportTicketMessages, [], [message('public')]);
  expect(
    (await service.open(actor, id(7), { subject: 's', category: 'account', body: 'b' })).body
      .messages,
  ).toHaveLength(1);
  store.enqueue(supportTickets, [header(), header()]);
  expect((await service.ownPage(actor, { limit: '1' })).nextCursor).toBe(id(6));
  store.enqueue(supportTickets, [header()], [header({ openedByUserId: id(1) })]);
  store.enqueue(supportTicketMessages, []);
  expect((await service.ownDetail(actor, id(6))).id).toBe(id(6));
  await expect(service.ownDetail(actor, id(6))).rejects.toMatchObject({ status: 404 });
  store.enqueue(supportTickets, [ticket({ status: 'waiting_for_user' })], [], [header()]);
  store.enqueue(supportTicketMessages, [], []);
  expect((await service.reply(actor, id(7), id(6), { body: 'again' })).status).toBe(200);
  store.enqueue(
    supportTickets,
    [ticket({ status: 'closed' })],
    [ticket({ openedByUserId: id(1) })],
  );
  await expect(service.reply(actor, id(7), id(6), { body: 'x' })).rejects.toMatchObject({
    status: 409,
  });
  await expect(service.reply(actor, id(7), id(6), { body: 'x' })).rejects.toMatchObject({
    status: 404,
  });
  const support = () => {
    asAdmin({ isRoot: false, status: 'active' }, ['support']);
    asAdmin({ isRoot: false, status: 'active' }, ['support']);
  };
  asAdmin({ isRoot: false, status: 'active' }, ['support']);
  store.enqueue(supportTickets, [header()]);
  expect((await service.queue(actor, { status: 'open' })).data).toHaveLength(1);
  asAdmin({ isRoot: false, status: 'active' }, ['support']);
  store.enqueue(supportTickets, [header()]);
  store.enqueue(supportTicketMessages, [message('internal', id(1))]);
  expect((await service.staffDetail(actor, id(6))).messages[0]).toMatchObject({
    internal: true,
    fromSupport: true,
  });
  support();
  store.enqueue(supportTickets, [ticket()], [], [header({ status: 'resolved' })]);
  store.enqueue(supportTicketMessages, [], []);
  expect(
    (
      await service.staffAct(actor, id(7), id(6), {
        expectedVersion: 1,
        status: 'resolved',
        priority: 'high',
        assignToMe: true,
        body: 'Done',
      })
    ).status,
  ).toBe(200);
  support();
  store.enqueue(supportTickets, [ticket({ version: 3 })]);
  await expect(
    service.staffAct(actor, id(7), id(6), { expectedVersion: 1, status: 'resolved' }),
  ).rejects.toMatchObject({ status: 409 });
  support();
  store.enqueue(supportTickets, [ticket({ status: 'closed' })]);
  await expect(
    service.staffAct(actor, id(7), id(6), { expectedVersion: 1, status: 'open' }),
  ).rejects.toMatchObject({ status: 409 });
  support();
  store.enqueue(supportTickets, []);
  await expect(
    service.staffAct(actor, id(7), id(6), { expectedVersion: 1, body: 'x', internal: true }),
  ).rejects.toMatchObject({ status: 404 });
  const announced = {
    id: id(4),
    audience: 'city',
    branchIds: [],
    cityId: id(3),
    title: 't',
    body: 'b',
    status: 'scheduled',
    scheduledAt: now,
    sentAt: null,
    recipientCount: null,
    version: 1,
  };
  support();
  store.enqueue(cities, [{ id: id(3) }]);
  store.enqueue(announcements, [announced]);
  expect(
    (
      await service.announce(actor, id(7), {
        audience: 'city',
        cityId: id(3),
        title: 't',
        body: 'b',
      })
    ).body.status,
  ).toBe('scheduled');
  support();
  store.enqueue(branches, [{ id: id(2) }]);
  store.enqueue(announcements, [
    { ...announced, audience: 'selected_branches', branchIds: [id(2)], cityId: null },
  ]);
  expect(
    (
      await service.announce(actor, id(7), {
        audience: 'selected_branches',
        branchIds: [id(2)],
        title: 't',
        body: 'b',
        scheduledAt: '2026-10-27T10:00:00.000Z',
      })
    ).status,
  ).toBe(200);
  support();
  store.enqueue(branches, []);
  await expect(
    service.announce(actor, id(7), {
      audience: 'selected_branches',
      branchIds: [id(2)],
      title: 't',
      body: 'b',
    }),
  ).rejects.toMatchObject({ status: 404 });
  support();
  store.enqueue(cities, []);
  await expect(
    service.announce(actor, id(7), { audience: 'city', cityId: id(3), title: 't', body: 'b' }),
  ).rejects.toMatchObject({ status: 404 });
  support();
  await expect(
    service.announce(actor, id(7), {
      audience: 'customers',
      title: 't',
      body: 'b',
      scheduledAt: '2026-01-01T00:00:00.000Z',
    }),
  ).rejects.toMatchObject({ status: 400 });
  support();
  store.enqueue(announcements, [announced], [{ ...announced, status: 'cancelled', version: 2 }]);
  expect((await service.cancelAnnouncement(actor, id(7), id(4))).body.status).toBe('cancelled');
  support();
  store.enqueue(announcements, [{ ...announced, status: 'sent', sentAt: now, recipientCount: 2 }]);
  await expect(service.cancelAnnouncement(actor, id(7), id(4))).rejects.toMatchObject({
    status: 409,
  });
  support();
  store.enqueue(announcements, []);
  await expect(service.cancelAnnouncement(actor, id(7), id(4))).rejects.toMatchObject({
    status: 404,
  });
  asAdmin({ isRoot: false, status: 'active' }, ['support']);
  store.enqueue(announcements, [announced]);
  expect((await service.announcementsList(actor)).data).toHaveLength(1);
});
