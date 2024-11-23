import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  billingPolicies,
  residents,
  stays,
  stayAssignments,
  stayAgreements,
  stayHistory,
  residentCharges,
  residentInvoices,
  residentLedger,
  residentBillingSchedules,
  residentPayments,
  residentReceipts,
  hostelAuditLog,
  notificationOutbox,
  idempotencyKeys,
} from '@hsm/db';
import {
  billingAgreementTermsSchema,
  manualAdmissionCommandSchema,
  type ManualAdmissionResult,
} from '@hsm/contracts';
import type { phaseTwoFixture } from './phase-two-fixture.js';
type Fixture = Awaited<ReturnType<typeof phaseTwoFixture>>;
export async function manualAdmissionFixture(f: Fixture, userId?: string | null) {
  const target = await f.inventory(),
    policyId = randomUUID();
  const terms = billingAgreementTermsSchema.parse({
    policyVersionId: policyId,
    currency: 'PKR',
    fees: [],
    catalog: [],
    rentAmountPaisa: 1800001,
    depositPaisa: 1000001,
    policy: {
      cycle: { kind: 'calendar_month', dueDay: 5 },
      proration: { kind: 'full_period' },
      graceDays: 0,
      lateCharge: { kind: 'disabled' },
      noticeDays: 15,
      earlyCheckout: { kind: 'manual' },
      allowOpenEnded: false,
      customCharges: 'disabled',
    },
  });
  await f.connection.db.insert(billingPolicies).values({
    id: policyId,
    branchId: target.branchId,
    policy: terms.policy,
    isCurrent: true,
    createdByUserId: f.ownerId,
  });
  let resident:
    { kind: 'new'; profile: { displayName: string } } | { kind: 'existing'; residentId: string } = {
    kind: 'new',
    profile: { displayName: 'Offline admission' },
  };
  if (userId !== undefined) {
    const id = randomUUID();
    await f.connection.db.insert(residents).values({
      id,
      branchId: target.branchId,
      userId,
      displayName: 'Existing admission',
      createdByUserId: f.ownerId,
    });
    resident = { kind: 'existing', residentId: id };
  }
  const input = manualAdmissionCommandSchema.parse({
    manual: {
      resident,
      target: { kind: 'bed', roomId: target.roomId, bedId: target.seatId },
      period: { moveInDate: '2026-10-04', expectedLeaveDate: '2026-11-04' },
      terms,
    },
    initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
  });
  return { ...target, input };
}
export type ManualFixture = Awaited<ReturnType<typeof manualAdmissionFixture>>;
export function admitResident(
  f: Fixture,
  item: ManualFixture,
  key = randomUUID(),
  token = f.ownerToken,
  body: unknown = item.input,
) {
  return f.application.inject({
    method: 'POST',
    url: '/v1/branches/' + item.branchId + '/stays/manual',
    headers: {
      authorization: 'Bearer ' + token,
      'idempotency-key': key,
      'content-type': 'application/json',
    },
    payload: JSON.stringify(body),
  });
}
export async function admissionRows(f: Fixture, branchId: string) {
  const db = f.connection.db;
  return {
    residents: await db.select().from(residents).where(eq(residents.branchId, branchId)),
    stays: await db.select().from(stays).where(eq(stays.branchId, branchId)),
    assignments: await db
      .select()
      .from(stayAssignments)
      .where(eq(stayAssignments.branchId, branchId)),
    agreements: await db.select().from(stayAgreements).where(eq(stayAgreements.branchId, branchId)),
    history: await db.select().from(stayHistory).where(eq(stayHistory.branchId, branchId)),
    charges: await db.select().from(residentCharges).where(eq(residentCharges.branchId, branchId)),
    invoices: await db
      .select()
      .from(residentInvoices)
      .where(eq(residentInvoices.branchId, branchId)),
    ledger: await db.select().from(residentLedger).where(eq(residentLedger.branchId, branchId)),
    schedules: await db
      .select()
      .from(residentBillingSchedules)
      .where(eq(residentBillingSchedules.branchId, branchId)),
    payments: await db
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.branchId, branchId)),
    receipts: await db
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.branchId, branchId)),
    audits: await db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.branchId, branchId),
          eq(hostelAuditLog.action, 'resident.manual.admitted'),
        ),
      ),
  };
}
export async function admissionEvents(f: Fixture, result: ManualAdmissionResult) {
  return f.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'resident.lifecycle'),
        sql`${notificationOutbox.payload}->>'stayId' = ${result.stayId}`,
      ),
    );
}
export async function admissionCache(f: Fixture, key: string) {
  return f.connection.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
}
export async function rejectAdmissionSource(f: Fixture) {
  await f.connection.db.execute(
    sql`create function hsm_test_admission_source_failure() returns trigger language plpgsql as $$ begin if NEW.event_type = 'resident.lifecycle' then raise exception 'Fixture admission source failure' using errcode='P0001'; end if; return NEW; end; $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_test_admission_source_failure before insert on notification_outbox for each row execute function hsm_test_admission_source_failure()`,
  );
}
export async function restoreAdmissionSource(f: Fixture) {
  await f.connection.db.execute(
    sql`drop trigger if exists hsm_test_admission_source_failure on notification_outbox`,
  );
  await f.connection.db.execute(sql`drop function if exists hsm_test_admission_source_failure()`);
}
