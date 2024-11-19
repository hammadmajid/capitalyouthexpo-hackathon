import { expect, it } from 'vitest';
import { priceTermsSchema, quoteFeeTotals, snapshotBookingQuote } from './booking-quote.js';
const price = {
  monthlyRentPaisa: 1800000,
  depositPaisa: 1000000,
  fees: [
    { code: 'mess', cadence: 'monthly', amountPaisa: 300000 },
    { code: 'admission', cadence: 'one_time', amountPaisa: 100000 },
  ],
};
const policy = {
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
};
it('BKG-004: price/policy A remains after current Owner settings change to B', () => {
  const input = {
    version: 1,
    listing: {
      hostelName: 'Fixture hostel',
      branchName: 'Fixture branch',
      roomTypeName: 'Fixture type',
      roomLabel: '101',
      bedLabel: null,
    },
    currency: 'PKR',
    target: { kind: 'room', roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    range: { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' },
    price: structuredClone(price),
    policy: { ...policy },
    policyVersion: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    policyLineage: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    quotedAt: '2026-10-14T00:00:00Z',
  };
  const historical = snapshotBookingQuote(input);
  input.price.monthlyRentPaisa = 2000000;
  const firstFee = input.price.fees[0];
  if (!firstFee) throw new Error('Expected fee fixture');
  firstFee.amountPaisa = 400000;
  input.policy.holdSeconds = 600;
  expect(historical.price.monthlyRentPaisa).toBe(1800000);
  expect(historical.price.fees[0]?.amountPaisa).toBe(300000);
  expect(historical.policy.holdSeconds).toBe(0);
});
it('BKG-003/004: fee totals use exact integer paisa without a payment or proration assumption', () => {
  expect(quoteFeeTotals(price)).toEqual({
    monthlyTotalPaisa: 2100000,
    oneTimeTotalPaisa: 100000,
    depositPaisa: 1000000,
  });
  expect(quoteFeeTotals({ ...price, fees: [] }).monthlyTotalPaisa).toBe(1800000);
});
it.each([
  { ...price, monthlyRentPaisa: 1.1 },
  { ...price, depositPaisa: -1 },
  { ...price, fees: [price.fees[0], price.fees[0]] },
  { ...price, fees: [{ code: 'booking_confirmation', cadence: 'one_time', amountPaisa: 100 }] },
])('BKG-005: invalid money, duplicate or prohibited fee is rejected', (value) => {
  expect(() => priceTermsSchema.parse(value)).toThrow();
});
it('BKG-004: integer transport overflow fails instead of rounding', () => {
  expect(() =>
    quoteFeeTotals({
      monthlyRentPaisa: Number.MAX_SAFE_INTEGER,
      depositPaisa: 0,
      fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 1 }],
    }),
  ).toThrow('Money exceeds JSON safe integer range');
});
