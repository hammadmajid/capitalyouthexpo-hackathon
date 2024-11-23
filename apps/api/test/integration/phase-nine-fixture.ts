import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  billingPolicies,
  deliverResidentBilling,
  notificationOutbox,
  residentBillingSchedules,
  residentCharges,
  residentInvoices,
  sessions,
  stays,
} from '@hsm/db';
import {
  billingPolicyVersionSchema,
  bookingAdmissionResultSchema,
  type TransportBillingPolicy,
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
export type Fixture = Awaited<ReturnType<typeof phaseTwoFixture>>;
// Billing executions may not be dated after the database's real clock, so the scenario
// timeline starts in the past and only moves forward.
export const today = '2026-06-25';
// Lifecycle acts need real elapsed time between assignments; each step advances a minute.
export function lifecycleHarness(options?: { preScannedInventory: true }) {
  let at = new Date(today + 'T10:00:00Z');
  let f: Fixture | undefined;
  const fixture = () => {
    if (!f) throw new Error('Fixture not started');
    return f;
  };
  const tick = () => {
    at = new Date(at.getTime() + 60000);
  };
  const clock = () => new Date(at.getTime());
  const date = () => at.toISOString().slice(0, 10);
  const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
  const send = (url: string, payload: Record<string, unknown>, token?: string, key?: string) => {
    tick();
    return fixture().application.inject({
      method: 'POST',
      url,
      headers: { ...bearer(token ?? fixture().ownerToken), 'Idempotency-Key': key ?? randomUUID() },
      payload,
    });
  };
  const ok = async (url: string, payload: Record<string, unknown>, token?: string) => {
    const response = await send(url, payload, token);
    expect(response.statusCode, response.body).toBeLessThan(300);
    return response.json() as Record<string, unknown>;
  };
  const get = (url: string, token?: string) =>
    fixture().application.inject({ url, headers: bearer(token ?? fixture().ownerToken) });
  return {
    start: async () => {
      f = await phaseTwoFixture(clock(), clock, options);
      return f;
    },
    close: () => f?.close(),
    fixture,
    clock,
    date,
    // The clock only moves forward; schedule and lease guards require monotonic time.
    // The auth fixture issues sessions on its fixed start time while lifecycle acts check them
    // against this clock, so a time jump extends the fixture users' live sessions with it.
    async moveTo(iso: string) {
      const next = new Date(iso);
      if (next > at) at = next;
      const current = fixture();
      await current.connection.db
        .update(sessions)
        .set({ expiresAt: new Date(at.getTime() + 30 * 86400000) })
        .where(
          and(
            inArray(sessions.userId, [current.ownerId, current.customerA, current.customerB]),
            isNull(sessions.revokedAt),
          ),
        );
    },
    send,
    ok,
    get,
    async configureTransport(
      branchId: string,
      transportBilling: TransportBillingPolicy = {
        offer: { mode: 'separate', monthlyChargePaisa: 310000 },
        dueDay: 5,
        refundable: false,
        proration: { kind: 'calendar_days', rounding: 'half_up' },
      },
    ) {
      const db = fixture().connection.db;
      const [current] = await db
        .select({ id: billingPolicies.id })
        .from(billingPolicies)
        .where(
          and(
            eq(billingPolicies.branchId, branchId),
            eq(billingPolicies.isCurrent, true),
            isNull(billingPolicies.roomTypeId),
          ),
        );
      if (!current) throw new Error('Current branch billing policy missing');
      const response = await fixture().application.inject({
        method: 'PUT',
        url: `/v1/branches/${branchId}/billing-policy/transport`,
        headers: { ...bearer(fixture().ownerToken), 'Idempotency-Key': randomUUID() },
        payload: { policyVersionId: current.id, transportBilling },
      });
      expect(response.statusCode, response.body).toBe(200);
      return billingPolicyVersionSchema.parse(response.json());
    },
    async admitted(
      policy: Record<string, unknown>,
      moveOutDate: string,
      beforeQuote?: (branchId: string) => Promise<void>,
    ) {
      const item = await fixture().inventory(),
        policyVersionId = randomUUID();
      await fixture().connection.db.insert(billingPolicies).values({
        id: policyVersionId,
        branchId: item.branchId,
        policy,
        isCurrent: true,
        createdByUserId: fixture().ownerId,
      });
      await beforeQuote?.(item.branchId);
      const quote = bookingQuoteSnapshotSchema.parse(
        await ok(`/v1/marketplace/${item.branchId}/quote`, {
          target: { kind: 'bed', roomId: item.roomId, bedId: item.seatId },
          range: { moveInDate: date(), moveOutDate },
        }),
      );
      const booking = bookingSummarySchema.parse(
        await ok(
          `/v1/marketplace/${item.branchId}/bookings`,
          { quote, documents: [], permanentAddress: 'Fixture permanent address' },
          fixture().customerAToken,
        ),
      );
      const stay = bookingAdmissionResultSchema.parse(
        await ok(`/v1/branches/${item.branchId}/stays/bookings/${booking.id}/check-in`, {
          policyVersionId,
          initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
        }),
      );
      const base = `/v1/branches/${item.branchId}/stays/${stay.stayId}`;
      return { item, stay, base, quote, rent: quote.price.monthlyRentPaisa };
    },
    async version(stayId: string) {
      const [row] = await fixture()
        .connection.db.select({ version: stays.version })
        .from(stays)
        .where(eq(stays.id, stayId));
      return row?.version ?? 0;
    },
    // RENT-004: lease the persisted job exactly as the worker does, then deliver it.
    async deliver(jobId: string | null) {
      if (!jobId) throw new Error('No billing job to deliver');
      const db = fixture().connection.db;
      const [message] = await db
        .update(notificationOutbox)
        .set({
          attempts: 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Math.max(Date.now(), at.getTime()) + 600000),
        })
        .where(eq(notificationOutbox.id, jobId))
        .returning();
      if (!message) throw new Error('Billing job missing');
      tick();
      await deliverResidentBilling(db, message, clock);
    },
    async schedules(stayId: string) {
      return fixture()
        .connection.db.select()
        .from(residentBillingSchedules)
        .where(eq(residentBillingSchedules.stayId, stayId))
        .orderBy(asc(residentBillingSchedules.createdAt), asc(residentBillingSchedules.id));
    },
    async charges(stayId: string, kind: 'rent' | 'transport' = 'rent') {
      return fixture()
        .connection.db.select()
        .from(residentCharges)
        .where(and(eq(residentCharges.stayId, stayId), eq(residentCharges.kind, kind)))
        .orderBy(asc(residentCharges.periodStart));
    },
    async invoices(stayId: string) {
      return fixture()
        .connection.db.select()
        .from(residentInvoices)
        .where(eq(residentInvoices.stayId, stayId))
        .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id));
    },
  };
}
export const fullPeriod = {
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'full_period' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: false,
  customCharges: 'disabled',
};
export const dailyProration = {
  ...fullPeriod,
  proration: { kind: 'calendar_days', rounding: 'half_up' },
};
export const withTransportFees = {
  ...fullPeriod,
  feeBilling: {
    oneTimeDueOffsetDays: 0,
    monthly: {
      cycle: { kind: 'calendar_month', dueDay: 5 },
      proration: { kind: 'calendar_days', rounding: 'half_up' },
    },
  },
};
