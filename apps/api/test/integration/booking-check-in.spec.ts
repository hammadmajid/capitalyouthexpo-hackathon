import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  billingPolicies,
  bookings,
  hostelAuditLog,
  inventoryClaims,
  managerAssignments,
  managerInventoryGrants,
  notificationOutbox,
  stayAgreements,
  stayAssignments,
  stayHistory,
  residents,
  stays,
  users,
} from '@hsm/db';
import {
  bookingAdmissionPreviewSchema,
  bookingAdmissionResultSchema,
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
type Item = Awaited<ReturnType<typeof f.inventory>>;
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
const owner = () => ({ authorization: 'Bearer ' + f.ownerToken });
// BR-03: one active hostel per Customer, so close the previous scenario's Stay first.
async function releaseCustomer() {
  const active = await f.connection.db
    .select({ id: stays.id })
    .from(stays)
    .where(and(eq(stays.userId, f.customerA), eq(stays.state, 'active')));
  for (const stay of active)
    await f.connection.db.transaction(async (tx) => {
      const ended = new Date(today + 'T11:00:00Z');
      const assignments = await tx
        .update(stayAssignments)
        .set({ endedAt: ended })
        .where(and(eq(stayAssignments.stayId, stay.id), isNull(stayAssignments.endedAt)))
        .returning({ id: stayAssignments.id });
      for (const assignment of assignments)
        await tx
          .update(inventoryClaims)
          .set({ releasedAt: ended })
          .where(eq(inventoryClaims.assignmentId, assignment.id));
      await tx
        .update(stays)
        .set({ state: 'completed', closedAt: ended, version: 2 })
        .where(eq(stays.id, stay.id));
    });
}
// A confirmed (instant-mode fixture policy) booking starting today, plus a current billing policy.
async function confirmed(item?: Item, bedId?: string) {
  await releaseCustomer();
  const inventory = item ?? (await f.inventory());
  const policyId = randomUUID();
  if (!item)
    await f.connection.db.insert(billingPolicies).values({
      id: policyId,
      branchId: inventory.branchId,
      policy,
      isCurrent: true,
      createdByUserId: f.ownerId,
    });
  const quoted = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: bedId ?? inventory.seatId },
      range: { moveInDate: today, moveOutDate: '2026-11-25' },
    },
  });
  expect(quoted.statusCode, quoted.body).toBe(200);
  const booked = await f.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: {
      ...owner(),
      authorization: 'Bearer ' + f.customerAToken,
      'Idempotency-Key': randomUUID(),
    },
    payload: {
      quote: bookingQuoteSnapshotSchema.parse(quoted.json()),
      documents: [],
      permanentAddress: 'Fixture permanent address',
    },
  });
  expect(booked.statusCode, booked.body).toBe(201);
  const booking = bookingSummarySchema.parse(booked.json());
  expect(booking.state).toBe('confirmed');
  const [current] = await f.connection.db
    .select({ id: billingPolicies.id })
    .from(billingPolicies)
    .where(
      and(eq(billingPolicies.branchId, inventory.branchId), eq(billingPolicies.isCurrent, true)),
    );
  return { inventory, booking, policyVersionId: current?.id ?? policyId };
}
function checkIn(
  branchId: string,
  bookingId: string,
  policyVersionId: string,
  key = randomUUID(),
  token = f.ownerToken,
) {
  return f.application.inject({
    method: 'POST',
    url: `/v1/branches/${branchId}/stays/bookings/${bookingId}/check-in`,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    payload: {
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    },
  });
}
it('STAY-001 / BKG-004 / ACC-001: confirmed booking becomes one active Stay with captured terms and lineage', async () => {
  const { inventory, booking, policyVersionId } = await confirmed();
  const preview = await f.application.inject({
    url: `/v1/branches/${inventory.branchId}/stays/bookings/${booking.id}/terms?policyVersionId=${policyVersionId}`,
    headers: owner(),
  });
  expect(preview.statusCode, preview.body).toBe(200);
  expect(bookingAdmissionPreviewSchema.parse(preview.json()).terms).toMatchObject({
    rentAmountPaisa: booking.quote.price.monthlyRentPaisa,
    depositPaisa: booking.quote.price.depositPaisa,
  });
  const effective = await f.application.inject({
    url: `/v1/branches/${inventory.branchId}/stays/bookings/${booking.id}/terms`,
    headers: owner(),
  });
  expect(bookingAdmissionPreviewSchema.parse(effective.json()).terms.policyVersionId).toBe(
    policyVersionId,
  );
  const key = randomUUID();
  const admitted = await checkIn(inventory.branchId, booking.id, policyVersionId, key);
  expect(admitted.statusCode, admitted.body).toBe(201);
  const result = bookingAdmissionResultSchema.parse(admitted.json());
  expect(result).toMatchObject({ bookingId: booking.id, state: 'active', version: 1 });
  const replay = await checkIn(inventory.branchId, booking.id, policyVersionId, key);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(replay.json()).toEqual(admitted.json());
  expect((await checkIn(inventory.branchId, booking.id, policyVersionId)).statusCode).toBe(409);
  const [stay] = await f.connection.db.select().from(stays).where(eq(stays.id, result.stayId));
  expect(stay).toMatchObject({
    source: 'booking',
    bookingId: booking.id,
    userId: f.customerA,
    state: 'active',
  });
  const [agreement] = await f.connection.db
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.stayId, result.stayId));
  expect(agreement?.bookingSnapshot).toEqual(booking.quote);
  expect(agreement?.rentAmountPaisa).toBe(BigInt(booking.quote.price.monthlyRentPaisa));
  const claims = await f.connection.db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.roomId, inventory.roomId), isNull(inventoryClaims.releasedAt)));
  expect(claims).toHaveLength(1);
  expect(claims[0]).toMatchObject({ assignmentId: result.assignmentId, bookingId: null });
  const [history] = await f.connection.db
    .select()
    .from(stayHistory)
    .where(eq(stayHistory.stayId, result.stayId));
  expect(history).toMatchObject({ reasonCode: 'booking_check_in' });
  expect(
    await f.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, result.stayId),
          eq(hostelAuditLog.action, 'resident.booking.checked_in'),
        ),
      ),
  ).toHaveLength(1);
  expect(
    await f.connection.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          sql`${notificationOutbox.payload}->>'stayId' = ${result.stayId}`,
          eq(notificationOutbox.eventType, 'resident.lifecycle'),
        ),
      ),
  ).toHaveLength(1);
  // RENT-001: the first invoice issued at check-in announces rent due exactly once.
  expect(
    await f.connection.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          sql`${notificationOutbox.payload}->>'stayId' = ${result.stayId}`,
          eq(notificationOutbox.eventType, 'resident.rent'),
        ),
      ),
  ).toHaveLength(1);
  // The booking cannot be cancelled once it became an actual Stay.
  const cancel = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/bookings/${booking.id}/cancel`,
    headers: { ...owner(), 'Idempotency-Key': randomUUID() },
    payload: { reason: 'Late cancellation' },
  });
  expect(cancel.statusCode).toBe(409);
});
it('ACC-001: concurrent staff check-ins create exactly one Stay; manual admission cannot take the reserved bed', async () => {
  const { inventory, booking, policyVersionId } = await confirmed();
  const manual = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/stays/manual`,
    headers: { ...owner(), 'Idempotency-Key': randomUUID() },
    payload: {
      manual: {
        resident: { kind: 'new', profile: { displayName: 'Walk-in competitor' } },
        target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
        period: { moveInDate: today, expectedLeaveDate: '2026-11-25' },
        terms: (
          await f.application.inject({
            url: `/v1/branches/${inventory.branchId}/stays/bookings/${booking.id}/terms?policyVersionId=${policyVersionId}`,
            headers: owner(),
          })
        ).json().terms,
      },
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    },
  });
  expect(manual.statusCode, manual.body).toBe(409);
  const results = await Promise.all([
    checkIn(inventory.branchId, booking.id, policyVersionId),
    checkIn(inventory.branchId, booking.id, policyVersionId),
  ]);
  expect(results.map((value) => value.statusCode).sort()).toEqual([201, 409]);
  expect(
    await f.connection.db.select().from(stays).where(eq(stays.bookingId, booking.id)),
  ).toHaveLength(1);
});
it('ACC-002 / CHG-010: Managers need stay, rent and finance grants live, including on replay', async () => {
  const { inventory, booking, policyVersionId } = await confirmed(),
    assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  try {
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'stay_manage', grantedAt: f.now });
    expect(
      (
        await checkIn(
          inventory.branchId,
          booking.id,
          policyVersionId,
          randomUUID(),
          f.customerBToken,
        )
      ).statusCode,
    ).toBe(403);
    await f.connection.db.insert(managerInventoryGrants).values(
      (['rent_manage', 'finance_view'] as const).map((permission) => ({
        assignmentId,
        permission,
        grantedAt: f.now,
      })),
    );
    const key = randomUUID();
    expect(
      (await checkIn(inventory.branchId, booking.id, policyVersionId, key, f.customerBToken))
        .statusCode,
    ).toBe(201);
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(
        and(
          eq(managerInventoryGrants.assignmentId, assignmentId),
          eq(managerInventoryGrants.permission, 'finance_view'),
        ),
      );
    expect(
      (await checkIn(inventory.branchId, booking.id, policyVersionId, key, f.customerBToken))
        .statusCode,
    ).toBe(403);
    const other = await f.inventory();
    expect(
      (await checkIn(other.branchId, booking.id, policyVersionId, randomUUID(), f.customerBToken))
        .statusCode,
    ).toBe(403);
  } finally {
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated', deactivatedAt: f.now })
      .where(eq(managerAssignments.id, assignmentId));
  }
});
it('AUD-004 / BKG-004: a failed required write rolls back everything; stale policy versions are refused', async () => {
  const { inventory, booking, policyVersionId } = await confirmed();
  expect((await checkIn(inventory.branchId, booking.id, randomUUID())).statusCode).toBe(409);
  await f.connection.db.execute(
    sql`create function hsm_test_check_in_failure() returns trigger language plpgsql as $$ begin if NEW.reason_code = 'booking_check_in' then raise exception 'Fixture history failure' using errcode = '23514'; end if; return NEW; end; $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_test_check_in_failure before insert on stay_history for each row execute function hsm_test_check_in_failure()`,
  );
  try {
    expect(
      (await checkIn(inventory.branchId, booking.id, policyVersionId)).statusCode,
    ).toBeGreaterThanOrEqual(400);
  } finally {
    await f.connection.db.execute(sql`drop trigger hsm_test_check_in_failure on stay_history`);
    await f.connection.db.execute(sql`drop function hsm_test_check_in_failure()`);
  }
  expect(
    await f.connection.db.select().from(stays).where(eq(stays.bookingId, booking.id)),
  ).toHaveLength(0);
  const reservation = await f.connection.db
    .select()
    .from(inventoryClaims)
    .where(and(eq(inventoryClaims.bookingId, booking.id), isNull(inventoryClaims.releasedAt)));
  expect(reservation).toHaveLength(1);
  const [stored] = await f.connection.db.select().from(bookings).where(eq(bookings.id, booking.id));
  expect(stored?.state).toBe('confirmed');
  expect((await checkIn(inventory.branchId, booking.id, policyVersionId)).statusCode).toBe(201);
});
it('CHG-054: check-in uses the CNIC on the customer account; otherwise the one typed here', async () => {
  const { inventory, booking, policyVersionId } = await confirmed();
  const [account] = await f.connection.db
    .select({ last4: users.cnicLast4 })
    .from(users)
    .where(eq(users.id, f.customerA));
  const preview = await f.application.inject({
    url: `/v1/branches/${inventory.branchId}/stays/bookings/${booking.id}/terms`,
    headers: owner(),
  });
  expect(bookingAdmissionPreviewSchema.parse(preview.json()).cnicOnFile).toBe(
    Boolean(account?.last4),
  );
  const response = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${inventory.branchId}/stays/bookings/${booking.id}/check-in`,
    headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() },
    payload: {
      policyVersionId,
      cnic: '61101-7654321-9',
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  const { residentId } = bookingAdmissionResultSchema.parse(response.json());
  const [resident] = await f.connection.db
    .select({ last4: residents.cnicLast4 })
    .from(residents)
    .where(eq(residents.id, residentId));
  // The account's own CNIC wins; the typed one fills in only when none is on file.
  expect(resident?.last4).toBe(account?.last4 ?? '3219');
});
