import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { billingPolicies, managerAssignments, managerInventoryGrants } from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  occupancyPageSchema,
  bedOccupancySchema,
  bedOccupancyHistoryPageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
const today = '2026-10-25';
beforeAll(async () => {
  f = await phaseTwoFixture(new Date(today + 'T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'disabled',
};
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
async function post(url: string, payload: Record<string, unknown>, token = f.ownerToken) {
  const response = await f.application.inject({
    method: 'POST',
    url,
    headers: { ...bearer(token), 'Idempotency-Key': randomUUID() },
    payload,
  });
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response.json() as unknown;
}
async function occupancy(branchId: string, token = f.ownerToken, query = '') {
  return f.application.inject({
    url: `/v1/branches/${branchId}/occupancy${query}`,
    headers: bearer(token),
  });
}
async function read(branchId: string, query = '') {
  const response = await occupancy(branchId, f.ownerToken, query);
  expect(response.statusCode, response.body).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const page = occupancyPageSchema.parse(response.json());
  const beds = new Map(page.data.flatMap((room) => room.beds.map((bed) => [bed.id, bed])));
  return { page, beds };
}
it('BED-001 / STAY-001 / ACC-001: live claims drive occupancy; a reservation is never occupied', async () => {
  const item = await f.inventory();
  const empty = await read(item.branchId);
  expect(empty.page.on).toBe(today);
  expect(empty.page.totals.available).toBe(empty.page.totals.beds);
  expect(empty.beds.get(item.seatId)?.state).toBe('available');
  const policyVersionId = randomUUID();
  await f.connection.db.insert(billingPolicies).values({
    id: policyVersionId,
    branchId: item.branchId,
    policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  const quote = bookingQuoteSnapshotSchema.parse(
    await post(`/v1/marketplace/${item.branchId}/quote`, {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: today, moveOutDate: '2026-11-25' },
    }),
  );
  const booking = bookingSummarySchema.parse(
    await post(
      `/v1/marketplace/${item.branchId}/bookings`,
      { quote, documents: [], permanentAddress: 'Fixture permanent address' },
      f.customerAToken,
    ),
  );
  expect(booking.state).toBe('confirmed');
  const reserved = await read(item.branchId);
  expect(reserved.beds.get(item.seatId)).toMatchObject({ state: 'reserved', occupant: null });
  expect(reserved.page.totals).toMatchObject({ occupied: 0, reserved: 1 });
  // CHG-048: each room carries its building and floor (null when not placed yet).
  expect(
    reserved.page.data.every((room) => room.building !== undefined && room.floor !== undefined),
  ).toBe(true);
  // BED-002 / CHG-048: the day before move-in, the booking is listed as coming next.
  const before = await f.application.inject({
    url: `/v1/branches/${item.branchId}/occupancy/beds/${item.seatId}?on=2026-10-24`,
    headers: bearer(f.ownerToken),
  });
  expect(before.statusCode, before.body).toBe(200);
  expect(bedOccupancySchema.parse(before.json()).upcoming).toEqual([
    expect.objectContaining({ source: 'booking', bookingId: booking.id, moveInDate: today }),
  ]);
  // BED-001: the date query reads the same claims on another day.
  expect((await read(item.branchId, '?on=2026-11-25')).beds.get(item.seatId)?.state).toBe(
    'available',
  );
  await post(`/v1/branches/${item.branchId}/inventory/blocks`, {
    target: { kind: 'bed', roomId: item.roomId, bedId: item.otherSeatId },
    range: { moveInDate: today, moveOutDate: '2026-10-28' },
    kind: 'maintenance',
    reason: 'Private block note',
  });
  const blocked = await read(item.branchId);
  expect(blocked.beds.get(item.otherSeatId)?.state).toBe('blocked');
  const admitted = (await post(
    `/v1/branches/${item.branchId}/stays/bookings/${booking.id}/check-in`,
    { policyVersionId, initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }] },
  )) as { stayId: string };
  const occupied = await read(item.branchId);
  expect(occupied.beds.get(item.seatId)).toMatchObject({
    state: 'occupied',
    occupant: { stayId: admitted.stayId },
  });
  expect(occupied.page.totals).toMatchObject({ occupied: 1, reserved: 0, blocked: 1 });
  // CHG-052: admitted today, so the first bill is due today (not already overdue).
  expect(occupied.beds.get(item.seatId)?.rentStatus).toBe('due');
  // PAY-004 / SERV-002 (CHG-048): staff lists narrow to the bed's Stay.
  for (const url of [
    `/v1/branches/${item.branchId}/payment-proofs?stayId=${admitted.stayId}`,
    `/v1/branches/${item.branchId}/transport/subscriptions?stayId=${admitted.stayId}`,
  ]) {
    const narrowed = await f.application.inject({ url, headers: bearer(f.ownerToken) });
    expect(narrowed.statusCode, narrowed.body).toBe(200);
    expect((narrowed.json() as { data: unknown[] }).data).toEqual([]);
  }
  expect((await read(item.branchId)).beds.get(item.otherSeatId)?.rentStatus).toBeNull();

  expect(JSON.stringify(occupied.page)).not.toContain('Private block note');
  const history = await f.application.inject({
    url: `/v1/branches/${item.branchId}/occupancy/beds/${item.seatId}/history`,
    headers: bearer(f.ownerToken),
  });
  expect(history.statusCode, history.body).toBe(200);
  expect(history.headers['cache-control']).toBe('no-store');
  const page = bedOccupancyHistoryPageSchema.parse(history.json());
  expect(page.data).toHaveLength(1);
  expect(page.data[0]?.stayId).toBe(admitted.stayId);
  const denied = await f.application.inject({
    url: `/v1/branches/${item.branchId}/occupancy/beds/${item.seatId}/history`,
    headers: bearer(f.customerAToken),
  });
  expect(denied.statusCode).toBe(403);
});
it('RES-004 / ACC-002: occupancy needs a live stay_manage grant in the exact branch', async () => {
  const item = await f.inventory(),
    foreign = await f.inventory(),
    assignmentId = randomUUID();
  expect((await occupancy(item.branchId, f.customerAToken)).statusCode).toBe(403);
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  const historyStatus = async (branchId = item.branchId, bedId = item.seatId) =>
    (
      await f.application.inject({
        url: `/v1/branches/${branchId}/occupancy/beds/${bedId}/history`,
        headers: bearer(f.customerBToken),
      })
    ).statusCode;
  try {
    expect(await historyStatus()).toBe(403);
    expect((await occupancy(item.branchId, f.customerBToken)).statusCode).toBe(403);
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'stay_manage', grantedAt: f.now });
    expect((await occupancy(item.branchId, f.customerBToken)).statusCode).toBe(200);
    expect(await historyStatus()).toBe(200);
    expect(await historyStatus(foreign.branchId, foreign.seatId)).toBe(403);
    expect(await historyStatus(item.branchId, foreign.seatId)).toBe(404);
    expect((await occupancy(foreign.branchId, f.customerBToken)).statusCode).toBe(403);
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(
        and(
          eq(managerInventoryGrants.assignmentId, assignmentId),
          eq(managerInventoryGrants.permission, 'stay_manage'),
        ),
      );
    expect((await occupancy(item.branchId, f.customerBToken)).statusCode).toBe(403);
    expect(await historyStatus()).toBe(403);
    expect((await occupancy(item.branchId, f.ownerToken, '?limit=51')).statusCode).toBe(400);
  } finally {
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId));
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated' })
      .where(eq(managerAssignments.id, assignmentId));
  }
});
