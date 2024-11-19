import { expect, it } from 'vitest';
import {
  bookingPolicySchema,
  bookingPolicyOverrideSchema,
  resolveBookingPolicy,
} from './booking-policy.js';
const base = {
  bookingMode: 'request',
  holdSeconds: 600,
  requestExpirySeconds: 3600,
  requestReservesInventory: true,
  minimumStayDays: 1,
  maximumStayDays: 365,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 90,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 24,
  allowedStayUnits: ['day', 'week', 'month'],
  allowEvidenceReuse: true,
  documentReviewRequired: false,
  requiredDocuments: ['cnic'],
};
const limits = {
  maximumHoldSeconds: 3600,
  maximumActiveHolds: 3,
  maximumRequestExpirySeconds: 86400,
  maximumAdvanceDays: 365,
  maximumFiniteStayDays: 730,
};
it('CHG-007: defaults and ordered hostel/branch/room overrides resolve without mutating parents', () => {
  expect(resolveBookingPolicy(base, [], limits)).toEqual(base);
  const value = resolveBookingPolicy(
    base,
    [{ holdSeconds: 1200 }, { holdSeconds: 1800 }, { holdSeconds: 900 }],
    limits,
  );
  expect(value.holdSeconds).toBe(900);
  expect(base.holdSeconds).toBe(600);
  expect(
    resolveBookingPolicy(base, [{ holdSeconds: null }, { holdSeconds: undefined }], limits)
      .holdSeconds,
  ).toBe(600);
});
it('CHG-007: CNIC optional and explicit unlimited stay are preserved', () => {
  const value = resolveBookingPolicy(
    base,
    [
      {
        requiredDocuments: [],
        maximumStayDays: 'unlimited',
        holdSeconds: 0,
        bookingMode: 'instant',
      },
    ],
    limits,
  );
  expect(value.requiredDocuments).toEqual([]);
  expect(value.maximumStayDays).toBe('unlimited');
  expect(value.bookingMode).toBe('instant');
  expect(value.holdSeconds).toBe(0);
});
it.each([
  { holdSeconds: 3601 },
  { requestExpirySeconds: 86401 },
  { maximumAdvanceDays: 366 },
  { maximumStayDays: 731 },
])('BKG-006: Owner cannot exceed configured platform bounds', (override) => {
  expect(() => resolveBookingPolicy(base, [override], limits)).toThrow(
    'Booking policy exceeds platform limits',
  );
});
it.each([
  { maximumStayDays: 0 },
  { minimumStayDays: 366 },
  { minimumAdvanceDays: 91 },
  { requiredDocuments: ['cnic', 'cnic'] },
  { requiredDocuments: ['unsafe_private_record'] },
  { disableAudit: true },
  { holdSeconds: -1 },
  { holdSeconds: 1.5 },
])('SEC-001: invalid policy or security override is rejected', (override) => {
  expect(() => resolveBookingPolicy(base, [override], limits)).toThrow();
});
it('SEC-001: branches resolve independently and no default is invented', () => {
  expect(() => resolveBookingPolicy({}, [], limits)).toThrow();
  expect(() => bookingPolicySchema.parse({ ...base, extra: true })).toThrow();
  expect(() => bookingPolicyOverrideSchema.parse({ unknown: null })).toThrow();
  expect(resolveBookingPolicy(base, [{ requiredDocuments: [] }], limits).requiredDocuments).toEqual(
    [],
  );
  expect(resolveBookingPolicy(base, [], limits).requiredDocuments).toEqual(['cnic']);
});
