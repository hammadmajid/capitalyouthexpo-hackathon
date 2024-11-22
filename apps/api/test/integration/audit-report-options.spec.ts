import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { managerAssignments, managerInventoryGrants, stays } from '@hsm/db';
import { reportOptionPageSchema } from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';
import { reportPropertyFixture, reportRoomCommand } from './audit-report-property.fixture.js';
const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());
it('RPT-001 / SEC-003 / AUD-010: an authorized report offers bounded actual room names without directory payload', async () => {
  const item = await h.fixture().inventory();
  const response = await h.get(
    `/v1/branches/${item.branchId}/reports/occupancy/options?field=room&limit=1`,
  );
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toEqual({
    branchId: item.branchId,
    type: 'occupancy',
    field: 'room',
    buildingId: null,
    floorId: null,
    data: [{ id: item.roomId, name: '101', detail: null, archived: false }],
    nextCursor: null,
  });
});
it('RPT-001 / SEC-003 / AUD-010: parent options use actual labels, literal search, exact cursors and retained archived identities', async () => {
  const item = await reportPropertyFixture(h);
  const path = `/v1/branches/${item.branchId}/reports/occupancy/options`;
  await h.ok(item.base + '/buildings', { name: 'Literal % block', sortOrder: 0 });
  const list = await h.get(path + '?field=building&limit=1');
  expect(list.statusCode, list.body).toBe(200);
  const page = reportOptionPageSchema.parse(list.json());
  expect(page.data).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const next = await h.get(path + '?field=building&limit=1&cursor=' + page.nextCursor);
  expect(next.statusCode, next.body).toBe(200);
  expect(reportOptionPageSchema.parse(next.json()).data[0]?.id).not.toBe(page.data[0]?.id);
  const literal = await h.get(path + '?field=building&search=' + encodeURIComponent('%'));
  expect(reportOptionPageSchema.parse(literal.json()).data.map((value) => value.name)).toEqual([
    'Literal % block',
  ]);
  expect((await h.get(path + '?field=floor')).statusCode).toBe(400);
  expect((await h.get(path + '?field=room&limit=101')).statusCode).toBe(400);
  expect((await h.get(path + '?field=room&residentId=' + item.roomId)).statusCode).toBe(400);
  const corrected = await reportRoomCommand(h, item, {
    expectedVersion: 1,
    floorId: item.floor.id,
    reason: 'Classify actual fixture room',
  });
  expect(corrected.statusCode, corrected.body).toBe(200);
  const room = await h.get(path + '?field=room&floorId=' + item.floor.id);
  expect(reportOptionPageSchema.parse(room.json()).data).toEqual([
    { id: item.roomId, name: '101', detail: 'Synthetic main building / Ground', archived: false },
  ]);
  await h.ok(item.base + '/floors/' + item.floor.id + '/archive', {
    expectedVersion: 1,
    reason: 'Retain historical floor identity',
  });
  const floor = await h.get(path + '?field=floor&buildingId=' + item.building.id);
  expect(reportOptionPageSchema.parse(floor.json()).data[0]).toMatchObject({
    id: item.floor.id,
    name: 'Ground',
    archived: true,
  });
  const foreign = await reportPropertyFixture(h);
  expect((await h.get(path + '?field=floor&buildingId=' + foreign.building.id)).statusCode).toBe(
    404,
  );
});
it('SEC-003 / RPT-001 / AUD-010: finance-only Manager receives minimal permitted resident facts, with live revocation and no directory expansion', async () => {
  const { item, stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const f = h.fixture(),
    db = f.connection.db;
  const path = `/v1/branches/${item.branchId}/reports/`;
  expect(
    (await h.get(path + 'outstanding-dues/options?field=resident', f.customerBToken)).statusCode,
  ).toBe(403);
  const assignmentId = randomUUID();
  await db.insert(managerAssignments).values({
    id: assignmentId,
    branchId: item.branchId,
    userId: f.customerB,
    appointedByUserId: f.ownerId,
    status: 'active',
    activatedAt: h.clock(),
  });
  await db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'finance_view', grantedAt: h.clock() });
  const [record] = await db
    .select({ residentId: stays.residentId })
    .from(stays)
    .where(eq(stays.id, stay.stayId));
  const options = await h.get(path + 'outstanding-dues/options?field=resident', f.customerBToken);
  expect(options.statusCode, options.body).toBe(200);
  const names = reportOptionPageSchema.parse(options.json());
  expect(names.data).toHaveLength(1);
  expect(names.data[0]?.id).toBe(record?.residentId);
  expect(Object.keys(names.data[0] ?? {}).sort()).toEqual(['archived', 'detail', 'id', 'name']);
  expect(
    (await h.get(`/v1/branches/${item.branchId}/residents`, f.customerBToken)).statusCode,
  ).toBe(403);
  expect(
    (await h.get(path + 'residents/options?field=resident', f.customerBToken)).statusCode,
  ).toBe(403);
  const before = await h.get(path + 'payment-history/options?field=resident', f.customerBToken);
  expect(reportOptionPageSchema.parse(before.json()).data).toEqual([]);
  const [invoice] = await h.invoices(stay.stayId);
  await h.ok(base + '/payments', {
    amountPaisa: rent + 100,
    method: 'cash',
    paidOn: h.date(),
    note: 'Synthetic permitted receipt fact',
    allocations: [{ invoiceId: invoice?.id, amountPaisa: rent }],
    depositPaisa: 100,
    advanceCreditPaisa: 0,
  });
  for (const type of ['payment-history', 'security-deposits']) {
    const payment = await h.get(path + type + '/options?field=resident', f.customerBToken);
    expect(payment.statusCode, payment.body).toBe(200);
    expect(reportOptionPageSchema.parse(payment.json()).data.map((value) => value.id)).toEqual([
      record?.residentId,
    ]);
  }
  await db
    .delete(managerInventoryGrants)
    .where(eq(managerInventoryGrants.assignmentId, assignmentId));
  expect(
    (await h.get(path + 'outstanding-dues/options?field=resident', f.customerBToken)).statusCode,
  ).toBe(403);
  const guest = await f.application.inject({
    url: path + 'outstanding-dues/options?field=resident',
  });
  expect(guest.statusCode).toBe(401);
});
