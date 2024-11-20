import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { recoverResidentBilling } from '../src/resident-billing-recovery.js';
import {
  notificationOutbox,
  hostelAuditLog,
  residentBillingExecutions,
} from '../src/schema/index.js';
import {
  billingDeliveryFixture,
  type BillingFixtureOptions,
} from './resident-billing-delivery.fixture.js';
import { rentTime } from './resident-rent.fixture.js';
function fixture(options: BillingFixtureOptions = {}) {
  const f = billingDeliveryFixture({
    ...options,
    job: {
      status: 'dead',
      attempts: 5,
      lastError: 'DELIVERY_FAILED',
      leaseToken: null,
      leaseExpiresAt: null,
      ...options.job,
    },
  });
  return {
    ...f,
    recovery: {
      branchId: f.schedule.branchId,
      jobId: f.storedJob.id,
      expectedAttempts: 5,
      incident: 'INC-013',
    },
  };
}
it('AUD-013: default maintenance clock rejects future occupancy without granting a budget', async () => {
  const f = fixture({ stay: { checkedInAt: new Date(Date.now() + 60_000) } });
  await expect(recoverResidentBilling(f.database, f.recovery)).rejects.toThrow(
    'Billing recovery unavailable',
  );
  expect(f.writes).toHaveLength(0);
});
it('AUD-013 / RENT-004: explicit recovery audits the exhausted budget without changing financial or schedule sources', async () => {
  const f = fixture();
  await expect(recoverResidentBilling(f.database, f.recovery, () => rentTime)).resolves.toEqual({
    status: 'pending',
  });
  expect(f.writes).toHaveLength(2);
  expect(f.writes[0]).toMatchObject({
    kind: 'insert',
    table: hostelAuditLog,
    value: {
      actorUserId: null,
      actorRole: 'system',
      action: 'billing.job.recovery.requested',
      targetId: f.storedJob.id,
      before: { status: 'dead', attempts: 5, lastError: 'DELIVERY_FAILED' },
      after: { incident: 'INC-013', scheduleId: f.schedule.id, scheduleVersion: 1, periodIndex: 0 },
    },
  });
  expect(f.writes[1]).toMatchObject({
    kind: 'update',
    table: notificationOutbox,
    value: { status: 'pending', attempts: 0, lastError: null, nextAttemptAt: rentTime },
  });
});
const unavailable: BillingFixtureOptions[] = [
  { missingJob: true },
  { missingTarget: true },
  { missingStay: true },
  { lockedSchedule: null },
  { lockedJob: null },
  ...(['organization', 'brand', 'branch'] as const).map((archived) => ({ archived })),
  { stay: { state: 'check_in_ready' } },
  { stay: { checkedInAt: null } },
  { stay: { checkedInAt: new Date(rentTime.getTime() + 1) } },
  { stay: { closedAt: rentTime } },
  { lockedSchedule: { branchId: randomUUID() } },
  { lockedSchedule: { stayId: randomUUID() } },
  { lockedSchedule: { agreementId: randomUUID() } },
  { schedule: { state: 'stopped' } },
  { schedule: { currentJobId: null } },
  { schedule: { nextRunAt: null } },
  { schedule: { nextRunAt: new Date(rentTime.getTime() + 1) } },
  { schedule: { version: 2 } },
  { schedule: { periodIndex: 1n } },
  { job: { status: 'pending' } },
  { job: { attempts: 6 } },
  { job: { leaseToken: randomUUID() } },
  { job: { leaseExpiresAt: rentTime } },
  { job: { lastError: 'INVALID_MESSAGE' } },
  { job: { lastError: null } },
  { job: { channel: 'email' } },
  { job: { eventType: 'different.event' } },
  { job: { recipientUserId: randomUUID() } },
  { job: { recipientAddress: 'fixture@example.invalid' } },
  { job: { dedupeKey: 'wrong' } },
  { job: { payload: {} } },
  { lockedJob: { payload: {} } },
  { lockedJob: { payload: { scheduleId: randomUUID(), version: 1, periodIndex: 0 } } },
];
it.each(unavailable)(
  'AUD-013 / SEC-003: unavailable or changed work %# is rejected without writes',
  async (options) => {
    const f = fixture(options);
    await expect(recoverResidentBilling(f.database, f.recovery, () => rentTime)).rejects.toThrow(
      'Billing recovery unavailable',
    );
    expect(f.writes).toHaveLength(0);
  },
);
it('AUD-013 / ACC-004: existing execution blocks any recovery budget', async () => {
  const f = fixture();
  f.rows.set(residentBillingExecutions, [{ id: randomUUID() }]);
  await expect(recoverResidentBilling(f.database, f.recovery, () => rentTime)).rejects.toThrow(
    'Billing recovery unavailable',
  );
  expect(f.writes).toHaveLength(0);
});
it.each([hostelAuditLog, notificationOutbox])(
  'AUD-013 / ACC-004: required recovery write failure %# propagates',
  async (table) => {
    const f = fixture({ fail: { table, kind: table === hostelAuditLog ? 'insert' : 'update' } });
    await expect(recoverResidentBilling(f.database, f.recovery, () => rentTime)).rejects.toThrow(
      'Fixture write failed',
    );
  },
);
it('AUD-013: exhausted claim classification is also recoverable', async () => {
  const f = fixture({ job: { lastError: 'DELIVERY_EXHAUSTED' } });
  await expect(recoverResidentBilling(f.database, f.recovery, () => rentTime)).resolves.toEqual({
    status: 'pending',
  });
});
it.each([{ expectedAttempts: 4 }, { incident: 'private text' }, { actorUserId: randomUUID() }])(
  'AUD-013 / SEC-003: invalid explicit maintenance scope %# cannot begin recovery',
  async (changes) => {
    const f = fixture();
    await expect(
      recoverResidentBilling(f.database, { ...f.recovery, ...changes }, () => rentTime),
    ).rejects.toThrow();
    expect(f.writes).toHaveLength(0);
  },
);
