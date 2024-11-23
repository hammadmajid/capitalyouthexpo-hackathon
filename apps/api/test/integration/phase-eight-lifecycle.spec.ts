import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  billingPolicies,
  inventoryClaims,
  managerAssignments,
  managerInventoryGrants,
  residentBillingSchedules,
  stayAssignments,
  stayFinalStatements,
  stays,
} from '@hsm/db';
import {
  bookingAdmissionResultSchema,
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  occupancyPageSchema,
  staySettlementSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
const today = '2026-10-25';
// Lifecycle acts need real elapsed time between assignments; each step advances a minute.
let at = new Date(today + 'T10:00:00Z');
function tick() {
  at = new Date(at.getTime() + 60000);
}
beforeAll(async () => {
  f = await phaseTwoFixture(new Date(at.getTime()), () => new Date(at.getTime()));
});
afterAll(async () => {
  await f?.close();
});
const policy = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'disabled',
};
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
function send(
  url: string,
  payload: Record<string, unknown>,
  token = f.ownerToken,
  key = randomUUID(),
) {
  tick();
  return f.application.inject({
    method: 'POST',
    url,
    headers: { ...bearer(token), 'Idempotency-Key': key },
    payload,
  });
}
async function ok(url: string, payload: Record<string, unknown>, token = f.ownerToken) {
  const response = await send(url, payload, token);
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response.json() as Record<string, unknown>;
}
async function get(url: string, token = f.ownerToken) {
  return f.application.inject({ url, headers: bearer(token) });
}
async function admitted() {
  const item = await f.inventory(),
    policyVersionId = randomUUID();
  await f.connection.db.insert(billingPolicies).values({
    id: policyVersionId,
    branchId: item.branchId,
    policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  const quote = bookingQuoteSnapshotSchema.parse(
    await ok(`/v1/marketplace/${item.branchId}/quote`, {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: today, moveOutDate: '2026-12-25' },
    }),
  );
  const booking = bookingSummarySchema.parse(
    await ok(
      `/v1/marketplace/${item.branchId}/bookings`,
      { quote, documents: [], permanentAddress: 'Fixture permanent address' },
      f.customerAToken,
    ),
  );
  const stay = bookingAdmissionResultSchema.parse(
    await ok(`/v1/branches/${item.branchId}/stays/bookings/${booking.id}/check-in`, {
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    }),
  );
  return { item, stay, rent: quote.price.monthlyRentPaisa };
}
async function version(stayId: string) {
  const [row] = await f.connection.db
    .select({ version: stays.version })
    .from(stays)
    .where(eq(stays.id, stayId));
  return row?.version ?? 0;
}
async function beds(branchId: string) {
  const page = occupancyPageSchema.parse((await get(`/v1/branches/${branchId}/occupancy`)).json());
  return new Map(page.data.flatMap((room) => room.beds.map((bed) => [bed.id, bed.state])));
}
it('RES-005 / OUT-001..006 / ACC-001: transfer, notice, settlement, checkout and Past Stay', async () => {
  const { item, stay, rent } = await admitted();
  const base = `/v1/branches/${item.branchId}/stays/${stay.stayId}`;
  // RES-005: transfer to the other bed in one transaction; history keeps both assignments.
  const moved = await ok(base + '/transfer', {
    expectedVersion: await version(stay.stayId),
    target: { kind: 'bed', roomId: item.roomId, bedId: item.otherSeatId },
    reason: 'Requested quieter bed',
  });
  expect(moved).toMatchObject({ stayId: stay.stayId, bedId: item.otherSeatId });
  let state = await beds(item.branchId);
  expect(state.get(item.seatId)).toBe('available');
  expect(state.get(item.otherSeatId)).toBe('occupied');
  const assignments = await f.connection.db
    .select()
    .from(stayAssignments)
    .where(eq(stayAssignments.stayId, stay.stayId));
  expect(assignments).toHaveLength(2);
  expect(assignments.filter((row) => row.endedAt === null)).toHaveLength(1);
  // A reservation on the old bed now blocks a transfer back (ACC-001).
  const quote = bookingQuoteSnapshotSchema.parse(
    await ok(`/v1/marketplace/${item.branchId}/quote`, {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: today, moveOutDate: '2026-11-25' },
    }),
  );
  await ok(
    `/v1/marketplace/${item.branchId}/bookings`,
    { quote, documents: [], permanentAddress: 'Fixture permanent address' },
    f.customerBToken,
  );
  const back = await send(base + '/transfer', {
    expectedVersion: await version(stay.stayId),
    target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
    reason: 'Back again',
  });
  expect(back.statusCode, back.body).toBe(409);
  expect((await beds(item.branchId)).get(item.otherSeatId)).toBe('occupied');
  // Stale version and same-bed transfers are refused.
  expect(
    (
      await send(base + '/transfer', {
        expectedVersion: 99,
        target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
        reason: 'x',
      })
    ).statusCode,
  ).toBe(409);
  // Extension moves the departure and the claim together.
  const extended = await ok(base + '/extension', {
    expectedVersion: await version(stay.stayId),
    expectedLeaveDate: '2027-01-25',
    reason: 'Semester extended',
  });
  expect(extended).toMatchObject({ expectedLeaveDate: '2027-01-25' });
  const [claim] = await f.connection.db
    .select()
    .from(inventoryClaims)
    .where(
      and(
        eq(inventoryClaims.assignmentId, String(moved.toAssignmentId)),
        isNull(inventoryClaims.releasedAt),
      ),
    );
  expect(claim?.moveOutDate).toBe('2027-01-25');
  // OUT-001/002: the resident's notice changes state but never releases the bed.
  const notice = await send(
    `/v1/me/stays/${stay.stayId}/checkout-request`,
    {
      expectedVersion: await version(stay.stayId),
      requestedCheckoutDate: '2026-11-30',
      isEmergency: false,
    },
    f.customerAToken,
  );
  expect(notice.statusCode, notice.body).toBeLessThan(300);
  expect((await beds(item.branchId)).get(item.otherSeatId)).toBe('occupied');
  // A payment carrying a deposit gives the settlement a fund source.
  const payment = await ok(`${base}/payments`, {
    amountPaisa: 50000,
    method: 'cash',
    paidOn: today,
    note: 'Deposit received in cash',
    allocations: [],
    depositPaisa: 50000,
    advanceCreditPaisa: 0,
  });
  const live = staySettlementSchema.parse((await get(base + '/settlement')).json());
  expect(live).toMatchObject({ outstandingPaisa: rent, deposit: { heldPaisa: 50000 } });
  expect(live.fundSources).toEqual([
    expect.objectContaining({ paymentId: payment.paymentId, depositPaisa: 50000 }),
  ]);
  expect(live.netPayablePaisa).toBe(rent - 50000);
  const own = staySettlementSchema.parse(
    (await get(`/v1/me/stays/${stay.stayId}/settlement`, f.customerAToken)).json(),
  );
  expect(own.outstandingPaisa).toBe(rent);
  expect((await get(`/v1/me/stays/${stay.stayId}/settlement`, f.customerBToken)).statusCode).toBe(
    404,
  );
  // OUT-003/004: deduction needs a reason; it cannot exceed the deposit held.
  expect(
    (
      await send(`${base}/fund-movements`, {
        paymentId: payment.paymentId,
        movement: { kind: 'deposit_deduct', amountPaisa: 60000, reason: 'Too much' },
      })
    ).statusCode,
  ).toBe(409);
  await ok(`${base}/fund-movements`, {
    paymentId: payment.paymentId,
    movement: { kind: 'deposit_deduct', amountPaisa: 20000, reason: 'Broken chair' },
  });
  const afterDeduct = staySettlementSchema.parse((await get(base + '/settlement')).json());
  expect(afterDeduct.deposit).toMatchObject({ deductedPaisa: 20000, heldPaisa: 30000 });
  // OUT-006: checkout commits atomically; the bed is released and billing stops.
  const key = randomUUID();
  const checkout = await send(
    base + '/checkout',
    { expectedVersion: await version(stay.stayId), reason: 'Left', applyAvailableDeposit: false },
    f.ownerToken,
    key,
  );
  expect(checkout.statusCode, checkout.body).toBe(200);
  const replay = await send(
    base + '/checkout',
    {
      expectedVersion: (await version(stay.stayId)) - 1,
      reason: 'Left',
      applyAvailableDeposit: false,
    },
    f.ownerToken,
    key,
  );
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(
    (
      await send(base + '/checkout', {
        expectedVersion: await version(stay.stayId),
        reason: 'Again',
        applyAvailableDeposit: false,
      })
    ).statusCode,
  ).toBe(409);
  state = await beds(item.branchId);
  expect(state.get(item.otherSeatId)).toBe('available');
  const [closed] = await f.connection.db.select().from(stays).where(eq(stays.id, stay.stayId));
  expect(closed).toMatchObject({ state: 'completed' });
  const schedules = await f.connection.db
    .select()
    .from(residentBillingSchedules)
    .where(eq(residentBillingSchedules.stayId, stay.stayId));
  expect(schedules.every((row) => !['active', 'manual_required'].includes(row.state))).toBe(true);
  expect(
    await f.connection.db
      .select()
      .from(stayFinalStatements)
      .where(eq(stayFinalStatements.stayId, stay.stayId)),
  ).toHaveLength(1);
  // Recorded refund after checkout; the frozen statement does not change.
  await ok(`${base}/fund-movements`, {
    paymentId: payment.paymentId,
    movement: {
      kind: 'deposit_refund',
      amountPaisa: 30000,
      reason: 'Refund of remaining deposit',
      externalReference: 'BANK-REF-9',
    },
  });
  const statement = (
    await get(`/v1/me/stays/${stay.stayId}/final-statement`, f.customerAToken)
  ).json();
  expect(statement).toMatchObject({
    statement: { stayState: 'completed', deposit: { heldPaisa: 30000, refundedPaisa: 0 } },
  });
  expect(
    (await get(`/v1/me/stays/${stay.stayId}/final-statement`, f.customerBToken)).statusCode,
  ).toBe(404);
  const pastStays = (await get('/v1/me/stays?state=completed', f.customerAToken)).json() as {
    data: { id: string }[];
  };
  expect(pastStays.data.map((row) => row.id)).toContain(stay.stayId);
});
it('CHG-010 / ACC-002: lifecycle acts need their own live grants in the exact branch', async () => {
  const { item, stay } = await admitted();
  const base = `/v1/branches/${item.branchId}/stays/${stay.stayId}`;
  const foreign = await f.inventory();
  expect(
    (
      await send(`/v1/branches/${foreign.branchId}/stays/${stay.stayId}/checkout`, {
        expectedVersion: 1,
        reason: 'x',
        applyAvailableDeposit: false,
      })
    ).statusCode,
  ).toBe(404);
  const assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  try {
    await f.connection.db.insert(managerInventoryGrants).values([
      { assignmentId, permission: 'stay_manage', grantedAt: f.now },
      { assignmentId, permission: 'finance_view', grantedAt: f.now },
    ]);
    const body = {
      expectedVersion: await version(stay.stayId),
      reason: 'x',
      applyAvailableDeposit: false,
    };
    expect((await send(base + '/checkout', body, f.customerBToken)).statusCode).toBe(403);
    expect((await get(base + '/settlement', f.customerBToken)).statusCode).toBe(200);
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'checkout_manage', grantedAt: f.now });
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(
        and(
          eq(managerInventoryGrants.assignmentId, assignmentId),
          eq(managerInventoryGrants.permission, 'finance_view'),
        ),
      );
    expect((await send(base + '/checkout', body, f.customerBToken)).statusCode).toBe(403);
    expect((await get(base + '/settlement', f.customerBToken)).statusCode).toBe(403);
    expect((await get(base + '/final-statement')).statusCode).toBe(404);
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
