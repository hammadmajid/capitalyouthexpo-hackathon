import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deliverResidentBilling } from '../src/index.js';
import {
  billingDeliveryFixture,
  type BillingFixtureOptions,
} from './resident-billing-delivery.fixture.js';
import { rentTime } from './resident-rent.fixture.js';
const later = new Date(rentTime.getTime() + 1);
it.each([
  { job: { status: 'failed' } },
  { job: { status: 'sent' } },
  { job: { status: 'dead' } },
  { job: { leaseToken: null } },
  { job: { leaseToken: randomUUID() } },
  { job: { leaseExpiresAt: null } },
  { job: { leaseExpiresAt: new Date(rentTime.getTime() + 61000) } },
  { job: { nextAttemptAt: later } },
  { missingJob: true },
] satisfies BillingFixtureOptions[])(
  'SEC-003: unavailable, replaced, future or terminal work %# cannot write or acknowledge',
  async (options) => {
    const f = billingDeliveryFixture(options);
    await deliverResidentBilling(f.database, f.input, () => rentTime);
    expect(f.writes).toEqual([]);
  },
);
it('SEC-003: an exactly matched but expired lease cannot write', async () => {
  const f = billingDeliveryFixture();
  f.input.leaseExpiresAt = rentTime;
  f.storedJob.leaseExpiresAt = rentTime;
  await deliverResidentBilling(f.database, f.input, () => rentTime);
  expect(f.writes).toEqual([]);
});
it.each([
  { job: { channel: 'email' } },
  { job: { eventType: 'files.scan' } },
  { job: { recipientUserId: randomUUID() } },
  { job: { recipientAddress: 'private@example.test' } },
  { job: { dedupeKey: 'wrong' } },
  { job: { payload: {} } },
] satisfies BillingFixtureOptions[])(
  'SEC-003: changed persisted message identity %# fails closed',
  async (options) => {
    const f = billingDeliveryFixture(options);
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'INVALID_MESSAGE',
    );
    expect(f.writes).toEqual([]);
  },
);
it('SEC-003: valid but different persisted payload cannot borrow another delivery lease', async () => {
  const f = billingDeliveryFixture();
  f.storedJob.payload = { ...f.input.payload, version: 2 };
  await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
    'INVALID_MESSAGE',
  );
  expect(f.writes).toEqual([]);
});
it('SEC-003: a changed caller dedupe key cannot acknowledge valid stored work', async () => {
  const f = billingDeliveryFixture();
  f.input.dedupeKey = 'wrong';
  await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
    'INVALID_MESSAGE',
  );
  expect(f.writes).toEqual([]);
});
it.each([
  { inputVersion: 2 },
  { periodIndex: 1, schedule: { periodIndex: 0n } },
] satisfies BillingFixtureOptions[])(
  'SEC-003: future revision/cursor %# cannot be called obsolete',
  async (options) => {
    const f = billingDeliveryFixture(options);
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'INVALID_MESSAGE',
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { missingTarget: true },
  { missingStay: true },
  { lockedSchedule: null },
  { stay: { id: randomUUID() } },
  { stay: { branchId: randomUUID() } },
  { lockedSchedule: { id: randomUUID() } },
  { lockedSchedule: { branchId: randomUUID() } },
  { lockedSchedule: { stayId: randomUUID() } },
  { lockedSchedule: { agreementId: randomUUID() } },
] satisfies BillingFixtureOptions[])(
  'SEC-003: exact persisted target binding rejects %#',
  async (options) => {
    const f = billingDeliveryFixture(options);
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'INVALID_MESSAGE',
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { archived: 'organization' },
  { archived: 'brand' },
  { archived: 'branch' },
  { stay: { state: 'check_in_ready' } },
  { stay: { checkedInAt: null } },
  { stay: { checkedInAt: later } },
  { stay: { closedAt: rentTime } },
  { stay: { state: 'completed' } },
] satisfies BillingFixtureOptions[])(
  'STAY-003 / RENT-004: unavailable current residency %# cannot create future charges',
  async (options) => {
    const f = billingDeliveryFixture(options);
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'Billing stay unavailable',
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([null, later])(
  'RENT-004: active schedule due instant %s cannot be bypassed through outbox timing',
  async (nextRunAt) => {
    const f = billingDeliveryFixture({ schedule: { nextRunAt } });
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'Billing schedule not due',
    );
    expect(f.writes).toEqual([]);
  },
);
it.each([
  { eventType: 'other' },
  { channel: 'email' },
  { recipientAddress: 'private@example.test' },
  { leaseToken: null },
  { leaseExpiresAt: null },
  { payload: { scheduleId: randomUUID(), version: 1, periodIndex: 0, amountPaisa: 0 } },
])('SEC-003: invalid billing delivery envelope %# is rejected before locks', async (change) => {
  const f = billingDeliveryFixture();
  await expect(
    deliverResidentBilling(f.database, { ...f.input, ...change }, () => rentTime),
  ).rejects.toThrow('INVALID_MESSAGE');
  expect(f.locks).toEqual([]);
  expect(f.writes).toEqual([]);
});
