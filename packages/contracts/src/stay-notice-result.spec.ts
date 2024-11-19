import { expect, it } from 'vitest';
import { stayNoticePlanSchema, stayNoticeResultSchema } from './stay-notice-result.js';
const id = '10000000-0000-4000-8000-000000000001';
const plan = {
  submittedOn: '2028-02-27',
  requestedCheckoutDate: '2028-03-01',
  earliestCompliantCheckoutDate: '2028-03-13',
  requiredNoticeDays: 15,
  providedNoticeDays: 3,
  shortfallDays: 12,
  isEmergency: true,
  policyVersionId: id,
};
function result() {
  return { noticeId: id, stayId: id, state: 'notice_given', version: 2, plan };
}
it('OUT-001/002: original leap-day timing and real shortfall remain explicit without imposing a fee', () => {
  expect(stayNoticeResultSchema.parse(result())).toEqual(result());
});
it('OUT-002: adequate notice retains zero shortfall without waiving the original policy', () => {
  expect(
    stayNoticePlanSchema.parse({
      ...plan,
      requestedCheckoutDate: '2028-03-15',
      providedNoticeDays: 17,
      shortfallDays: 0,
      isEmergency: false,
    }),
  ).toMatchObject({ requiredNoticeDays: 15, providedNoticeDays: 17, shortfallDays: 0 });
});
it.each([
  { submittedOn: '2028-02-30' },
  { requestedCheckoutDate: '2028-02-26', providedNoticeDays: 0 },
  { earliestCompliantCheckoutDate: '2028-03-12' },
  { requiredNoticeDays: 14 },
  { providedNoticeDays: 2 },
  { shortfallDays: 0 },
  { requiredNoticeDays: Number.MAX_SAFE_INTEGER, shortfallDays: Number.MAX_SAFE_INTEGER - 3 },
  { providedNoticeDays: -1 },
  { shortfallDays: 1.5 },
  { isEmergency: 'true' },
  { policyVersionId: 'bad' },
])('OUT-001/002: inconsistent or malformed notice disclosure is rejected: %j', (change) => {
  expect(stayNoticePlanSchema.safeParse({ ...plan, ...change }).success).toBe(false);
});
it.each([
  { noticeId: 'bad' },
  { stayId: 'bad' },
  { state: 'checked_out' },
  { state: 'active' },
  { version: 1 },
  { version: 2147483648 },
  { version: 2.5 },
])('OUT-006: malformed notice result never fabricates a lifecycle transition: %j', (change) => {
  expect(stayNoticeResultSchema.safeParse({ ...result(), ...change }).success).toBe(false);
});
it.each([
  'releasedInventory',
  'paymentId',
  'feePaisa',
  'actorUserId',
  'customerCnic',
  'privateDocumentUrl',
])('OUT-006 / SEC-003: result cannot introduce unauthorized %s', (field) => {
  expect(stayNoticeResultSchema.safeParse({ ...result(), [field]: field }).success).toBe(false);
});
it('OUT-001: nested timing also rejects undisclosed settlement or inventory facts', () => {
  expect(
    stayNoticeResultSchema.safeParse({ ...result(), plan: { ...plan, checkoutComplete: true } })
      .success,
  ).toBe(false);
});
