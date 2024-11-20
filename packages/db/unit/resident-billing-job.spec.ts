import { expect, it } from 'vitest';
import {
  RESIDENT_BILLING_EVENT,
  residentBillingJobSchema,
  residentBillingJobKey,
} from '../src/resident-billing-job.js';
const scheduleId = '019a0000-abcd-7000-8000-000000000001';
const input = { scheduleId, version: 1, periodIndex: 0 };
it('RENT-004: bounded job has only its persisted schedule, version and cursor', () => {
  expect(RESIDENT_BILLING_EVENT).toBe('resident.billing.period');
  expect(residentBillingJobSchema.parse(input)).toEqual(input);
  expect(residentBillingJobKey(input)).toBe(`resident.billing:${scheduleId}:v1:p0`);
});
it('RENT-004: canonical identifiers preserve the same deterministic work identity', () => {
  expect(
    residentBillingJobSchema.parse({ ...input, scheduleId: scheduleId.toUpperCase() }),
  ).toEqual(input);
  expect(
    residentBillingJobKey({ periodIndex: 0, version: 1, scheduleId: scheduleId.toUpperCase() }),
  ).toBe(residentBillingJobKey(input));
});
it('RENT-004: PostgreSQL version and safe integer cursor maxima remain exact', () => {
  const maximum = { ...input, version: 2147483647, periodIndex: Number.MAX_SAFE_INTEGER };
  expect(residentBillingJobSchema.parse(maximum)).toEqual(maximum);
  expect(residentBillingJobKey(maximum)).toBe(
    `resident.billing:${scheduleId}:v2147483647:p9007199254740991`,
  );
});
it('RENT-004: changing schedule, revision or period changes deduplication identity', () => {
  expect(
    new Set(
      [
        input,
        { ...input, scheduleId: '019a0000-abcd-7000-8000-000000000002' },
        { ...input, version: 2 },
        { ...input, periodIndex: 1 },
      ].map(residentBillingJobKey),
    ).size,
  ).toBe(4);
});
it.each([
  undefined,
  null,
  [],
  '',
  1,
  {},
  { version: 1, periodIndex: 0 },
  { scheduleId, periodIndex: 0 },
  { scheduleId, version: 1 },
])('SEC-003: malformed or missing work envelope %# fails closed', (value) => {
  expect(residentBillingJobSchema.safeParse(value).success).toBe(false);
  expect(() => residentBillingJobKey(value)).toThrow();
});
it.each(['not-a-uuid', '', ' ' + scheduleId, scheduleId + ' ', 12, null])(
  'SEC-003: schedule identity %# is strict without coercion',
  (value) => {
    expect(residentBillingJobSchema.safeParse({ ...input, scheduleId: value }).success).toBe(false);
  },
);
it.each([0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER, NaN, Infinity, '1', null, true])(
  'SEC-003: invalid revision %# is rejected',
  (version) => {
    expect(residentBillingJobSchema.safeParse({ ...input, version }).success).toBe(false);
  },
);
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0', null, false])(
  'SEC-003: invalid cursor %# is rejected',
  (periodIndex) => {
    expect(residentBillingJobSchema.safeParse({ ...input, periodIndex }).success).toBe(false);
  },
);
it.each([
  'branchId',
  'stayId',
  'agreementId',
  'actorUserId',
  'authorizedByUserId',
  'amountPaisa',
  'dueDate',
  'receiptId',
  'paid',
  'leaseToken',
  'leaseExpiresAt',
  'eventType',
])('SEC-003 / PAY-008: queue cannot inject %s as authority', (key) => {
  expect(residentBillingJobSchema.safeParse({ ...input, [key]: 'untrusted' }).success).toBe(false);
  expect(() => residentBillingJobKey({ ...input, [key]: 'untrusted' })).toThrow();
});
