import { beforeEach, expect, it, vi } from 'vitest';
import {
  branches,
  complaintAttachments,
  complaintEvents,
  complaints,
  files,
  managerAssignments,
  stays,
  syncTransportBilling,
  transportRoutes,
  transportSubscriptions,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { TransportSubscriptionService } from './transport-subscriptions.service.js';
import { ComplaintService } from './complaints.service.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  syncTransportBilling: vi.fn(),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', async (original) => ({
  ...(await original<typeof import('./scope.js')>()),
  lockOwnStay: vi.fn(async () => ({ stay: ownStay, place: null })),
  lockStaffScope: vi.fn(async (_tx, _actor, branchId: string) => ({
    organizationId: '10000000-0000-4000-8000-000000000001',
    branchId,
    actorUserId: '10000000-0000-4000-8000-000000000009',
    actorRole: 'owner',
  })),
  replayAuthorizer: () => async () => true,
}));
const ownStay = {
  id: '10000000-0000-4000-8000-000000000004',
  branchId: '10000000-0000-4000-8000-000000000003',
  userId: '10000000-0000-4000-8000-000000000009',
  state: 'active',
  moveInDate: '2026-06-25',
};
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => current }));
let current: unknown;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(9) } as never;
const now = new Date('2026-07-01T10:00:00Z');
const clock = () => now;
const idempotency = {
  execute: vi.fn(async (_c, _s, _i, schema, authorize, work) => {
    await authorize(current);
    return { status: 200, replayed: false, body: schema.parse(await work()) };
  }),
} as never;
beforeEach(() => {
  vi.mocked(lockInventoryScope)
    .mockReset()
    .mockResolvedValue({ organizationId: id(1), actorRole: 'owner' } as never);
  vi.mocked(syncTransportBilling).mockReset();
});
const stay = {
  id: id(4),
  branchId: id(3),
  userId: id(9),
  state: 'active',
  moveInDate: '2026-06-25',
};
const sub = (change: Record<string, unknown> = {}) => ({
  subscription: {
    id: id(6),
    branchId: id(3),
    stayId: id(4),
    routeId: id(5),
    status: 'requested',
    monthlyChargePaisa: 100n,
    effectiveFrom: null,
    effectiveTo: null,
    endRequestedAt: null,
    decidedByUserId: null,
    reason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...change,
  },
  routeName: 'R',
});
it('SERV-002 / p.32: request at the shown price; decide with dates; billing synced', async () => {
  const store = queryFixture();
  current = store.transaction;
  const service = new TransportSubscriptionService(store.database, idempotency, clock);
  const route = {
    id: id(5),
    branchId: id(3),
    name: 'R',
    description: null,
    pricingMode: 'separate',
    includedFrom: null,
    departureTimes: ['07:00'],
    stops: ['A'],
    stopRoles: [],
    monthlyChargePaisa: 100n,
    status: 'active',
    version: 1,
  };
  store.enqueue(
    transportRoutes,
    [route],
    [route],
    [route],
    [{ ...route, monthlyChargePaisa: 90n }],
  );
  store.enqueue(transportSubscriptions, [sub().subscription], [sub()]);
  store.enqueue(branches, [{ ownerId: id(9) }]);
  expect(
    (await service.request(actor, id(7), id(4), { monthlyChargePaisa: 100 })).body.status,
  ).toBe('requested');
  await expect(
    service.request(actor, id(7), id(4), { routeId: id(5), monthlyChargePaisa: 100 }),
  ).rejects.toMatchObject({ status: 409 });
  // approve
  const pending = sub().subscription;
  store.enqueue(
    transportSubscriptions,
    [{ stayId: id(4) }],
    [pending],
    [],
    [sub({ status: 'active' })],
    [sub({ status: 'active' })],
  );
  store.enqueue(stays, [stay]);
  const approved = await service.decide(actor, id(7), id(3), id(6), {
    decision: 'approve',
    expectedVersion: 1,
    effectiveFrom: '2026-07-10',
  });
  expect(approved.body.status).toBe('active');
  expect(vi.mocked(syncTransportBilling).mock.calls[0]?.[2]).toEqual({
    changedOn: '2026-07-10',
    activate: true,
  });
  // past date, wrong state, missing, stale version
  store.enqueue(transportSubscriptions, [{ stayId: id(4) }], [pending]);
  store.enqueue(stays, [stay]);
  await expect(
    service.decide(actor, id(7), id(3), id(6), {
      decision: 'approve',
      expectedVersion: 1,
      effectiveFrom: '2026-06-30',
    }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(
    transportSubscriptions,
    [{ stayId: id(4) }],
    [{ ...pending, status: 'active', effectiveFrom: '2026-07-10' }],
    [],
    [sub({ status: 'ended' })],
    [sub({ status: 'ended' })],
  );
  store.enqueue(stays, [stay]);
  expect(
    (
      await service.decide(actor, id(7), id(3), id(6), {
        decision: 'end',
        expectedVersion: 1,
        effectiveTo: '2026-08-20',
      })
    ).body.status,
  ).toBe('ended');
  store.enqueue(
    transportSubscriptions,
    [{ stayId: id(4) }],
    [{ ...pending, status: 'active', effectiveFrom: '2026-07-10' }],
  );
  store.enqueue(stays, [stay]);
  await expect(
    service.decide(actor, id(7), id(3), id(6), {
      decision: 'end',
      expectedVersion: 1,
      effectiveTo: '2026-07-05',
    }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(
    transportSubscriptions,
    [{ stayId: id(4) }],
    [pending],
    [],
    [sub({ status: 'rejected' })],
    [sub({ status: 'rejected' })],
  );
  store.enqueue(stays, [{ ...stay, state: 'completed' }]);
  expect(
    (
      await service.decide(actor, id(7), id(3), id(6), {
        decision: 'reject',
        expectedVersion: 1,
        reason: 'Full',
      })
    ).body.status,
  ).toBe('rejected');
  store.enqueue(transportSubscriptions, []);
  await expect(
    service.decide(actor, id(7), id(3), id(6), {
      decision: 'reject',
      expectedVersion: 1,
      reason: 'x',
    }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(transportSubscriptions, [{ stayId: id(4) }], [{ ...pending, version: 4 }]);
  store.enqueue(stays, [stay]);
  await expect(
    service.decide(actor, id(7), id(3), id(6), {
      decision: 'reject',
      expectedVersion: 1,
      reason: 'x',
    }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(transportSubscriptions, [{ stayId: id(4) }], [pending]);
  store.enqueue(stays, [{ ...stay, state: 'completed' }]);
  await expect(
    service.decide(actor, id(7), id(3), id(6), {
      decision: 'approve',
      expectedVersion: 1,
      effectiveFrom: '2026-07-10',
    }),
  ).rejects.toMatchObject({ status: 409 });
  // resident withdraw / end request / lists
  store.enqueue(
    transportSubscriptions,
    [pending],
    [],
    [sub({ status: 'withdrawn' })],
    [{ ...pending, status: 'active' }],
    [],
    [sub({ status: 'active' })],
    [pending],
  );
  expect(
    (await service.resident(actor, id(7), id(4), id(6), 'withdraw', { expectedVersion: 1 })).body
      .status,
  ).toBe('withdrawn');
  store.enqueue(branches, [{ ownerId: id(9) }]);
  expect(
    (await service.resident(actor, id(7), id(4), id(6), 'end', { expectedVersion: 1 })).body.status,
  ).toBe('active');
  await expect(
    service.resident(actor, id(7), id(4), id(6), 'end', { expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(transportSubscriptions, [{ ...pending, status: 'active' }]);
  await expect(
    service.resident(actor, id(7), id(4), id(6), 'withdraw', { expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(transportSubscriptions, [sub()]);
  expect((await service.ownList(actor, id(4))).data).toHaveLength(1);
  store.enqueue(transportSubscriptions, [sub(), sub()]);
  expect(
    (await service.staffList(actor, id(3), { limit: '1', status: 'requested', cursor: id(8) }))
      .nextCursor,
  ).toBe(id(6));
  store.enqueue(transportRoutes, []);
  await expect(
    service.request(actor, id(7), id(4), { routeId: id(5), monthlyChargePaisa: 100 }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(transportRoutes, [route], [route]);
  store.enqueue(transportSubscriptions, []);
  await expect(
    service.request(actor, id(7), id(4), { routeId: id(5), monthlyChargePaisa: 100 }),
  ).rejects.toMatchObject({ status: 409 });
});
const complaintRow = {
  id: id(6),
  branchId: id(3),
  stayId: id(4),
  userId: id(9),
  roomId: null,
  seatId: null,
  category: 'wifi',
  title: 't',
  description: 'd',
  status: 'open',
  assignedToUserId: null,
  reopenCount: 0,
  resolvedAt: null,
  closedAt: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const joined = (change: Record<string, unknown> = {}) => ({
  complaint: { ...complaintRow, ...change },
  roomLabel: null,
  bedLabel: null,
  residentName: 'Ali Raza',
  assignedToName: null,
});
it('CMP-001..006: create with attachments, act by state, reads scoped, stats and links', async () => {
  const store = queryFixture();
  current = store.transaction;
  const storage = { presignDownload: vi.fn().mockResolvedValue('https://files.test/x') };
  const service = new ComplaintService(store.database, idempotency, storage, 'bucket', clock);
  const fileRow = {
    id: id(5),
    objectKey: 'private/complaint_attachment/' + id(5) + '/k',
    digest: Buffer.alloc(32),
  };
  store.enqueue(files, [fileRow]);
  store.enqueue(complaintAttachments, [], [], [{ complaintId: id(6), fileId: id(5) }]);
  store.enqueue(complaints, [complaintRow], [joined()]);
  store.enqueue(complaintEvents, [{ id: id(7) }], []);
  store.enqueue(branches, [{ ownerId: id(9) }]);
  const created = await service.create(actor, id(7), id(4), {
    category: 'wifi',
    title: 't',
    description: 'd',
    attachmentFileIds: [id(5)],
  });
  expect(created.body).toMatchObject({ status: 'open', attachmentFileIds: [id(5)] });
  store.enqueue(files, []);
  await expect(
    service.create(actor, id(7), id(4), {
      category: 'wifi',
      title: 't',
      description: 'd',
      attachmentFileIds: [id(5)],
    }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(files, [fileRow]);
  store.enqueue(complaintAttachments, [{ id: id(5) }]);
  await expect(
    service.create(actor, id(7), id(4), {
      category: 'wifi',
      title: 't',
      description: 'd',
      attachmentFileIds: [id(5)],
    }),
  ).rejects.toMatchObject({ status: 409 });
  // staff: assign to an active manager, then an impossible move
  store.enqueue(complaints, [complaintRow], [], [joined({ status: 'assigned', version: 2 })]);
  store.enqueue(branches, [{ ownerId: id(1) }]);
  store.enqueue(managerAssignments, [{ id: id(2) }]);
  store.enqueue(complaintEvents, [{ id: id(8) }], []);
  store.enqueue(complaintAttachments, []);
  expect(
    (
      await service.staffAct(actor, id(7), id(3), id(6), {
        action: 'assign',
        expectedVersion: 1,
        assigneeUserId: id(9),
      })
    ).body.status,
  ).toBe('assigned');
  store.enqueue(complaints, [{ ...complaintRow, status: 'closed' }]);
  await expect(
    service.staffAct(actor, id(7), id(3), id(6), {
      action: 'resolve',
      expectedVersion: 1,
      note: 'x',
    }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(complaints, [{ ...complaintRow, version: 5 }]);
  await expect(
    service.staffAct(actor, id(7), id(3), id(6), { action: 'start', expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  store.enqueue(complaints, [{ ...complaintRow, branchId: id(2) }]);
  await expect(
    service.staffAct(actor, id(7), id(3), id(6), { action: 'start', expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(complaints, [complaintRow]);
  store.enqueue(branches, [{ ownerId: id(1) }]);
  store.enqueue(managerAssignments, []);
  await expect(
    service.staffAct(actor, id(7), id(3), id(6), {
      action: 'assign',
      expectedVersion: 1,
      assigneeUserId: id(5),
    }),
  ).rejects.toMatchObject({ status: 404 });
  // resident reopen then accept
  const resolved = { ...complaintRow, status: 'resolved' };
  store.enqueue(
    complaints,
    [resolved],
    [],
    [joined({ status: 'reopened' })],
    [resolved],
    [],
    [joined({ status: 'closed', closedAt: now })],
  );
  store.enqueue(complaintEvents, [{ id: id(8) }], [], [{ id: id(9) }], []);
  store.enqueue(complaintAttachments, [], []);
  store.enqueue(branches, [{ ownerId: id(1) }]);
  expect(
    (
      await service.residentAct(actor, id(7), id(4), id(6), {
        action: 'reopen',
        expectedVersion: 1,
        note: 'Still broken',
      })
    ).body.status,
  ).toBe('reopened');
  expect(
    (
      await service.residentAct(actor, id(7), id(4), id(6), {
        action: 'accept',
        expectedVersion: 1,
      })
    ).body.status,
  ).toBe('closed');
  store.enqueue(complaints, [{ ...complaintRow, userId: id(1) }]);
  await expect(
    service.residentAct(actor, id(7), id(4), id(6), { action: 'accept', expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  store.enqueue(complaints, []);
  await expect(
    service.residentAct(actor, id(7), id(4), id(6), { action: 'accept', expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  // reads
  store.enqueue(complaints, [joined(), joined()], [joined()], [joined({ stayId: id(2) })]);
  store.enqueue(complaintAttachments, [], [], []);
  store.enqueue(complaintEvents, [], []);
  expect(
    (
      await service.ownPage(actor, id(4), {
        limit: '1',
        status: 'open',
        category: 'wifi',
        cursor: id(8),
      })
    ).nextCursor,
  ).toBe(id(6));
  expect((await service.ownDetail(actor, id(4), id(6))).id).toBe(id(6));
  await expect(service.ownDetail(actor, id(4), id(6))).rejects.toMatchObject({ status: 404 });
  store.enqueue(complaints, [joined()], [joined()], [joined({ branchId: id(2) })], []);
  store.enqueue(complaintAttachments, [], [], []);
  store.enqueue(complaintEvents, [], []);
  expect((await service.staffPage(actor, id(3), {})).data).toHaveLength(1);
  expect((await service.staffDetail(actor, id(3), id(6))).id).toBe(id(6));
  await expect(service.staffDetail(actor, id(3), id(6))).rejects.toMatchObject({ status: 404 });
  await expect(service.staffDetail(actor, id(3), id(6))).rejects.toMatchObject({ status: 404 });
  store.enqueue(
    complaints,
    [{ status: 'open', count: 2 }],
    [{ count: 1, hours: 5.26 }],
    [{ status: 'open', count: 0 }],
    [{ count: 0, hours: null }],
  );
  expect(await service.stats(actor, id(3))).toMatchObject({
    counts: { open: 2, closed: 0 },
    averageResolutionHours: 5.3,
  });
  expect((await service.stats(actor, id(3))).averageResolutionHours).toBeNull();
  // attachment links: staff and own, with audit; storage failure is a 503
  const fileFull = { id: id(5), objectKey: 'k', mimeType: 'application/pdf' };
  store.enqueue(
    complaints,
    [complaintRow],
    [complaintRow],
    [complaintRow],
    [{ ...complaintRow, branchId: id(2) }],
    [],
  );
  store.enqueue(
    complaintAttachments,
    [{ file: fileFull }],
    [{ file: fileFull }],
    [{ file: fileFull }],
  );
  expect((await service.attachment(actor, id(6), id(5), { branchId: id(3) })).url).toBe(
    'https://files.test/x',
  );
  expect((await service.attachment(actor, id(6), id(5), { stayId: id(4) })).url).toBe(
    'https://files.test/x',
  );
  storage.presignDownload.mockRejectedValueOnce(new Error('down'));
  await expect(service.attachment(actor, id(6), id(5), { branchId: id(3) })).rejects.toMatchObject({
    status: 503,
  });
  await expect(service.attachment(actor, id(6), id(5), { branchId: id(3) })).rejects.toMatchObject({
    status: 404,
  });
  await expect(service.attachment(actor, id(6), id(5), { branchId: id(3) })).rejects.toMatchObject({
    status: 404,
  });
});
