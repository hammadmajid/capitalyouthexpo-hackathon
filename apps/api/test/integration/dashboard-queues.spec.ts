import { decodeJwt } from 'jose';
import { ResidentRepository } from '../../src/stay/residents.repository.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import {
  billingPolicies,
  branches,
  complaints,
  managerInventoryGrants,
  managerAssignments,
  residentInvoices,
  stays,
  staffMembers,
  staffSalaries,
  staffSalaryTerms,
} from '@hsm/db';
import {
  dashboardQueuePageSchema,
  ownerDashboardSchema,
  residentDirectoryQuerySchema,
} from '@hsm/contracts';
import { invoiceFixture, approveInvoiceReceipt } from './stay-invoice.fixture.js';
import { dashboardQueuesFixture } from './dashboard-queues.fixture.js';
let f: Awaited<ReturnType<typeof dashboardQueuesFixture>>;
let items: Awaited<ReturnType<typeof invoiceFixture>>[];
beforeAll(async () => {
  f = await dashboardQueuesFixture();
  items = [];
  for (let index = 0; index < 3; index++) {
    await f.connection.db
      .update(billingPolicies)
      .set({ isCurrent: false })
      .where(eq(billingPolicies.branchId, f.branchA));
    items.push(await invoiceFixture(f, index === 0 ? f.managerId : null));
  }
});
afterAll(async () => {
  await f?.close();
});
const read = (queue: string, query = '', headers?: Record<string, string>, branchId?: string) =>
  f.application.inject({
    method: 'GET',
    url: `/v1/branches/${branchId ?? f.branchA}/dashboard/queues/${queue}${query}`,
    headers: headers ?? f.ownerHeaders,
  });
