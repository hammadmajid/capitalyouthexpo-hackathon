import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  billingPolicies,
  managerAssignments,
  managerInventoryGrants,
  notificationOutbox,
  residentInvoices,
} from '@hsm/db';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import {
  bookingAdmissionResultSchema,
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  rentBoardPageSchema,
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
  graceDays: 3,
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
// STAY-001 → RENT-001: a confirmed booking checked in with its first rent period billed.
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
    await post(`/v1/marketplace/${item.branchId}/quote`, {
      target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
      range: { moveInDate: today, moveOutDate: '2026-12-25' },
    }),
  );
  const booking = bookingSummarySchema.parse(
    await post(
      `/v1/marketplace/${item.branchId}/bookings`,
      { quote, documents: [], permanentAddress: 'Fixture permanent address' },
      f.customerAToken,
    ),
  );
  const result = bookingAdmissionResultSchema.parse(
    await post(`/v1/branches/${item.branchId}/stays/bookings/${booking.id}/check-in`, {
      policyVersionId,
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
    }),
  );
  return { item, result, quote };
}
it('RENT-001 / RB-001..004 / NTF-001: first invoice, Rent Board and one resident rent notice', async () => {
  const { item, result, quote } = await admitted();
  const invoices = await f.connection.db
    .select()
    .from(residentInvoices)
    .where(eq(residentInvoices.stayId, result.stayId));
  expect(invoices).toHaveLength(1);
  const invoice = invoices[0];
  if (!invoice) throw new Error('Invoice missing');
  expect(invoice.totalPaisa).toBe(BigInt(quote.price.monthlyRentPaisa));
  // RB-001..004: the billing month shows the Stay with the authoritative balance.
  const month = invoice.dueDate.slice(0, 7);
  const board = await f.application.inject({
    url: `/v1/branches/${item.branchId}/rent-board?month=${month}`,
    headers: bearer(f.ownerToken),
  });
  expect(board.statusCode, board.body).toBe(200);
  expect(board.headers['cache-control']).toBe('no-store');
  const page = rentBoardPageSchema.parse(board.json());
  const row = page.data.find((entry) => entry.stayId === result.stayId);
  expect(row).toMatchObject({
    residentId: result.residentId,
    bedLabel: 'A',
    invoices: [
      {
        invoiceId: invoice.id,
        dueDate: invoice.dueDate,
        graceDays: 3,
        totalPaisa: quote.price.monthlyRentPaisa,
        allocatedPaisa: 0,
        outstandingPaisa: quote.price.monthlyRentPaisa,
      },
    ],
  });
  expect(['issued', 'overdue']).toContain(row?.state);
  expect(JSON.stringify(page)).not.toContain('Fixture permanent address');
  const monthPage = async (value: string) =>
    rentBoardPageSchema.parse(
      (
        await f.application.inject({
          url: `/v1/branches/${item.branchId}/rent-board?month=${value}`,
          headers: bearer(f.ownerToken),
        })
      ).json(),
    );
  // A month before move-in has no row; an open Stay with no invoice is "not billed".
  expect((await monthPage('2026-09')).data).toEqual([]);
  expect((await monthPage('2030-01')).data).toEqual([
    expect.objectContaining({ stayId: result.stayId, state: 'not_billed', invoices: [] }),
  ]);
  // NTF-001: one recipient-free rent event, fanned out to the linked Customer only.
  const events = await f.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'resident.rent'),
        sql`${notificationOutbox.payload}->>'invoiceId' = ${invoice.id}`,
      ),
    );
  expect(events).toHaveLength(1);
  const event = events[0];
  if (!event) throw new Error('Rent event missing');
  const leaseToken = randomUUID(),
    leaseExpiresAt = new Date(Date.now() + 60000);
  const [leased] = await f.connection.db
    .update(notificationOutbox)
    .set({ leaseToken, leaseExpiresAt, attempts: 1 })
    .where(eq(notificationOutbox.id, event.id))
    .returning();
  if (!leased) throw new Error('Lease missing');
  const service = new NotificationService(new NotificationRepository(f.connection.db));
  await service.deliver(leased);
  await service.deliver(leased);
  const notices = await f.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'notification.create'),
        sql`${notificationOutbox.payload}->>'operationId' = ${event.id}`,
      ),
    );
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    recipientUserId: f.customerA,
    payload: { event: 'resident.rent_due', operationId: event.id },
  });
  const [source] = await f.connection.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, event.id));
  expect(source?.status).toBe('sent');
});
it('RB-001 / ACC-002: the Rent Board needs live finance_view in the exact branch', async () => {
  const item = await f.inventory(),
    foreign = await f.inventory(),
    assignmentId = randomUUID();
  const board = (branchId: string, token: string, query = '') =>
    f.application.inject({
      url: `/v1/branches/${branchId}/rent-board${query}`,
      headers: bearer(token),
    });
  expect((await board(item.branchId, f.customerAToken)).statusCode).toBe(403);
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  try {
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'stay_manage', grantedAt: f.now });
    expect((await board(item.branchId, f.customerBToken)).statusCode).toBe(403);
    await f.connection.db
      .insert(managerInventoryGrants)
      .values({ assignmentId, permission: 'finance_view', grantedAt: f.now });
    expect((await board(item.branchId, f.customerBToken)).statusCode).toBe(200);
    expect((await board(foreign.branchId, f.customerBToken)).statusCode).toBe(403);
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(
        and(
          eq(managerInventoryGrants.assignmentId, assignmentId),
          eq(managerInventoryGrants.permission, 'finance_view'),
        ),
      );
    expect((await board(item.branchId, f.customerBToken)).statusCode).toBe(403);
    expect((await board(item.branchId, f.ownerToken, '?month=2026-13')).statusCode).toBe(400);
    expect((await board(item.branchId, f.ownerToken, '?limit=26')).statusCode).toBe(400);
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
