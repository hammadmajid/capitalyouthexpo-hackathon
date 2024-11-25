import { stayNoticeInputSchema, stayNoticeResultSchema } from '@hsm/contracts';
import type { Actor } from '../../src/authorization/store.js';
export const noticeIds = {
  user: '10000000-0000-4000-8000-000000000001',
  session: '10000000-0000-4000-8000-000000000002',
  stay: '10000000-0000-4000-8000-000000000003',
  branch: '10000000-0000-4000-8000-000000000004',
  policy: '10000000-0000-4000-8000-000000000005',
  notice: '10000000-0000-4000-8000-000000000006',
  key: '10000000-0000-4000-8000-000000000007',
};
export const noticeActor: Actor = { userId: noticeIds.user, sessionId: noticeIds.session };
export const noticeNow = new Date('2028-02-27T06:00:00.000Z');
export const noticeInput = stayNoticeInputSchema.parse({
  expectedVersion: 1,
  requestedCheckoutDate: '2028-03-01',
  isEmergency: true,
  reason: 'Travel plans changed',
});
export const noticeResult = stayNoticeResultSchema.parse({
  noticeId: noticeIds.notice,
  stayId: noticeIds.stay,
  state: 'notice_given',
  version: 2,
  plan: {
    submittedOn: '2028-02-27',
    requestedCheckoutDate: '2028-03-01',
    earliestCompliantCheckoutDate: '2028-03-13',
    requiredNoticeDays: 15,
    providedNoticeDays: 3,
    shortfallDays: 12,
    isEmergency: true,
    policyVersionId: noticeIds.policy,
  },
});