it('AUD-009 / ACC-002: authorized empty branches return all three empty queues', async () => {
  for (const queue of ['overdue', 'complaints', 'checkouts']) {
    const response = await read(queue, '', undefined, f.branchB);
    expect(response.statusCode).toBe(200);
    expect(dashboardQueuePageSchema.parse(response.json())).toMatchObject({
      queue,
      branchId: f.branchB,
      data: [],
      nextCursor: null,
    });
  }
});
it('AUD-009 / FIN-001: canonical overdue selection and cursor skip an actually receipt-paid invoice before limiting', async () => {
  const invoices = await f.connection.db
    .select({ id: residentInvoices.id })
    .from(residentInvoices)
    .where(eq(residentInvoices.branchId, f.branchA))
    .orderBy(asc(residentInvoices.id));
  const paid = items.find((row) => row.invoiceId === invoices[0]?.id);
  if (!paid) throw new Error('Missing paid queue candidate');
  await approveInvoiceReceipt(f, paid);
  const first = await read('overdue', '?limit=1');
  expect(first.statusCode).toBe(200);
  const page = dashboardQueuePageSchema.parse(first.json());
  if (page.queue !== 'overdue') throw new Error('Wrong queue');
  expect(page.data.map((row) => row.balance.invoiceId)).toEqual([invoices[1]?.id]);
  expect(page.nextCursor).toBe(invoices[1]?.id);
  const last = await read('overdue', `?limit=1&cursor=${page.nextCursor}`);
  expect(last.statusCode).toBe(200);
  const end = dashboardQueuePageSchema.parse(last.json());
  expect(end.nextCursor).toBeNull();
  expect(end.data).toHaveLength(1);
});
it('AUD-009 / CMP / OUT: exact unresolved and upcoming conditions precede pagination', async () => {
  const first = items[0],
    second = items[1],
    third = items[2];
  if (!first || !second || !third) throw new Error('Missing Stay fixtures');
  await f.connection.db
    .update(stays)
    .set({ state: 'active', version: 2, checkedInAt: f.now })
    .where(eq(stays.id, first.stayId));
  await f.connection.db
    .update(stays)
    .set({ state: 'notice_given', version: 3, expectedLeaveDate: '2027-01-01', checkedInAt: f.now })
    .where(eq(stays.id, first.stayId));
  await f.connection.db
    .update(stays)
    .set({ state: 'active', version: 2, expectedLeaveDate: '2026-11-11', checkedInAt: f.now })
    .where(eq(stays.id, second.stayId));
  await f.connection.db
    .update(stays)
    .set({ state: 'active', version: 2, expectedLeaveDate: '2026-11-12', checkedInAt: f.now })
    .where(eq(stays.id, third.stayId));
  const response = await read('checkouts', '?limit=1');
  expect(response.statusCode).toBe(200);
  const page = dashboardQueuePageSchema.parse(response.json());
  expect(page.data).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const next = await read('checkouts', `?limit=1&cursor=${page.nextCursor}`);
  expect(next.statusCode).toBe(200);
  expect(dashboardQueuePageSchema.parse(next.json())).toMatchObject({
    nextCursor: null,
    data: [{ id: [first.stayId, second.stayId].sort()[1] }],
  });
  const ids = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];
  await f.connection.db.insert(complaints).values(
    ids.map((id, index) => ({
      id,
      branchId: f.branchA,
      stayId: first.stayId,
      userId: f.managerId,
      category: 'wifi' as const,
      title: 'Queue complaint',
      description: 'Actual private queue fixture',
      status:
        index === 2
          ? ('resolved' as const)
          : index === 1
            ? ('reopened' as const)
            : ('open' as const),
      version: 1,
    })),
  );
  const complaintsPage = await read('complaints', '?limit=1');
  expect(complaintsPage.statusCode).toBe(200);
  const cp = dashboardQueuePageSchema.parse(complaintsPage.json());
  expect(cp.data).toMatchObject([{ id: ids[1] }]);
  expect(cp.nextCursor).toBe(ids[1]);
  const cp2 = await read('complaints', `?limit=1&cursor=${cp.nextCursor}`);
  expect(cp2.statusCode).toBe(200);
  expect(dashboardQueuePageSchema.parse(cp2.json())).toMatchObject({
    data: [{ id: ids[0] }],
    nextCursor: null,
  });
});
it('AUD-009 / ACC-002: direct queue reads enforce every live grant and foreign branch denial', async () => {
  for (const queue of ['overdue', 'complaints', 'checkouts'])
    expect((await read(queue, '', f.managerHeaders)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId: f.assignmentId, permission: 'stay_manage' });
  expect((await read('complaints', '', f.managerHeaders)).statusCode).toBe(200);
  expect((await read('checkouts', '', f.managerHeaders)).statusCode).toBe(200);
  expect((await read('overdue', '', f.managerHeaders)).statusCode).toBe(403);
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId: f.assignmentId, permission: 'finance_view' });
  expect((await read('overdue', '', f.managerHeaders)).statusCode).toBe(200);
  for (const queue of ['overdue', 'complaints', 'checkouts'])
    expect((await read(queue, '', f.managerHeaders, f.branchB)).statusCode).toBe(403);
  await f.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, f.assignmentId),
        eq(managerInventoryGrants.permission, 'stay_manage'),
      ),
    );
  expect((await read('complaints', '', f.managerHeaders)).statusCode).toBe(403);
  await f.connection.db
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(eq(managerAssignments.id, f.assignmentId));
  expect((await read('overdue', '', f.managerHeaders)).statusCode).toBe(403);
  expect((await read('all')).statusCode).toBe(400);
  expect((await read('overdue', '?limit=101')).statusCode).toBe(400);
});
it('OWN-004 / ACC-002: real dashboard metrics are receipt-backed and selected-branch scoped', async () => {
  const response = await f.application.inject({
    url: `/v1/owner/dashboard?branchId=${f.branchA}&month=2026-10`,
    headers: f.ownerHeaders,
  });
  expect(response.statusCode).toBe(200);
  const data = ownerDashboardSchema.parse(response.json());
  const details = data.totals.details;
  expect(details).toBeDefined();
  expect(details?.trend).toHaveLength(6);
  expect(
    (details?.rentCollectedPaisa ?? 0) +
      (details?.transportCollectedPaisa ?? 0) +
      (details?.otherCollectedPaisa ?? 0),
  ).toBe(data.totals.rent.collectedPaisa);
  expect(data.branches).toHaveLength(1);
  const empty = await f.application.inject({
    url: `/v1/owner/dashboard?branchId=${f.branchB}`,
    headers: f.ownerHeaders,
  });
  expect(empty.statusCode).toBe(200);
  expect(empty.json().totals.details).toMatchObject({
    rentCollectedPaisa: 0,
    transportCollectedPaisa: 0,
    salaryDuePaisa: 0,
    transportRequests: 0,
    unreadMessages: 0,
  });
  const denied = await f.application.inject({
    url: `/v1/owner/dashboard?branchId=${f.branchA}`,
    headers: f.managerHeaders,
  });
  expect(denied.statusCode).toBe(403);
});
it('OWN-004: unissued full-month salary appears once without a GET-side financial write', async () => {
  const staffId = randomUUID();
  await f.connection.db.insert(staffMembers).values({
    id: staffId,
    organizationId: f.organizationId,
    branchId: f.branchA,
    fullName: 'Dashboard salary fixture',
    jobTitle: 'cook',
    startsOn: '2026-10-01',
    createdByUserId: f.ownerId,
  });
  await f.connection.db.insert(staffSalaryTerms).values({
    staffId,
    branchId: f.branchA,
    version: 1,
    amountPaisa: 1000000n,
    dueDay: 25,
    effectiveFrom: '2026-10-01',
    createdByUserId: f.ownerId,
  });
  for (let i = 0; i < 2; i++) {
    const response = await f.application.inject({
      url: `/v1/owner/dashboard?branchId=${f.branchA}`,
      headers: f.ownerHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().totals.details.salaryDuePaisa).toBe(1000000);
  }
  expect(
    await f.connection.db.select().from(staffSalaries).where(eq(staffSalaries.staffId, staffId)),
  ).toHaveLength(0);
});
it('OWN-004 / FIN-001: resident financial filters exclude paid rows before pagination and preserve month/scope', async () => {
  const claims = decodeJwt(f.ownerHeaders.authorization.slice(7));
  if (typeof claims.sid !== 'string') throw new Error('Missing owner session');
  const actor = { userId: f.ownerId, sessionId: claims.sid };
  const repository = new ResidentRepository(f.connection.db, () => f.now);
  const query = residentDirectoryQuerySchema.parse({ billing: 'overdue', limit: 1 });
  const first = await repository.directory(actor, f.branchA, query);
  expect(first.data).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const second = await repository.directory(actor, f.branchA, {
    ...query,
    cursor: first.nextCursor ?? undefined,
  });
  expect(second.data).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
  const empty = await repository.directory(actor, f.branchB, query);
  expect(empty.data).toEqual([]);
  const noMonth = await repository.directory(
    actor,
    f.branchA,
    residentDirectoryQuerySchema.parse({ billing: 'due', month: '2020-01' }),
  );
  expect(noMonth.data).toEqual([]);
});
it('OWN-004 / CHG-039: salary-due filter reuses the staff list and excludes not-due terms', async () => {
  const staffId = randomUUID();
  await f.connection.db.insert(staffMembers).values({
    id: staffId,
    organizationId: f.organizationId,
    branchId: f.branchA,
    fullName: 'Due today',
    jobTitle: 'cook',
    startsOn: '2026-10-01',
    createdByUserId: f.ownerId,
  });
  await f.connection.db.insert(staffSalaryTerms).values({
    staffId,
    branchId: f.branchA,
    version: 1,
    amountPaisa: 500000n,
    dueDay: 28,
    effectiveFrom: '2026-10-01',
    createdByUserId: f.ownerId,
  });
  const futureId = randomUUID();
  await f.connection.db.insert(staffMembers).values({
    id: futureId,
    organizationId: f.organizationId,
    branchId: f.branchA,
    fullName: 'Future salary',
    jobTitle: 'cook',
    startsOn: '2026-11-01',
    createdByUserId: f.ownerId,
  });
  await f.connection.db.insert(staffSalaryTerms).values({
    staffId: futureId,
    branchId: f.branchA,
    version: 1,
    amountPaisa: 700000n,
    dueDay: 1,
    effectiveFrom: '2026-11-01',
    createdByUserId: f.ownerId,
  });
  const claims = decodeJwt(f.ownerHeaders.authorization.slice(7));
  if (typeof claims.sid !== 'string') throw new Error('Missing owner session');
  const actor = { userId: f.ownerId, sessionId: claims.sid };
  const page = await f.staffRead.list(actor, f.branchA, { salary: 'due', limit: 1 });
  expect(page.data).toHaveLength(1);
  expect(['Dashboard salary fixture', 'Due today']).toContain(page.data[0]?.fullName);
  expect(page.nextCursor).not.toBeNull();
  // 28 Oct is also due today: both due staff must remain reachable.
  const next = await f.staffRead.list(actor, f.branchA, {
    salary: 'due',
    limit: 1,
    cursor: page.nextCursor,
  });
  expect(next.data).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(next.data[0]?.id).not.toBe(page.data[0]?.id);
  expect((await f.staffRead.list(actor, f.branchB, { salary: 'due' })).data).toEqual([]);
});
it('AUD-009 / OWN-003: real 102-branch owner pagination keeps complete totals and a reachable final branch', async () => {
  const base = f.base;
  await f.connection.db.insert(branches).values(
    Array.from({ length: 100 }, (_, index) => {
      const id = randomUUID();
      return {
        id,
        organizationId: base.organizationId,
        brandId: base.brandId,
        cityId: base.cityId,
        areaId: base.areaId,
        name: 'Queue page ' + String(index).padStart(3, '0'),
        slug: id,
        category: 'boys' as const,
        addressLine: 'Read acceptance fixture',
        location: 'SRID=4326;POINT(73 33)',
      };
    }),
  );
  const first = await f.application.inject({
    method: 'GET',
    url: '/v1/owner/dashboard',
    headers: f.ownerHeaders,
  });
  expect(first.statusCode).toBe(200);
  const page = ownerDashboardSchema.parse(first.json());
  expect(page.branches).toHaveLength(100);
  expect(page.nextCursor).not.toBeNull();
  const second = await f.application.inject({
    method: 'GET',
    url: `/v1/owner/dashboard?cursor=${page.nextCursor}`,
    headers: f.ownerHeaders,
  });
  expect(second.statusCode).toBe(200);
  const end = ownerDashboardSchema.parse(second.json());
  expect(end.branches).toHaveLength(2);
  expect(end.nextCursor).toBeNull();
  expect(end.totals).toEqual(page.totals);
});
