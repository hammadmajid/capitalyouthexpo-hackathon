import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { residentPayments, rooms, seats, stays } from '@hsm/db';
import { propertyBuildingSchema, propertyFloorSchema } from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';
import { reportRoomCommand } from './audit-report-property.fixture.js';
import { authorizeReportFilters } from '../../src/insights/report-filter-scope.js';
import {
  paymentAssignmentBoundary,
  reportAssignmentPredicate,
  reportResidentPredicate,
  reportRoomPredicate,
  reportSnapshotPredicate,
} from '../../src/insights/report-filter-predicates.js';
import { reportEndExclusive } from '../../src/insights/report-calendar.js';
import {
  createReportFilterFacts,
  reportFilterReader,
  verifyReportFilterFamilies,
} from './audit-report-filters.fixture.js';

const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());
it('RPT-001 / AUD-010: a valid room filter narrows real occupancy report totals', async () => {
  const item = await h.fixture().inventory();
  const response = await h.get(
    `/v1/branches/${item.branchId}/reports/occupancy?roomId=${item.roomId}&status=available`,
  );
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toMatchObject({
    rows: [['Approved integration fixture', h.date(), '2', '0', '2', '0', '0', '0.0']],
  });
});
it('RPT-001 / RES-005 / AUD-010: real assignment predicates retain historical room, parent and resident scope across transfers', async () => {
  const { item, stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const db = h.fixture().connection.db;
  const propertyBase = `/v1/branches/${item.branchId}/property`;
  const building = propertyBuildingSchema.parse(
    await h.ok(propertyBase + '/buildings', { name: 'Actual report block', sortOrder: 0 }),
  );
  const oldFloor = propertyFloorSchema.parse(
    await h.ok(propertyBase + '/floors', {
      buildingId: building.id,
      label: 'Ground',
      levelNumber: 0,
    }),
  );
  const newFloor = propertyFloorSchema.parse(
    await h.ok(propertyBase + '/floors', {
      buildingId: building.id,
      label: 'First',
      levelNumber: 1,
    }),
  );
  const corrected = await reportRoomCommand(
    h,
    { base: propertyBase, roomId: item.roomId },
    { expectedVersion: 1, floorId: oldFloor.id, reason: 'Classify fixture location' },
  );
  expect(corrected.statusCode, corrected.body).toBe(200);
  const roomId = randomUUID(),
    bedId = randomUUID();
  await db.insert(rooms).values({
    id: roomId,
    branchId: item.branchId,
    roomTypeId: item.roomTypeId,
    label: 'Second room',
    floorId: newFloor.id,
    status: 'active',
  });
  await db.insert(seats).values({
    id: bedId,
    branchId: item.branchId,
    roomId,
    label: 'A',
    ordinal: 1,
    status: 'active',
  });
  await createReportFilterFacts(h, item.branchId, stay.stayId);
  const selected = async (predicate: ReturnType<typeof reportSnapshotPredicate>) =>
    db
      .select({ id: stays.id })
      .from(stays)
      .where(and(eq(stays.id, stay.stayId), predicate));
  await db.transaction(async (tx) => {
    await authorizeReportFilters(tx, [item.branchId], {
      buildingId: building.id,
      floorId: oldFloor.id,
      roomId: item.roomId,
    });
    await expect(
      authorizeReportFilters(tx, [item.branchId], { floorId: oldFloor.id, roomId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  await h.moveTo('2026-06-26T19:00:00.000Z');
  const moved = await h.fixture().application.inject({
    method: 'POST',
    url: base + '/transfer',
    headers: {
      authorization: 'Bearer ' + h.fixture().ownerToken,
      'Idempotency-Key': randomUUID(),
    },
    payload: {
      expectedVersion: await h.version(stay.stayId),
      target: { kind: 'bed', roomId, bedId },
      reason: 'Synthetic midnight transfer',
    },
  });
  expect(moved.statusCode, moved.body).toBe(200);
  expect(
    await selected(
      reportSnapshotPredicate(stays.branchId, stays.id, { roomId: item.roomId }, '2026-06-26'),
    ),
  ).toHaveLength(1);
  expect(
    await selected(reportSnapshotPredicate(stays.branchId, stays.id, { roomId }, '2026-06-26')),
  ).toHaveLength(0);
  expect(
    await selected(reportSnapshotPredicate(stays.branchId, stays.id, { roomId }, '2026-06-27')),
  ).toHaveLength(1);

  expect(
    await selected(
      reportSnapshotPredicate(stays.branchId, stays.id, { floorId: oldFloor.id }, '2026-06-26'),
    ),
  ).toHaveLength(1);
  expect(
    await selected(
      reportSnapshotPredicate(stays.branchId, stays.id, { floorId: newFloor.id }, '2026-06-26'),
    ),
  ).toHaveLength(0);
  expect(
    await selected(
      reportSnapshotPredicate(stays.branchId, stays.id, { buildingId: building.id }, '2026-06-27'),
    ),
  ).toHaveLength(1);
  const [residentStay] = await db
    .select({ residentId: stays.residentId })
    .from(stays)
    .where(eq(stays.id, stay.stayId));
  expect(residentStay).toBeDefined();
  expect(
    await selected(reportResidentPredicate(stays.branchId, stays.id, residentStay?.residentId)),
  ).toHaveLength(1);
  expect(
    await selected(reportResidentPredicate(stays.branchId, stays.id, randomUUID())),
  ).toHaveLength(0);
  // A forged outer branch never correlates to another branch's room/assignment.
  expect(
    await selected(
      reportAssignmentPredicate(
        sql`${randomUUID()}::uuid`,
        stays.id,
        { roomId },
        reportEndExclusive('2026-06-27'),
      ),
    ),
  ).toHaveLength(0);
  const physical = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(
      and(
        eq(rooms.branchId, item.branchId),
        reportRoomPredicate(rooms.branchId, rooms.id, { floorId: oldFloor.id }),
      ),
    );
  expect(physical).toEqual([{ id: item.roomId }]);
  const [invoice] = await h.invoices(stay.stayId);
  await h.ok(base + '/payments', {
    amountPaisa: rent,
    method: 'cash',
    paidOn: '2026-06-26',
    note: 'Synthetic date-only payment',
    allocations: [{ invoiceId: invoice?.id, amountPaisa: rent - 100 }],
    depositPaisa: 100,
    advanceCreditPaisa: 0,
  });
  const payments = (location: string) =>
    db
      .select({ id: residentPayments.id })
      .from(residentPayments)
      .where(
        and(
          eq(residentPayments.stayId, stay.stayId),
          reportAssignmentPredicate(
            residentPayments.branchId,
            residentPayments.stayId,
            { roomId: location },
            paymentAssignmentBoundary(residentPayments.paidOn),
          ),
        ),
      );
  expect(await payments(item.roomId)).toHaveLength(1);
  expect(await payments(roomId)).toHaveLength(0);
  await verifyReportFilterFamilies(
    h,
    item,
    roomId,
    residentStay?.residentId ?? '',
    building.id,
    oldFloor.id,
  );
  // A later transfer must not rewrite the date-only payment's room classification.
  await h.moveTo('2026-06-28T07:00:00Z');
  const returned = await h.send(base + '/transfer', {
    expectedVersion: await h.version(stay.stayId),
    target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
    reason: 'Synthetic later transfer back',
  });
  expect(returned.statusCode, returned.body).toBe(200);
  expect(await payments(item.roomId)).toHaveLength(1);
  expect(
    await selected(reportSnapshotPredicate(stays.branchId, stays.id, { roomId }, '2026-06-27')),
  ).toHaveLength(1);
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Synthetic historical checkout',
    applyAvailableDeposit: true,
  });
  const read = reportFilterReader(h, item.branchId);
  expect(
    (await read('checkout-history', 'roomId=' + item.roomId + '&status=completed')).rows,
  ).toHaveLength(1);
  expect((await read('checkout-history', 'roomId=' + roomId)).rows).toHaveLength(0);
});
