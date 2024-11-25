import { randomUUID } from 'node:crypto';
import { bookingQuoteSnapshotSchema, billingPolicyVersionSchema } from '@hsm/contracts';
import { billingPolicyFixture } from './billing-policy.fixture.js';
export const admissionIds = {
  branch: randomUUID(),
  brand: randomUUID(),
  type: randomUUID(),
  room: randomUUID(),
  bed: randomUUID(),
  version: randomUUID(),
  other: randomUUID(),
};
export const admissionContext = {
  branchId: admissionIds.branch,
  brandId: admissionIds.brand,
  roomTypeId: admissionIds.type,
  target: { kind: 'bed' as const, roomId: admissionIds.room, bedId: admissionIds.bed },
  range: { moveInDate: '2028-02-01', moveOutDate: '2028-03-01' },
  policyVersionId: admissionIds.version,
};
export function admissionQuote() {
  return bookingQuoteSnapshotSchema.parse({
    version: 1,
    currency: 'PKR',
    listing: {
      hostelName: 'Original hostel',
      branchName: 'Original branch',
      roomTypeName: 'Original type',
      roomLabel: '101',
      bedLabel: 'A',
    },
    target: admissionContext.target,
    range: admissionContext.range,
    price: {
      monthlyRentPaisa: 1800001,
      depositPaisa: 1000002,
      fees: [
        { code: 'mess', cadence: 'monthly', amountPaisa: 300003 },
        { code: 'admission', cadence: 'one_time', amountPaisa: 100004 },
      ],
    },
    policy: {
      bookingMode: 'instant',
      holdSeconds: 0,
      requestExpirySeconds: 3600,
      requestReservesInventory: true,
      minimumStayDays: 1,
      maximumStayDays: 'unlimited',
      minimumAdvanceDays: 0,
      maximumAdvanceDays: 90,
      customerSelectsInventory: true,
      cancellationAllowed: true,
      cancellationCutoffHours: 24,
      allowedStayUnits: ['day', 'week', 'month'],
      allowEvidenceReuse: true,
      documentReviewRequired: false,
      requiredDocuments: [],
    },
    policyVersion: admissionIds.other,
    policyLineage: [admissionIds.other],
    quotedAt: '2028-01-01T00:00:00.000Z',
  });
}
export function admissionVersion() {
  return billingPolicyVersionSchema.parse({
    id: admissionIds.version,
    level: 'branch',
    scopeId: admissionIds.branch,
    createdAt: '2028-01-01T00:00:00.000Z',
    policy: {
      ...billingPolicyFixture,
      feeBilling: {
        oneTimeDueOffsetDays: 2,
        monthly: {
          cycle: { kind: 'calendar_month', dueDay: 10 },
          proration: { kind: 'calendar_days', rounding: 'half_up' },
        },
      },
    },
  });
}
