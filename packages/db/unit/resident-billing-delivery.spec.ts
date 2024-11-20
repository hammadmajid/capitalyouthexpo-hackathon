import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { billingAgreementTermsSchema } from '@hsm/contracts';
import { deliverResidentBilling, residentBillingJobKey } from '../src/index.js';
import {
  residentCharges,
  residentLedger,
  residentInvoices,
  residentInvoiceCharges,
  residentBillingOrigins,
  residentBillingExecutions,
  residentBillingSchedules,
  notificationOutbox,
  hostelAuditLog,
} from '../src/schema/index.js';
import { billingDeliveryFixture } from './resident-billing-delivery.fixture.js';
import { rentTime, rentTerms, rentCharge, rentIds } from './resident-rent.fixture.js';
it('RENT-004 / AUD-004: one transaction records exact system sources, execution, schedule, audit and lease acknowledgement', async () => {
  const f = billingDeliveryFixture();
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  expect(f.writes.map((w) => w.table)).toEqual([
    residentCharges,
    residentLedger,
    residentInvoices,
    residentInvoiceCharges,
    residentBillingOrigins,
    residentBillingExecutions,
    residentBillingSchedules,
    notificationOutbox,
    hostelAuditLog,
    notificationOutbox,
  ]);
  // RENT-001 / NTF-001: the issued invoice announces rent due once, recipient-free.
  const execution0 = writeValue(f, residentBillingExecutions);
  expect(
    f.writes.find((w) => w.table === notificationOutbox && w.kind === 'insert')?.value,
  ).toMatchObject({
    eventType: 'resident.rent',
    channel: 'in_app',
    recipientUserId: null,
    payload: { event: 'rent.due', stayId: f.stay.id, invoiceId: execution0.invoiceId },
    dedupeKey: 'resident.rent:due:' + String(execution0.invoiceId),
  });
  const origin = writeValue(f, residentBillingOrigins),
    execution = writeValue(f, residentBillingExecutions);
  expect(execution).toMatchObject({
    outcome: 'posted',
    scheduleId: f.schedule.id,
    jobId: f.input.id,
    leaseToken: f.input.leaseToken,
    sourceKey: 'rent:2028-02-01:2028-03-01',
    amountPaisa: 1800001n,
  });
  expect(origin).toMatchObject({
    executionId: execution.id,
    chargeId: execution.chargeId,
    invoiceId: execution.invoiceId,
  });
  expect(writeValue(f, residentCharges).postedByUserId).toBeNull();
  expect(writeValue(f, residentInvoices).issuedByUserId).toBeNull();
  expect(writeValue(f, hostelAuditLog)).toMatchObject({
    organizationId: f.organizationId,
    actorUserId: null,
    actorRole: 'system',
    action: 'billing.execution.completed',
    targetId: execution.id,
  });
  expect(f.locks.map((row) => row.table)).toHaveLength(7);
  const ackPredicate = f.predicates.at(-1);
  if (!ackPredicate) throw new Error('Acknowledgement predicate missing');
  expect(new PgDialect().sqlToQuery(ackPredicate.value).params).toEqual([
    f.input.id,
    'pending',
    f.input.leaseToken,
    rentTime.toISOString(),
  ]);
  expect(f.writes.at(-1)?.value).toMatchObject({
    status: 'sent',
    leaseToken: null,
    leaseExpiresAt: null,
    lastError: null,
  });
});
it('RENT-004: only one bounded next job carries the exact new cursor and original configured due date', async () => {
  const f = billingDeliveryFixture({ stay: { expectedLeaveDate: '2028-04-01' } });
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  const jobs = f.writes.filter(
    (w) =>
      w.table === notificationOutbox &&
      w.kind === 'insert' &&
      w.value.eventType === 'resident.billing.period',
  );
  expect(jobs).toHaveLength(1);
  expect(
    f.writes.filter((w) => w.table === notificationOutbox && w.kind === 'insert'),
  ).toHaveLength(2);
  const payload = { scheduleId: f.schedule.id, version: 2, periodIndex: 1 };
  expect(jobs[0]?.value).toMatchObject({
    eventType: 'resident.billing.period',
    channel: 'internal',
    payload,
    dedupeKey: residentBillingJobKey(payload),
    nextAttemptAt: new Date('2028-03-05T00:00:00Z'),
  });
  expect(f.writes.find((w) => w.table === residentBillingSchedules)?.value).toMatchObject({
    state: 'active',
    version: 2,
    periodIndex: 1n,
    currentJobId: jobs[0]?.value.id,
  });
});
it('AUD-004: an exact previously human-posted period is recovered without relabelling its origin', async () => {
  const f = billingDeliveryFixture({ previous: [rentCharge()] });
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  expect(f.writes.find((w) => w.table === residentBillingExecutions)?.value).toMatchObject({
    outcome: 'existing',
    chargeId: rentIds.charge,
    invoiceId: rentIds.invoice,
  });
  expect(
    f.writes.some((w) =>
      new Set<unknown>([
        residentCharges,
        residentLedger,
        residentInvoices,
        residentBillingOrigins,
      ]).has(w.table),
    ),
  ).toBe(false);
});
it('PAY-008: explicit zero advances without a charge, invoice, origin, receipt or Paid status', async () => {
  const terms = billingAgreementTermsSchema.parse({ ...rentTerms, rentAmountPaisa: 0 });
  const f = billingDeliveryFixture({ terms });
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  expect(f.writes.map((w) => w.table)).toEqual([
    residentBillingExecutions,
    residentBillingSchedules,
    hostelAuditLog,
    notificationOutbox,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    outcome: 'no_charge',
    amountPaisa: 0n,
    chargeId: null,
    invoiceId: null,
  });
  expect(f.writes[1]?.value).toMatchObject({ state: 'exhausted', version: 2, periodIndex: 1n });
});
it('RENT-004: unresolved manual proration pauses without advancing an unbilled period', async () => {
  const terms = billingAgreementTermsSchema.parse({
    ...rentTerms,
    policy: { ...rentTerms.policy, proration: { kind: 'manual' } },
  });
  const f = billingDeliveryFixture({ terms, stay: { moveInDate: '2028-02-10' } });
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  expect(f.writes.map((w) => w.table)).toEqual([
    residentBillingExecutions,
    residentBillingSchedules,
    hostelAuditLog,
    notificationOutbox,
  ]);
  expect(f.writes[0]?.value).toMatchObject({
    outcome: 'manual_required',
    amountPaisa: null,
    chargeId: null,
    invoiceId: null,
  });
  expect(f.writes[1]?.value).toMatchObject({
    state: 'manual_required',
    version: 2,
    periodIndex: 0n,
    currentJobId: null,
    nextRunAt: null,
  });
});
it('RENT-004: exhausted coverage records no_period and never checks out actual occupancy', async () => {
  const f = billingDeliveryFixture({ periodIndex: 1 });
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  expect(f.writes[0]?.value).toMatchObject({
    outcome: 'no_period',
    sourceKey: null,
    dueDate: null,
    amountPaisa: null,
    chargeId: null,
    invoiceId: null,
  });
  expect(f.writes[1]?.value).toMatchObject({ state: 'exhausted', version: 2, periodIndex: 1n });
  expect(f.writes).toHaveLength(4);
});
it.each([
  { state: 'stopped' as const, version: 2, currentJobId: null, nextRunAt: null },
  { version: 2 },
  { periodIndex: 1n },
  { currentJobId: '00000000-0000-4000-8000-000000000001' },
])(
  'RENT-004: obsolete work %# only records audit/execution and acknowledges its own lease',
  async (schedule) => {
    const f = billingDeliveryFixture({ schedule });
    await deliverResidentBilling(f.database, f.input, () => rentTime);
    expect(f.writes.map((w) => w.table)).toEqual([
      residentBillingExecutions,
      hostelAuditLog,
      notificationOutbox,
    ]);
    expect(f.writes[0]?.value).toMatchObject({
      outcome: 'obsolete',
      sourceKey: null,
      amountPaisa: null,
      chargeId: null,
      invoiceId: null,
    });
  },
);
it('NTF-002: committed work is a no-op under the real default clock too', async () => {
  const f = billingDeliveryFixture({ job: { status: 'sent' } });
  await deliverResidentBilling(f.database, f.input);
  expect(f.writes).toEqual([]);
});

function writeValue(f: ReturnType<typeof billingDeliveryFixture>, table: unknown) {
  const write = f.writes.find((row) => row.table === table);
  if (!write) throw new Error('Expected billing write missing');
  return write.value;
}
