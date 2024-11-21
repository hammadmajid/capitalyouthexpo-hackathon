import { expect, it } from 'vitest';
import { bookingQuoteSnapshotSchema } from '@hsm/contracts';
import {
  pakistanToday,
  requireStayPolicy,
  requireMatchingQuote,
  requireCustomerCancellation,
  bookingReference,
} from './policy.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function quote(
  policy: Record<string, unknown> = {},
  range = { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
) {
  return bookingQuoteSnapshotSchema.parse({
    version: 1,
    listing: {
      hostelName: 'Fixture hostel',
      branchName: 'Fixture branch',
      roomTypeName: 'Fixture type',
      roomLabel: '101',
      bedLabel: null,
    },
    currency: 'PKR',
    target: { kind: 'room', roomId: id },
    range,
    price: { monthlyRentPaisa: 1800000, depositPaisa: 0, fees: [] },
    policyVersion: id,
    policyLineage: [id],
    quotedAt: '2026-10-14T00:00:00Z',
    policy: {
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
      requiredDocuments: [],
      allowedStayUnits: ['day', 'week', 'month'],
      allowEvidenceReuse: true,
      documentReviewRequired: false,
      ...policy,
    },
  });
}
const now = new Date('2026-10-14T00:00:00Z');
it('BKG-006: server booking days use Pakistan midnight and reject an invalid clock', () => {
  expect(pakistanToday(new Date('2026-10-14T18:59:59Z'))).toBe('2026-10-14');
  expect(pakistanToday(new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15');
  expect(() => pakistanToday(new Date('invalid'))).toThrow();
});
it.each([
  { minimumStayDays: 31 },
  { maximumStayDays: 29 },
  { minimumAdvanceDays: 19 },
  { maximumAdvanceDays: 17 },
  { allowedStayUnits: ['week'] },
])('BKG-006: policy bounds and allowed units block incompatible stays', (policy) => {
  expect(() => requireStayPolicy(quote(policy), now)).toThrow();
});
it('BKG-006: exact minimum/maximum and explicit unlimited are accepted', () => {
  requireStayPolicy(
    quote({
      minimumStayDays: 30,
      maximumStayDays: 30,
      minimumAdvanceDays: 18,
      maximumAdvanceDays: 18,
    }),
    now,
  );
  requireStayPolicy(quote({ maximumStayDays: 'unlimited', allowedStayUnits: ['month'] }), now);
  requireStayPolicy(
    quote({ allowedStayUnits: ['week'] }, { moveInDate: '2026-11-01', moveOutDate: '2026-11-08' }),
    now,
  );
});
it('BKG-004: commercial policy lineage/target/range/fees must match; timestamp does not authorize terms', () => {
  const expected = quote();
  requireMatchingQuote(expected, { ...expected, quotedAt: '2026-10-15T00:00:00Z' });
  expect(() => requireMatchingQuote(expected, quote({ holdSeconds: 0 }))).toThrow();
  expect(() =>
    requireMatchingQuote(expected, {
      ...expected,
      price: { ...expected.price, monthlyRentPaisa: 2000000 },
    }),
  ).toThrow();
});
it('BKG-004: cancellation uses immutable cutoff and local move-in midnight', () => {
  const policy = quote().policy;
  requireCustomerCancellation(policy, '2026-11-01', new Date('2026-10-30T19:00:00Z'));
  expect(() =>
    requireCustomerCancellation(policy, '2026-11-01', new Date('2026-10-30T19:00:01Z')),
  ).toThrow();
  expect(() =>
    requireCustomerCancellation({ ...policy, cancellationAllowed: false }, '2026-11-01', now),
  ).toThrow();
  expect(bookingReference(id)).toBe('HSM-AAAAAAAAAAAA4AAA8AAAAAAAAAAAAAAA');
});
