import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants, staffSalaryPayments } from '@hsm/db';
import {
  staffDashboardSchema,
  staffDetailSchema,
  staffMemberSchema,
  staffPageSchema,
  staffSalarySchema,
} from '@hsm/contracts';
import { lifecycleHarness } from './phase-nine-fixture.js';
// CHG-039 / SRS v2.27 against real PostgreSQL: scope, grants, status, idempotency, concurrency.
const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());
const json = (r: { json: () => unknown }) => r.json() as Record<string, unknown>;
function request(
  method: 'POST' | 'PATCH',
  url: string,
  payload: object,
  token?: string,
  key?: string,
) {
  return h.fixture().application.inject({
    method,
    url,
    headers: {
      authorization: 'Bearer ' + (token ?? h.fixture().ownerToken),
      'Idempotency-Key': key ?? randomUUID(),
    },
    payload,
  });
}
async function makeManager(branchId: string, grants: string[]) {
  const f = h.fixture();
  const [assignment] = await f.connection.db
    .insert(managerAssignments)
    .values({
      id: randomUUID(),
      userId: f.customerA,
      branchId,
      status: 'active',
      appointedByUserId: f.ownerId,
      activatedAt: h.clock(),
    })
    .returning();
  if (!assignment) throw new Error('assignment');
  if (grants.length)
    await f.connection.db
      .insert(managerInventoryGrants)
      .values(grants.map((permission) => ({ assignmentId: assignment.id, permission })));
  return assignment.id;
}
async function setGrants(assignmentId: string, grants: string[]) {
  const db = h.fixture().connection.db;
  await db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  if (grants.length)
    await db
      .insert(managerInventoryGrants)
      .values(grants.map((permission) => ({ assignmentId, permission })));
}
it('CHG-039: Owner adds staff with terms; salary is due on its day, partial, then paid; replay pays once', async () => {
  await h.moveTo('2026-06-25T09:00:00Z');
  const { branchId } = await h.fixture().inventory({ photos: false });
  const base = `/v1/branches/${branchId}/staff`;
  const created = await request('POST', base, {
    fullName: 'Ali Cook',
    phone: '03001234567',
    jobTitle: 'cook',
    startsOn: '2026-05-01',
    salary: { amountPaisa: 3000000, dueDay: 25, effectiveFrom: '2026-06-01' },
  });
  expect(created.statusCode, created.body).toBe(201);
  const staff = staffMemberSchema.parse(created.json());
  expect(staff.phone).toBe('+923001234567');
  const page = staffPageSchema.parse(json(await h.get(base)));
  expect(page.payroll).toBe(true);
  const salary = page.data[0]?.salary;
  expect(salary).toMatchObject({ month: '2026-06-01', amountPaisa: 3000000, timing: 'due' });
  if (!salary) throw new Error('salary');
  const payUrl = `/v1/branches/${branchId}/staff-salaries/${salary.id}/payments`;
  const key = randomUUID();
  const first = await request(
    'POST',
    payUrl,
    { amountPaisa: 1000000, paidOn: '2026-06-25', method: 'cash' },
    undefined,
    key,
  );
  expect(first.statusCode, first.body).toBe(200);
  expect(staffSalarySchema.parse(first.json())).toMatchObject({
    partial: true,
    outstandingPaisa: 2000000,
    timing: 'due',
  });
  const replay = await request(
    'POST',
    payUrl,
    { amountPaisa: 1000000, paidOn: '2026-06-25', method: 'cash' },
    undefined,
    key,
  );
  expect(replay.json()).toEqual(first.json());
  const over = await request('POST', payUrl, {
    amountPaisa: 2500000,
    paidOn: '2026-06-25',
    method: 'cash',
  });
  expect(over.statusCode).toBe(400);
  // Two simultaneous payments of the full remainder: exactly one is recorded.
  const both = await Promise.all(
    [0, 1].map(() =>
      request('POST', payUrl, {
        amountPaisa: 2000000,
        paidOn: '2026-06-25',
        method: 'bank_transfer',
      }),
    ),
  );
  expect(both.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  const payments = await h
    .fixture()
    .connection.db.select()
    .from(staffSalaryPayments)
    .where(eq(staffSalaryPayments.salaryId, salary.id));
  expect(payments).toHaveLength(2);
  const detail = staffDetailSchema.parse(json(await h.get(`${base}/${staff.id}`)));
  expect(detail.staff.salary).toMatchObject({
    timing: 'paid',
    outstandingPaisa: 0,
    partial: false,
  });
  // A reversal is additive; reversing twice is refused.
  const firstPayment = detail.payments.find((p) => p.amountPaisa === 1000000);
  if (!firstPayment) throw new Error('payment');
  const reverseUrl = `/v1/branches/${branchId}/staff-payments/${firstPayment.id}/reversal`;
  const reversed = await request('POST', reverseUrl, { reason: 'Recorded twice by mistake' });
  expect(staffSalarySchema.parse(reversed.json())).toMatchObject({
    outstandingPaisa: 1000000,
    partial: true,
  });
  expect((await request('POST', reverseUrl, { reason: 'Again' })).statusCode).toBe(409);
  // Issued months are never repriced; new terms start from a later month.
  const termsUrl = `${base}/${staff.id}/salary-terms`;
  expect(
    (
      await request('POST', termsUrl, {
        amountPaisa: 3500000,
        dueDay: 5,
        effectiveFrom: '2026-06-01',
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request('POST', termsUrl, {
        amountPaisa: 3500000,
        dueDay: 5,
        effectiveFrom: '2026-07-01',
      })
    ).statusCode,
  ).toBe(200);
  const dashboard = staffDashboardSchema.parse(
    json(await h.get(`/v1/branches/${branchId}/staff-dashboard`)),
  );
  expect(dashboard).toMatchObject({ activeStaff: 1, month: '2026-06-01' });
  expect(dashboard.payroll).toMatchObject({
    partial: 1,
    outstandingPaisa: 1000000,
    expectedPaisa: 3000000,
  });
});
it('CHG-039: Manager grants are off by default, split directory from payroll, and revoke at once', async () => {
  const { branchId } = await h.fixture().inventory({ photos: false });
  const base = `/v1/branches/${branchId}/staff`;
  const owner = await request('POST', base, {
    fullName: 'Sana Guard',
    jobTitle: 'security_guard',
    startsOn: '2026-01-01',
    salary: { amountPaisa: 2500000, dueDay: 1, effectiveFrom: '2026-06-01' },
  });
  const staff = staffMemberSchema.parse(owner.json());
  await request('POST', `${base}/${staff.id}/agreements`, {
    title: 'Security guard terms',
    body: 'Night shift, monthly salary as agreed.',
    effectiveOn: '2026-06-01',
  });
  const manager = h.fixture().customerAToken;
  const assignment = await makeManager(branchId, []);
  expect((await h.get(base, manager)).statusCode).toBe(403);
  await setGrants(assignment, ['staff_manage']);
  const page = staffPageSchema.parse(json(await h.get(base, manager)));
  expect(page.payroll).toBe(false);
  expect(page.data[0]?.salary).toBeNull();
  const detail = staffDetailSchema.parse(json(await h.get(`${base}/${staff.id}`, manager)));
  expect(detail).toMatchObject({ payroll: false, terms: [], salaries: [], payments: [] });
  expect(detail.agreements[0]).toMatchObject({
    title: 'Security guard terms',
    body: null,
    hasFile: false,
  });
  const dashboard = staffDashboardSchema.parse(
    json(await h.get(`/v1/branches/${branchId}/staff-dashboard`, manager)),
  );
  expect(dashboard.payroll).toBeNull();
  const termsUrl = `${base}/${staff.id}/salary-terms`;
  const terms = { amountPaisa: 2600000, dueDay: 2, effectiveFrom: '2026-08-01' };
  expect((await request('POST', termsUrl, terms, manager)).statusCode).toBe(403);
  await setGrants(assignment, ['staff_manage', 'staff_payroll_manage']);
  expect((await request('POST', termsUrl, terms, manager)).statusCode).toBe(200);
  await setGrants(assignment, []);
  expect((await h.get(base, manager)).statusCode).toBe(403);
  expect(
    (await request('POST', termsUrl, { ...terms, effectiveFrom: '2026-09-01' }, manager))
      .statusCode,
  ).toBe(403);
  // A customer with no role on this branch is denied.
  expect((await h.get(base, h.fixture().customerBToken)).statusCode).toBe(403);
  // Deactivation keeps history and bumps the version.
  const ended = await request('POST', `${base}/${staff.id}/status`, {
    expectedVersion: staff.version,
    status: 'ended',
    endsOn: '2026-06-20',
    reason: 'Moved to another city',
  });
  expect(staffMemberSchema.parse(ended.json())).toMatchObject({
    status: 'ended',
    endsOn: '2026-06-20',
    version: 2,
  });
  const stale = await request('PATCH', `${base}/${staff.id}`, {
    expectedVersion: 1,
    fullName: 'Changed',
  });
  expect(stale.statusCode).toBe(409);
  const assignmentRow = await h
    .fixture()
    .connection.db.select()
    .from(managerAssignments)
    .where(and(eq(managerAssignments.id, assignment), eq(managerAssignments.branchId, branchId)));
  expect(assignmentRow).toHaveLength(1);
});
